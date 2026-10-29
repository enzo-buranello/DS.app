import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('IA par portée, historique regroupé, annuler et restaurer', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const dir = path.join(root, 'site');
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_PICK_DIRS: dir,
      STUDIO_FAKE_AGENT: path.resolve('tests/fixtures/design.json'),
      STUDIO_FAKE_NODE: path.resolve('tests/fixtures/node.json'),
    },
  });
  const page = await app.firstWindow();
  const saved = async () =>
    JSON.parse(await readFile(path.join(dir, '.studio/project.json'), 'utf8'));
  const entries = async () =>
    JSON.parse(
      await readFile(path.join(dir, '.studio/history/index.json'), 'utf8'),
    ).reverse();
  const shape = async () =>
    (await saved()).pages['page-1']?.root.children?.[0]?.style?.desktop;
  const bar = page.getByLabel('Instruction');
  const ask = async (text: string) => {
    await bar.fill(text);
    await bar.press('Enter');
  };

  await page.getByRole('button', { name: 'Nouveau projet' }).click();
  await page.getByLabel('Nom').fill('Boulangerie');
  await page.getByRole('button', { name: 'Créer' }).click();

  // Global : l'entrée porte l'instruction.
  await ask('Une boulangerie');
  await page.getByRole('button', { name: 'Garder' }).click();
  await expect
    .poll(async () => (await entries()).map((e: { label?: string }) => e.label))
    .toEqual(['Une boulangerie', 'Création']);

  // Manuel : deux déplacements du même élément = une seule entrée.
  await page.getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('button', { name: 'Ajouter une page' }).first().click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rectangle', exact: true }).click();
  await expect.poll(async () => (await shape())?.x).toBe(40);
  for (const dx of [60, 40]) {
    const r = (await page.locator('.sel-box').boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2, {
      steps: 4,
    });
    await page.mouse.up();
    await expect.poll(async () => (await shape())?.x).toBeGreaterThan(60);
    await page.waitForTimeout(400);
  }
  await expect
    .poll(async () => {
      const list = await entries();
      return [
        list[0].scope,
        list[0].target,
        list.filter((e: { target: string }) => e.target === list[0].target)
          .length,
      ];
    })
    .toEqual(['element', 'pages:page-1:shape-1', 1]);
  await page.getByRole('button', { name: 'Historique' }).click();
  const first = page
    .getByRole('dialog', { name: 'Historique' })
    .locator('li')
    .first();
  await expect(first).toContainText('Modification manuelle');
  await expect(first).toContainText('Élément');
  await page.getByRole('button', { name: 'Historique' }).click();

  // Portée élément : l'IA ne touche qu'au rectangle sélectionné.
  await expect(bar).toHaveAttribute('placeholder', 'Modifier « Rectangle »');
  await ask('Rends-le primaire');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect.poll(async () => (await shape())?.background).toBe('#d9d9d9');
  await expect.poll(async () => (await entries())[0].label).toBe(undefined);
  // Une image jointe accompagne l'instruction et reste dans l'historique.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .getByLabel('Images', { exact: true })
    .setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.prompt-images li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Retirer l’image' }).click();
  await expect(page.locator('.prompt-images li')).toHaveCount(0);
  await page
    .getByLabel('Images', { exact: true })
    .setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: png });
  await ask('Rends-le primaire');
  await page.getByRole('button', { name: 'Garder' }).click();
  await expect.poll(async () => (await shape())?.background).toBe('primary');
  await expect
    .poll(async () => [(await entries())[0].label, (await entries())[0].scope])
    .toEqual(['Rends-le primaire', 'element']);
  expect((await entries())[0].images).toHaveLength(1);
  await page.getByRole('button', { name: 'Historique' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Historique' }).locator('.thumbs img'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Historique' }).click();

  // Mode test : la page seule, rien de sélectionnable ; Échap revient.
  await page.getByRole('button', { name: 'Tester' }).click();
  const test = page.getByRole('dialog', { name: 'Test' });
  await expect(test).toBeVisible();
  await expect(test.locator('[data-node]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(test).toBeHidden();
  await expect(page.locator('.sel-tag')).toHaveText('Rectangle');
  await page.getByRole('button', { name: 'Tester' }).click();
  await page.getByRole('button', { name: 'Quitter' }).click();
  await expect(test).toBeHidden();

  // Restaurer : retour à l'état du design system généré, nouvelle entrée.
  await page.getByRole('button', { name: 'Historique' }).click();
  await page
    .getByRole('dialog', { name: 'Historique' })
    .locator('li', { hasText: 'Une boulangerie' })
    .getByRole('button', { name: 'Restaurer' })
    .click();
  await expect.poll(async () => Object.keys((await saved()).pages)).toEqual([]);
  await expect
    .poll(async () => (await entries())[0].label)
    .toBe('Restauration');
  await expect(
    page.getByRole('button', { name: 'Ajouter une page' }).first(),
  ).toBeVisible();
  await app.close();
});
