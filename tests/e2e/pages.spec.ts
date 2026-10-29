import {
  test,
  expect,
  _electron as electron,
  type Page,
} from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const center = async (page: Page, selector: string) => {
  const r = (await page.locator(selector).first().boundingBox())!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const dragBy = async (
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  during?: () => Promise<void>,
) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await during?.();
  await page.mouse.up();
};

test('pages : ajouter, glisser, éditer au clic, composant et instance', async () => {
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
      STUDIO_FAKE_NAME: 'Carte maison',
    },
  });
  const page = await app.firstWindow();
  const saved = async () =>
    JSON.parse(await readFile(path.join(dir, '.studio/project.json'), 'utf8'));
  const pageRoot = async () => (await saved()).pages['page-1']?.root;
  const kids = async () => (await pageRoot())?.children ?? [];
  const settings = page.getByLabel('Paramètres');
  const tree = page.locator('.tree');
  const pageSettings = settings.getByLabel('Nom de la page');
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
  await expect(pageSettings).toHaveValue('Page 1');
  await settings.getByLabel('Token Fond').selectOption('surface');
  await settings.getByRole('button', { name: 'Détacher Fond' }).click();
  await expect
    .poll(async () => (await pageRoot())?.style?.desktop.background)
    .toMatch(/^#/);

  // 1. Ajouter : sélectionné, prêt à glisser, panneau inchangé.
  await add('Rectangle');
  await expect(page.locator('.sel-tag')).toHaveText('Rectangle');
  await expect(pageSettings).toBeVisible();

  // 2. Glisser dans un cadre libre : au pixel, puis aimanté au bord.
  await dragBy(page, await center(page, '.sel-box'), 120, 60);
  await expect
    .poll(async () => (await kids())[0]?.style?.desktop.x)
    .toBeGreaterThan(60);
  await expect(pageSettings).toBeVisible();
  const zoom = await page
    .locator('.artboard')
    .evaluate((e) => parseFloat(getComputedStyle(e).zoom));
  const x0 = (await kids())[0].style.desktop.x;
  await dragBy(
    page,
    await center(page, '.sel-box'),
    -x0 * zoom + 3,
    0,
    async () => {
      await expect(page.locator('.guide').first()).toBeVisible();
    },
  );
  await expect.poll(async () => (await kids())[0]?.style?.desktop.x).toBe(0);

  // 3. Un clic ouvre les paramètres de l'élément.
  await page.mouse.click(
    ...(Object.values(await center(page, '.sel-box')) as [number, number]),
  );
  await expect(settings.getByLabel('Largeur', { exact: true })).toBeVisible();
  await expect(pageSettings).toHaveCount(0);
  const h = (await page.locator('.handle').boundingBox())!;
  await dragBy(page, { x: h.x + 2, y: h.y + 2 }, 80, 40);
  await expect
    .poll(async () => (await kids())[0]?.style?.desktop.width)
    .toBeGreaterThan(160);
  await expect(
    settings.getByRole('group', { name: 'Disposition des enfants' }),
  ).toHaveCount(0);
  await expect(settings.locator('details.effects')).not.toHaveAttribute('open');

  // Un bloc en colonne, un texte dedans.
  await tree.getByRole('button', { name: 'Page', exact: true }).click();
  await add('Bloc');
  await expect(pageSettings).toBeVisible();
  await tree.getByRole('button', { name: 'Bloc' }).click();
  await add('Texte');
  await tree.getByRole('button', { name: 'Texte' }).click();
  await settings.getByLabel('Texte', { exact: true }).fill('Bonjour');

  // Clic : premier niveau ; double-clic : entrer ; Échap : remonter.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await page.locator('.artboard').getByText('Bonjour').click();
  await expect(page.locator('.sel-tag')).toHaveText('Bloc');
  await page.locator('.artboard').getByText('Bonjour').dblclick();
  await expect(page.locator('.sel-tag')).toHaveText('Bonjour');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sel-tag')).toHaveText('Bloc');

  // Changer de parent : un texte posé sur la page glisse dans le bloc.
  await tree.getByRole('button', { name: 'Page', exact: true }).click();
  await add('Texte');
  const t = await center(page, '.sel-box');
  const b = await center(page, '[data-node="box-1"]');
  await dragBy(page, t, b.x - t.x, b.y - t.y + 20, async () => {
    await expect(page.locator('.marker')).toBeVisible();
  });
  await expect
    .poll(async () => {
      const bloc = (await kids()).find((n: { id: string }) => n.id === 'box-1');
      return [bloc?.children?.length, bloc?.children?.[1]?.style?.desktop?.x];
    })
    .toEqual([2, undefined]);

  // Valeur propre au mobile, puis rétablie.
  await tree.getByRole('button', { name: 'Bloc' }).click();
  await page.getByRole('button', { name: 'Mobile' }).click();
  await settings.getByLabel('Token Fond').selectOption('surface-alt');
  await expect
    .poll(async () => (await kids())[1]?.style?.mobile?.background)
    .toBe('surface-alt');
  await settings.getByRole('button', { name: 'Rétablir Fond' }).click();
  await expect
    .poll(async () => (await kids())[1]?.style?.mobile?.background)
    .toBe(undefined);
  await page.getByRole('button', { name: 'Bureau' }).click();

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

  // 4. Créer un composant (⌘K) : instance liée, nom proposé par l'IA.
  await tree.getByRole('button', { name: 'Bloc' }).click();
  await page.keyboard.press('ControlOrMeta+k');
  await expect
    .poll(async () => [
      (await saved()).components.bonjour?.name,
      (await kids())[1]?.kind,
    ])
    .toEqual(['Carte maison', 'component']);
  await expect(settings.locator('.instance-mark')).toBeVisible();

  // Ajustement local : double-clic dans l'instance, texte changé.
  await page.locator('.artboard').getByText('Bonjour').dblclick();
  await expect(page.locator('.sel-tag')).toHaveText('Bonjour');
  await settings.getByLabel('Texte', { exact: true }).fill('Salut');
  await expect
    .poll(async () => [
      (await kids())[1]?.overrides?.['text-1']?.text,
      (await saved()).components.bonjour.root.children[0].text,
    ])
    .toEqual(['Salut', 'Bonjour']);

  // Détacher l'instance par le clic droit.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.artboard').getByText('Salut').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Détacher l’instance' }).click();
  await expect
    .poll(async () => [
      (await kids())[1]?.kind,
      (await kids())[1]?.children?.[0]?.text,
    ])
    .toEqual(['box', 'Salut']);

  // Renommer un composant d'un double-clic dans le design system.
  await page.getByRole('button', { name: 'Design system' }).click();
  await page
    .locator('.panel.left')
    .getByRole('button', { name: 'Carte maison' })
    .dblclick();
  await page.locator('.panel.left').getByLabel('Nom').fill('Carte');
  await page.locator('.panel.left').getByLabel('Nom').press('Enter');
  await expect
    .poll(async () => (await saved()).components.bonjour.name)
    .toBe('Carte');

  // « Modifier » ouvre le composant, racine sélectionnée.
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Commander Bouton' })
    .click();
  await settings.getByRole('button', { name: 'Modifier' }).click();
  await expect(settings.getByLabel('Nom du composant')).toHaveValue('Bouton');
  await tree.getByRole('button', { name: 'Libellé' }).click();
  await settings.getByLabel('Texte', { exact: true }).fill('Réserver');
  await tree.getByRole('button', { name: 'Bouton' }).click();
  await page.getByLabel('État').selectOption('hover');
  await settings.getByLabel('Token Fond').selectOption('secondary');
  await page.getByLabel('État').selectOption('default');
  await add('Badge');
  await expect
    .poll(async () => {
      const c = (await saved()).components.button;
      return [
        c.root.children[0].text,
        c.states.hover.root.background,
        c.root.children.at(-1).component,
      ];
    })
    .toEqual(['Réserver', 'secondary', 'badge']);
  await app.close();
});
