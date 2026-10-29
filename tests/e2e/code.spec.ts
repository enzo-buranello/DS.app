import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// L'agent Développement est simulé : il note les changements reçus et écrit
// une page HTML pour l'aperçu.
test('code : langage, génération incrémentale, aperçu, retouche ciblée', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const dir = path.join(root, 'site');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_PICK_DIRS: dir,
      STUDIO_FAKE_AGENT: path.resolve('tests/fixtures/design.json'),
      STUDIO_FAKE_GENERATE: '1',
    },
  });
  const page = await app.firstWindow();
  const json = async (t: string, f: string) =>
    JSON.parse(await readFile(path.join(dir, 'code', t, f), 'utf8'));
  const exists = (f: string) =>
    stat(f).then(
      () => true,
      () => false,
    );

  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boulangerie');
  await page.getByRole('button', { name: 'Créer' }).click();
  await page.getByLabel('Instruction').fill('Une boulangerie');
  await page.getByLabel('Instruction').press('Enter');
  await page.getByRole('button', { name: 'Garder' }).click();

  await page.getByRole('button', { name: 'Code' }).click();
  await expect(page.getByRole('button', { name: 'Générer' })).toBeDisabled();
  await page.getByLabel('Langage').selectOption({ label: 'React + Tailwind' });
  await expect(page.getByText('Jamais généré')).toBeVisible();

  // Première génération : tout, dans l'ordre ; le fichier écrit est marqué.
  await page.getByRole('button', { name: 'Générer' }).click();
  const tree = page.getByRole('list', { name: 'Fichiers' });
  await expect(tree.getByRole('button', { name: /GENERATED/ })).toBeVisible();
  await expect(tree.getByLabel('Modifié')).toHaveCount(1);
  const first = await json('react', 'GENERATED.json');
  expect(first.tokens.changed).toEqual(['all']);
  expect(first.components.changed).toContain('button');

  // Rien n'a changé : l'agent n'est pas appelé.
  await rm(path.join(dir, 'code/react/GENERATED.json'));
  await page.getByRole('button', { name: 'Générer' }).click();
  await expect(page.getByRole('button', { name: 'Générer' })).toBeEnabled();
  expect(await exists(path.join(dir, 'code/react/GENERATED.json'))).toBe(false);

  // Une page ajoutée : seule elle est régénérée.
  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('button', { name: 'Ajouter une page' }).first().click();
  await page.getByRole('button', { name: 'Code' }).click();
  await page.getByRole('button', { name: 'Générer' }).click();
  await expect
    .poll(() => exists(path.join(dir, 'code/react/GENERATED.json')))
    .toBe(true);
  const next = await json('react', 'GENERATED.json');
  expect(next.pages.changed).toEqual(['page-1']);
  expect(next.tokens.changed).toEqual([]);

  // HTML/CSS : aperçu servi en local, au centre.
  await page.getByLabel('Langage').selectOption({ label: 'HTML/CSS' });
  await page.getByRole('button', { name: 'Générer' }).click();
  const preview = page.frameLocator('iframe.preview');
  await expect(preview.locator('h1')).toHaveText('Accueil');

  // Lecture d'un fichier, Échap revient à l'aperçu.
  await tree.getByRole('button', { name: 'index.html' }).click();
  await expect(page.locator('.code-view')).toContainText('<h1>Accueil</h1>');
  await page.keyboard.press('Escape');
  await expect(preview.locator('h1')).toBeVisible();

  // Ciblage : un clic dans l'aperçu vise l'élément, la retouche ne vaut que pour lui.
  const bar = page.getByLabel('Instruction');
  await preview.locator('h1').click();
  await expect(bar).toHaveAttribute('placeholder', 'Modifier « Accueil »');
  await bar.fill('Titre court');
  await bar.press('Enter');
  await expect(preview.locator('h1')).toHaveText('Titre court');
  const edit = await json('html', 'EDIT.json');
  expect(edit.scope.selector).toBe('h1');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(preview.locator('h1')).toHaveText('Accueil');
  expect(await exists(path.join(dir, 'code/html/EDIT.json'))).toBe(false);
  await app.close();
});
