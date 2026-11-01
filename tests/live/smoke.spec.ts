import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, settle, log } from './driver.js';

test('smoke : agent réel, design system seul', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-live-'));
  const { app, page } = await launch(root, [path.join(root, 'site')]);
  const start = page.getByLabel('Que voulez-vous créer ?');
  await start.fill('Un design system minimal : trois couleurs, une typographie et un bouton. Pas de page, pas de code.');
  await start.press('Enter');
  const r = await settle(page);
  expect(r.ok).toBe(true);
  const drafts = path.join(root, 'data', 'projects');
  const [d] = await readdir(drafts);
  const p = JSON.parse(await readFile(path.join(drafts, d, '.studio/project.json'), 'utf8'));
  log('nom', p.name, 'couleurs', Object.keys(p.foundations.colors), 'composants', Object.keys(p.components), 'pages', Object.keys(p.pages));
  await app.close();
});
