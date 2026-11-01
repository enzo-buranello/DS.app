import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Écran de connexion : compte global, deux moyens. Le navigateur n'est pas
// testé ici (il ouvre un vrai navigateur).

const start = async (mode: string) => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-auth-'));
  const dir = path.join(root, 'site');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_PICK_DIRS: dir,
      STUDIO_FAKE_AUTH: mode,
    },
  });
  return { app, dir, page: await app.firstWindow() };
};

test('sans compte : connexion seule, projets inaccessibles', async () => {
  const { app, page } = await start('out');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Projets' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Que voulez-vous créer ?' }),
  ).toHaveCount(0);
  await app.close();
});

test('clé acceptée : l’accueil s’ouvre', async () => {
  const { app, page } = await start('accept');
  await page.getByRole('button', { name: 'DeepSeek' }).click();
  await page.getByRole('textbox', { name: 'Clé' }).fill('sk-test');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Que voulez-vous créer ?' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Projets' })).toBeVisible();
  await app.close();
});

test('clé refusée : on reste sur l’écran', async () => {
  const { app, page } = await start('refuse');
  await page.getByRole('button', { name: 'DeepSeek' }).click();
  await page.getByRole('textbox', { name: 'Clé' }).fill('sk-test');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Clé refusée')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await app.close();
});

test('Claude : navigateur puis code', async () => {
  const { app, page } = await start('accept');
  await page.getByRole('button', { name: 'Claude' }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('textbox', { name: 'Code' }).fill('code#fake');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Que voulez-vous créer ?' }),
  ).toBeVisible();
  await app.close();
});

test('code refusé : on reste sur l’écran', async () => {
  const { app, page } = await start('refuse');
  await page.getByRole('button', { name: 'Claude' }).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('textbox', { name: 'Code' }).fill('code');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Code refusé')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await app.close();
});

test('déconnecter : retour à la connexion', async () => {
  const { app, page } = await start('accept');
  await page.getByRole('button', { name: 'DeepSeek' }).click();
  await page.getByRole('textbox', { name: 'Clé' }).fill('sk-test');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Que voulez-vous créer ?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Projets' }).hover();
  await page.getByRole('menuitem', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boutique');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByRole('button', { name: 'Boutique' })).toBeVisible();
  await page.getByRole('button', { name: 'Paramètres' }).click();
  await page.getByRole('button', { name: 'Déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await app.close();
});
