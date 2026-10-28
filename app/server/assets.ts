import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteBytes } from './files.js';
import { StudioError } from './store.js';

// Images des remplissages (fond image) : fichiers privés de .ds-studio/assets,
// nommés par leur empreinte. Le contenu est vérifié (signature du format),
// jamais servi depuis un chemin fourni par le client.
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const FORMATS = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
} as const;
export type AssetType = keyof typeof FORMATS;
const NAME = /^[a-f0-9]{32}\.(png|jpg|webp)$/;
const TYPE_OF = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export class AssetStore {
  private dir: string;
  constructor(directory: string) {
    this.dir = path.join(directory, 'assets');
  }
  async save(mediaType: AssetType, base64: string) {
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES)
      throw new StudioError('Image vide ou trop lourde (2 Mo maximum).', 413);
    const f = FORMATS[mediaType];
    if (!f.magic.every((b, i) => bytes[i] === b))
      throw new StudioError('Le contenu ne correspond pas au format annoncé.');
    if (
      mediaType === 'image/webp' &&
      bytes.subarray(8, 12).toString() !== 'WEBP'
    )
      throw new StudioError('Le contenu ne correspond pas au format annoncé.');
    const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${f.ext}`;
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    await atomicWriteBytes(path.join(this.dir, name), bytes);
    return { asset: name };
  }
  async read(name: string) {
    if (!NAME.test(name)) throw new StudioError('Image inconnue.', 404);
    const file = path.join(this.dir, name);
    try {
      const stat = await fs.lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > MAX_ASSET_BYTES
      )
        throw new Error();
      return {
        bytes: await fs.readFile(file),
        type: TYPE_OF[name.split('.')[1] as keyof typeof TYPE_OF],
      };
    } catch {
      throw new StudioError('Image inconnue.', 404);
    }
  }
}
