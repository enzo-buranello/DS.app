import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, settle, log, out } from './driver.js';

// Scénario 2 : demande floue, QCM puis exécution ; Valider, puis « Décider pour moi ».
for (const how of ['valider', 'decider'] as const)
  test(`2 — demande floue (${how})`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'studio-live-'));
    const dir = path.join(root, 'site');
    const { app, page } = await launch(root, [dir]);
    const start = page.getByLabel('Que voulez-vous créer ?');
    await start.fill('Crée-moi un site pour mon restaurant');
    await start.press('Enter');
    const r = await settle(page, async () => how);
    await page.screenshot({ path: path.join(out, `2-${how}.png`) });
    expect(r.ok).toBe(true);
    await page.getByRole('button', { name: 'Garder' }).click();
    const drafts = path.join(root, 'data', 'projects');
    const d = (await readdir(drafts).catch(() => [])).length
      ? path.join(drafts, (await readdir(drafts))[0])
      : dir;
    const p = JSON.parse(await readFile(path.join(d, '.studio/project.json'), 'utf8'));
    const h = JSON.parse(await readFile(path.join(d, '.studio/history/index.json'), 'utf8')).reverse();
    const res = {
      ...r,
      name: p.name,
      decisions: p.decisions,
      pages: Object.values<{ name: string }>(p.pages).map((x) => x.name),
      components: Object.keys(p.components).length,
      targets: p.targets,
      entry: h[0],
      moved: d === dir,
    };
    log(JSON.stringify(res));
    await writeFile(path.join(out, `2-${how}.json`), JSON.stringify(res, null, 2));
    await app.close();
  });
