import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('pages : cadre libre, valeurs libres ou tokens, composants', async () => {
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
  const pageRoot = async () => (await saved()).pages['page-1']?.root;
  const settings = page.getByLabel('Paramètres');
  const tree = page.locator('.tree');
  const add = async (item: string) => {
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.getByRole('menuitem', { name: item, exact: true }).click();
  };

  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boulangerie');
  await page.getByRole('button', { name: 'Créer' }).click();
  await page.getByLabel('Instruction').fill('Une boulangerie');
  await page.getByLabel('Instruction').press('Enter');
  await page.getByRole('button', { name: 'Garder' }).click();

  // La page est un cadre : ses réglages s'affichent d'emblée.
  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('button', { name: 'Ajouter une page' }).first().click();
  await expect(settings.getByLabel('Nom de la page')).toHaveValue('Page 1');
  await settings.getByLabel('Token Fond').selectOption('surface');
  await expect
    .poll(async () => (await pageRoot())?.style?.desktop.background)
    .toBe('surface');
  await settings.getByRole('button', { name: 'Détacher Fond' }).click();
  await expect
    .poll(async () => (await pageRoot())?.style?.desktop.background)
    .toMatch(/^#/);

  // Rectangle placé librement : déplacé puis redimensionné à la souris.
  await add('Rectangle');
  await expect(page.locator('.sel-box')).toBeVisible();
  const r = (await page.locator('.sel-box').boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 120, r.y + r.height / 2 + 60, {
    steps: 5,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await pageRoot())?.children?.[0]?.style?.desktop.x)
    .toBeGreaterThan(60);
  const h = (await page.locator('.handle').boundingBox())!;
  await page.mouse.move(h.x + 2, h.y + 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 80, h.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await pageRoot())?.children?.[0]?.style?.desktop.width)
    .toBeGreaterThan(160);
  await settings.getByLabel('Largeur', { exact: true }).fill('300');
  await expect
    .poll(async () => (await pageRoot())?.children?.[0]?.style?.desktop.width)
    .toBe(300);

  // Un bloc en colonne, un texte dedans.
  await tree.getByRole('button', { name: 'Page', exact: true }).click();
  await add('Bloc');
  await add('Texte');
  await settings.getByLabel('Texte', { exact: true }).fill('Bonjour');
  await expect(page.locator('.artboard')).toContainText('Bonjour');
  await expect(tree.locator('[aria-current="true"]')).toContainText('Bonjour');

  // Valeur propre au mobile, puis rétablie.
  await tree.getByRole('button', { name: 'Bloc' }).click();
  await page.getByRole('button', { name: 'Mobile' }).click();
  await settings.getByLabel('Token Fond').selectOption('surface-alt');
  await expect
    .poll(
      async () => (await pageRoot())?.children?.[1]?.style?.mobile?.background,
    )
    .toBe('surface-alt');
  await settings.getByRole('button', { name: 'Rétablir Fond' }).click();
  await expect
    .poll(
      async () => (await pageRoot())?.children?.[1]?.style?.mobile?.background,
    )
    .toBe(undefined);
  await page.getByRole('button', { name: 'Bureau' }).click();

  // Glisser le texte hors du bloc, dans la page.
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
      (await pageRoot())?.children?.map((n: { kind: string }) => n.kind),
    )
    .toEqual(['shape', 'text', 'box']);

  // Image importée, copiée dans le projet et affichée.
  await tree.getByRole('button', { name: 'Page', exact: true }).click();
  await add('Image');
  await expect
    .poll(() =>
      page
        .locator('.artboard img')
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);

  // Instance de composant, sélectionnée sur le canevas puis supprimée.
  await add('Bouton');
  await page.locator('.artboard').getByText('Commander').click();
  await expect(page.locator('.sel-tag')).toHaveText('Bouton');
  await page.keyboard.press('Delete');
  await expect(page.locator('.artboard')).not.toContainText('Commander');

  // « Modifier » ouvre le composant, racine sélectionnée.
  await page.getByRole('button', { name: 'Design system' }).click();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Commander Bouton' })
    .click();
  await settings.getByRole('button', { name: 'Modifier' }).click();
  await expect(settings.getByLabel('Nom du composant')).toHaveValue('Bouton');
  await expect(page.getByLabel('Composant modifié')).toHaveValue('button');
  await tree.getByRole('button', { name: 'Libellé' }).click();
  await settings.getByLabel('Texte', { exact: true }).fill('Réserver');
  await tree.getByRole('button', { name: 'Bouton' }).click();
  await page.getByLabel('État').selectOption('hover');
  await settings.getByLabel('Token Fond').selectOption('secondary');
  await page.getByLabel('État').selectOption('default');
  await add('Badge');
  await expect
    .poll(async () => {
      const b = (await saved()).components.button;
      return [
        b.root.children[0].text,
        b.states.hover.root.background,
        b.root.children.at(-1).component,
      ];
    })
    .toEqual(['Réserver', 'secondary', 'badge']);
  await app.close();
});
