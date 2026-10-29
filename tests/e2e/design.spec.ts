import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// L'agent est remplacé par un design system déjà généré (tests/fixtures).
test('design system : saisie à la main, IA, annuler puis garder', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const dir = path.join(root, 'site');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_PICK_DIRS: dir,
      STUDIO_FAKE_AGENT: path.resolve('tests/fixtures/design.json'),
    },
  });
  const page = await app.firstWindow();
  const saved = async () =>
    JSON.parse(await readFile(path.join(dir, '.studio/project.json'), 'utf8'));

  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boulangerie');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(
    page.getByRole('button', { name: 'Importer de Figma' }),
  ).toBeVisible();

  // À la main : une couleur, sa valeur claire.
  await page.getByRole('button', { name: 'Ajouter Couleurs' }).click();
  await page.getByLabel('Clair hex').fill('#c8803e');
  await page.getByLabel('Clair hex').blur();
  await expect
    .poll(async () => (await saved()).foundations.colors['couleurs-1']?.light)
    .toBe('#c8803e');

  // IA : appliquée sur le canevas, puis annulée.
  const bar = page.getByLabel('Instruction');
  await bar.fill('Une boulangerie artisanale');
  await bar.press('Enter');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(
    page.getByRole('button', { name: 'Bouton', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => Object.keys((await saved()).components))
    .toEqual([]);

  // IA : gardée ; le bouton s'affiche et ses états se choisissent.
  await bar.fill('Une boulangerie artisanale');
  await bar.press('Enter');
  await page.getByRole('button', { name: 'Garder' }).click();
  await expect
    .poll(async () => Object.keys((await saved()).components).length)
    .toBe(8);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Commander Bouton' })
    .click();
  await page.getByLabel('État').selectOption('hover');
  await expect(page.getByRole('button', { name: 'Supprimer' })).toBeVisible();

  // Dossier : renommer « Primaire/Croûte » range la couleur dans « Primaire ».
  await page.getByRole('button', { name: 'Croûte (primaire)' }).first().click();
  const nom = page.getByLabel('Paramètres').getByLabel('Nom');
  await nom.fill('Primaire/Croûte');
  await nom.press('Enter');
  const folder = page.locator('.panel.left details', { hasText: 'Primaire' });
  await expect(folder).toHaveAttribute('open', '');
  await expect(folder.getByRole('button', { name: 'Croûte' })).toBeVisible();
  await expect(
    page.locator('.board-folder h4', { hasText: 'Primaire' }),
  ).toBeVisible();

  // Petit écran : tout reste dans la fenêtre, la liste défile.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 640),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = document
          .querySelector('.panel.right')!
          .getBoundingClientRect();
        const left = document.querySelector('.panel.left')!;
        return (
          panel.right <= innerWidth &&
          panel.bottom <= innerHeight &&
          left.scrollHeight > left.clientHeight
        );
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Thème sombre' }).click();
  await expect(page.locator('.board')).toHaveAttribute('data-theme', 'dark');
  await app.close();
});
