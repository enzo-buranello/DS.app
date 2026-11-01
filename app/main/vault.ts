// Chiffrement du trousseau du système, partagé par le compte global et les
// clés d'API des projets. Le format existant ne change pas : base64.

const electron = () => import('electron');

export async function encrypt(text: string): Promise<string> {
  const { safeStorage } = await electron();
  if (!safeStorage.isEncryptionAvailable()) throw new Error('auth:vault');
  return safeStorage.encryptString(text).toString('base64');
}

export async function decrypt(text: string): Promise<string> {
  const { safeStorage } = await electron();
  if (!safeStorage.isEncryptionAvailable()) throw new Error('auth:vault');
  try {
    return safeStorage.decryptString(Buffer.from(text, 'base64'));
  } catch {
    throw new Error('auth:vault');
  }
}
