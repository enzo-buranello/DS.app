import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// L'app est lancée avec un dossier de données isolé ; les dossiers « choisis »
// sont fournis à l'avance à la place de la boîte de dialogue native.
test('créer un projet, le renommer, changer de dossier, revenir', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const first = path.join(root, 'site');
  const moved = path.join(root, 'site-2');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_PICK_DIRS: [first, moved].join(path.delimiter),
    },
  });
  const page = await app.firstWindow();

  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boutique');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('button', { name: 'Boutique' })).toBeVisible();
  for (const label of ['Design system', 'Pages', 'Contenus', 'Code'])
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  const saved = JSON.parse(
    await readFile(path.join(first, '.studio/project.json'), 'utf8'),
  );
  expect(saved.name).toBe('Boutique');

  await page.getByRole('button', { name: 'Paramètres' }).click();
  await page.getByLabel('Nom').fill('Atelier');
  await page.getByLabel('Nom').blur();
  await page.getByRole('button', { name: 'Changer' }).click();
  await expect(page.locator('.path')).toHaveText(moved);
  await page.getByRole('button', { name: 'Fermer' }).click();

  await page.getByRole('button', { name: 'Atelier' }).click();
  await page.getByRole('main').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Atelier' }).click();
  await page.getByRole('menuitem', { name: 'Tous les projets' }).click();
  await expect(page.getByRole('button', { name: /Atelier/ })).toHaveCount(1);
  await app.close();
});
