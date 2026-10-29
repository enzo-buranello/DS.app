import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('pages : construire, régler par format, image, composant', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const dir = path.join(root, 'site');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_PICK_DIRS: dir,
      STUDIO_PICK_FILES: path.resolve('build/icon.png'),
      STUDIO_FAKE_AGENT: path.resolve('tests/fixtures/design.json'),
    },
  });
  const page = await app.firstWindow();
  const saved = async () =>
    JSON.parse(await readFile(path.join(dir, '.studio/project.json'), 'utf8'));
  const settings = page.getByLabel('Paramètres');
  const tree = page.locator('.tree');

  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boulangerie');
  await page.getByRole('button', { name: 'Créer' }).click();
  await page.getByLabel('Instruction').fill('Une boulangerie');
  await page.getByLabel('Instruction').press('Enter');
  await page.getByRole('button', { name: 'Garder' }).click();

  // Page blanche, un bloc, un texte dans le bloc.
  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('button', { name: 'Ajouter une page' }).first().click();
  await page.getByRole('button', { name: 'Ajouter Bloc' }).click();
  await page.getByRole('button', { name: 'Ajouter Texte' }).click();
  await settings.getByLabel('Texte').fill('Bonjour');
  await expect(page.locator('.artboard')).toContainText('Bonjour');
  await expect
    .poll(
      async () =>
        (await saved()).pages['page-1']?.root.children[0].children[0].text,
    )
    .toBe('Bonjour');

  // Valeur propre au mobile, puis rétablie.
  await tree.getByRole('button', { name: 'Bloc' }).click();
  await page.getByRole('button', { name: 'Mobile' }).click();
  await settings
    .getByLabel('Fond', { exact: true })
    .selectOption('surface-alt');
  await expect
    .poll(
      async () =>
        (await saved()).pages['page-1'].root.children[0].style.mobile
          ?.background,
    )
    .toBe('surface-alt');
  await settings.getByRole('button', { name: 'Rétablir Fond' }).click();
  await expect
    .poll(
      async () =>
        (await saved()).pages['page-1'].root.children[0].style.mobile
          ?.background,
    )
    .toBe(undefined);
  await page.getByRole('button', { name: 'Bureau' }).click();

  // Glisser le texte hors du bloc.
  const from = tree.getByRole('button', { name: 'Bonjour' }).locator('..');
  const to = tree.getByRole('button', { name: 'Bloc' }).locator('..');
  const box = (await to.boundingBox())!;
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const at = { dataTransfer, clientX: box.x + 40, clientY: box.y + 2 };
  await from.dispatchEvent('dragstart', { dataTransfer });
  await to.dispatchEvent('dragover', at);
  await to.dispatchEvent('drop', at);
  await expect
    .poll(async () =>
      (await saved()).pages['page-1'].root.children.map(
        (n: { kind: string }) => n.kind,
      ),
    )
    .toEqual(['text', 'box']);

  // Image locale, copiée dans le projet et affichée.
  await page.getByRole('button', { name: 'Ajouter Image' }).click();
  await settings.getByRole('button', { name: 'Choisir' }).click();
  await expect
    .poll(() =>
      page
        .locator('.artboard img')
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);

  // Instance de composant, puis suppression au clavier.
  await page.getByLabel('Ajouter Composant').selectOption('button');
  await expect(page.locator('.artboard')).toContainText('Commander');
  await page.locator('.artboard').getByText('Commander').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.artboard')).not.toContainText('Commander');

  // Modifier un composant : son texte, puis son fond au survol.
  await page.getByRole('button', { name: 'Design system' }).click();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Commander Bouton' })
    .click();
  await settings.getByRole('button', { name: 'Modifier' }).click();
  await tree.getByRole('button', { name: 'Libellé' }).click();
  await settings.getByLabel('Texte').fill('Réserver');
  await tree.getByRole('button', { name: 'Bouton' }).click();
  await settings.getByLabel('État').selectOption('hover');
  await settings.getByLabel('Fond', { exact: true }).selectOption('secondary');
  await expect
    .poll(async () => {
      const b = (await saved()).components.button;
      return [b.root.children[0].text, b.states.hover.root.background];
    })
    .toEqual(['Réserver', 'secondary']);
  await app.close();
});
