import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// L'agent Développement est simulé : il note les changements reçus.
test('code : cibles, génération incrémentale, état', async () => {
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
  const changes = async (t: string) =>
    JSON.parse(
      await readFile(path.join(dir, 'code', t, 'GENERATED.json'), 'utf8'),
    );
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
  await page.getByLabel('React + Tailwind').check();
  await page.getByLabel('HTML/CSS').check();
  await expect(page.locator('.targets li')).toHaveCount(2);
  await expect(page.locator('.targets')).toContainText('Jamais généré');

  // Première génération : tout, dans l'ordre.
  await page.getByRole('button', { name: 'Générer' }).click();
  await expect(page.locator('.targets')).toContainText(' fichier');
  const first = await changes('react');
  expect(first.tokens.changed).toEqual(['all']);
  expect(first.components.changed).toContain('button');
  expect(await exists(path.join(dir, 'code/html/GENERATED.json'))).toBe(true);

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
  const next = await changes('react');
  expect(next.pages.changed).toEqual(['page-1']);
  expect(next.tokens.changed).toEqual([]);
  expect(next.components.changed).toEqual([]);
  await app.close();
});
