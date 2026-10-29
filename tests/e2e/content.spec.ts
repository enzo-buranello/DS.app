import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('contenus : collection, tableau, liste et champ liés', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const dir = path.join(root, 'site');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_PICK_DIRS: dir,
      STUDIO_PICK_FILES: path.resolve('build/icon.png'),
    },
  });
  const page = await app.firstWindow();
  const saved = async () =>
    JSON.parse(await readFile(path.join(dir, '.studio/project.json'), 'utf8'));
  const settings = page.getByLabel('Paramètres');
  const table = page.locator('.content-table');

  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boulangerie');
  await page.getByRole('button', { name: 'Créer' }).click();

  // Une collection « Produits » : Nom, Prix (nombre), Photo (image).
  await page.getByRole('button', { name: 'Contenus' }).click();
  await page
    .getByRole('button', { name: 'Ajouter une collection' })
    .first()
    .click();
  await settings.getByLabel('Nom de la collection').fill('Produits');
  await settings.getByLabel('Nom de la collection').press('Tab');
  await page.getByRole('button', { name: 'Ajouter un champ' }).click();
  await settings.getByLabel('Nom du champ').fill('Prix');
  await settings.getByLabel('Nom du champ').press('Tab');
  await settings.getByLabel('Type').selectOption('number');
  await page.getByRole('button', { name: 'Ajouter un champ' }).click();
  await settings.getByLabel('Type').selectOption('image');

  // Deux éléments saisis dans le tableau.
  for (const [nom, prix] of [
    ['Pain de campagne', '4,8'],
    ['Croissant', '1.4'],
  ]) {
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    const row = table.locator('tbody tr').last();
    await row.locator('input').nth(0).fill(nom);
    await row.locator('input').nth(1).fill(prix.replace(',', '.'));
  }
  await table.locator('tbody tr').first().locator('.cell-image').click();
  await expect
    .poll(async () => (await saved()).collections['collection-1']?.items)
    .toMatchObject([
      {
        values: {
          nom: 'Pain de campagne',
          'champ-2': 4.8,
          'champ-3': expect.stringMatching(/^assets\//),
        },
      },
      { values: { nom: 'Croissant', 'champ-2': 1.4 } },
    ]);

  // Une page avec une liste de produits : un élément par produit.
  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('button', { name: 'Ajouter une page' }).first().click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Liste Produits' }).click();
  const board = page.locator('.artboard');
  await expect(board).toContainText('Pain de campagne');
  await expect(board).toContainText('Croissant');

  // Le texte du modèle se lie au prix.
  await page.locator('.tree').getByRole('button', { name: 'Texte' }).click();
  await settings.getByLabel('Champ').selectOption('collection-1:champ-2');
  await expect(board).toContainText('4,8');
  await expect(board).toContainText('1,4');

  // Champ et collection utilisés : suppression impossible.
  await page.getByRole('button', { name: 'Contenus' }).click();
  await table.getByRole('button', { name: 'Prix' }).click();
  await expect(
    settings.getByRole('button', { name: 'Supprimer' }),
  ).toBeDisabled();
  await app.close();
});
