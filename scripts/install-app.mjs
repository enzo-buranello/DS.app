// npm run app — installe DS-Studio comme une app du Mac (~/Applications).
// Une copie d'Electron porte le nom et l'icône de DS-Studio ; son dossier
// Resources/app pointe vers ce projet : l'app démarre sur le dernier build,
// « npm run build » suffit ensuite. --force réinstalle.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

if (process.platform !== 'darwin') {
  console.error('DS-Studio.app : macOS seulement.');
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, '..');
const electron = path.join(root, 'node_modules/electron/dist/Electron.app');
const target = path.join(homedir(), 'Applications', 'DS-Studio.app');
const run = (cmd, ...args) => execFileSync(cmd, args, { stdio: 'inherit' });

if (!existsSync(path.join(root, 'dist/main.js'))) {
  console.error('Aucun build : lancez d’abord « npm run build ».');
  process.exit(1);
}
// Déjà installée sur la même version d'Electron : rien à refaire. La
// réinstaller changerait sa signature, et macOS redemanderait ses accès.
const version = (app) =>
  execFileSync(
    'plutil',
    [
      '-extract',
      'CFBundleVersion',
      'raw',
      path.join(app, 'Contents/Info.plist'),
    ],
    { encoding: 'utf8' },
  ).trim();
if (
  existsSync(target) &&
  !process.argv.includes('--force') &&
  version(target) === version(electron)
) {
  console.log(`DS-Studio est déjà installée : ${target}`);
  process.exit(0);
}
rmSync(target, { recursive: true, force: true });
run('mkdir', '-p', path.dirname(target));
run('ditto', electron, target);
const res = path.join(target, 'Contents/Resources');
symlinkSync(root, path.join(res, 'app'));
copyFileSync(
  path.join(root, 'build/icon.icns'),
  path.join(res, 'electron.icns'),
);
const plist = path.join(target, 'Contents/Info.plist');
for (const [key, value] of [
  ['CFBundleName', 'DS-Studio'],
  ['CFBundleDisplayName', 'DS-Studio'],
  ['CFBundleIdentifier', 'local.ds-studio.app'],
])
  run('plutil', '-replace', key, '-string', value, plist);
// Signature locale : la copie modifiée reste lançable par macOS.
run('codesign', '--force', '--deep', '-s', '-', target);
// Le Finder et le Dock relisent l'icône.
run('touch', target);
console.log(`DS-Studio installée : ${target}`);
