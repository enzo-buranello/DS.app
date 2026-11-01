import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch, settle, log, out } from './driver.js';

// Scénarios 1, 3, 4, 5, 6 sur un même projet, avec le vrai Claude.
const report: Record<string, unknown> = {};
const note = async (k: string, v: unknown) => {
  report[k] = v;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
};

test('scénarios réels', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-live-'));
  const dir = path.join(root, 'site');
  const { app, page } = await launch(root, [dir]);
  // Le projet reste dans les brouillons tant qu'aucun code n'est généré.
  const where = async () => {
    const drafts = path.join(root, 'data', 'projects');
    const list = await readdir(drafts).catch(() => []);
    return list.length ? path.join(drafts, list[0]) : dir;
  };
  const project = async () =>
    JSON.parse(
      await readFile(path.join(await where(), '.studio/project.json'), 'utf8'),
    );
  const history = async () =>
    JSON.parse(
      await readFile(
        path.join(await where(), '.studio/history/index.json'),
        'utf8',
      ),
    ).reverse();
  const build = async () =>
    JSON.parse(
      await readFile(path.join(await where(), '.studio/build.json'), 'utf8').catch(
        () => '{}',
      ),
    );
  const shot = (name: string) =>
    page.screenshot({ path: path.join(out, `${name}.png`) });
  const decisions = new Set<string>();
  const run = async (
    label: string,
    text: string,
    how?: (l: string[]) => Promise<'valider' | 'decider'>,
  ) => {
    log('—', label, ':', text);
    const bar = page.getByLabel('Instruction');
    await bar.fill(text);
    await bar.press('Enter');
    const r = await settle(page, how);
    await shot(label);
    if (r.asked)
      for (const q of r.asked) {
        if (decisions.has(q)) log('QUESTION RÉPÉTÉE', q);
        decisions.add(q);
      }
    return r;
  };
  const keep = () => page.getByRole('button', { name: 'Garder' }).click();
  const summary = (p: {
    name: string;
    targets: string[];
    foundations: Record<string, object>;
    components: Record<string, object>;
    pages: Record<string, { name: string }>;
    collections: Record<string, object>;
    decisions?: unknown[];
  }) => ({
    name: p.name,
    targets: p.targets,
    tokens: Object.fromEntries(
      Object.entries(p.foundations).map(([k, v]) => [k, Object.keys(v).length]),
    ),
    components: Object.keys(p.components),
    pages: Object.values(p.pages).map((x) => x.name),
    collections: Object.keys(p.collections),
    decisions: p.decisions,
  });

  // 1. Création par prompt, image jointe.
  log('— 1. Création par prompt');
  await page.locator('input[aria-label="Images"]').first().setInputFiles(
    path.resolve('tests/live/reference.jpg'),
  );
  const start = page.getByLabel('Que voulez-vous créer ?');
  await start.fill(
    'Crée le site d’un studio de photographie, avec portfolio, tarifs et contact',
  );
  await start.press('Enter');
  const r1 = await settle(page);
  await shot('1-creation');
  expect(r1.ok).toBe(true);
  await keep();
  const p1 = await project();
  const b1 = await build();
  await note('1', {
    ...r1,
    project: summary(p1),
    build: Object.fromEntries(
      Object.entries(b1).map(([t, s]) => [t, { ok: (s as { ok: boolean }).ok, files: (s as { files: number }).files }]),
    ),
    history: (await history()).map((e: { label?: string; images?: string[] }) => [e.label, e.images?.length]),
  });
  log('projet', JSON.stringify(summary(p1)));

  // Aperçu du code généré, bureau.
  await page.getByRole('button', { name: 'Code' }).click();
  await page.waitForTimeout(8000);
  await shot('1-code');

  // 3. Modification globale, depuis Pages sans sélection.
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  const before3 = await project();
  const files3 = JSON.stringify((await build()));
  const r3 = await run(
    '3-global',
    'Ajoute une navigation latérale et adapte toutes les pages au mobile',
  );
  expect(r3.ok).toBe(true);
  await keep();
  const p3 = await project();
  const pagesWithMobile = Object.entries(p3.pages).filter(([, pg]) =>
    JSON.stringify(pg).includes('"mobile"'),
  ).length;
  await note('3', {
    ...r3,
    componentsBefore: Object.keys(before3.components),
    componentsAfter: Object.keys(p3.components),
    pagesWithMobile: `${pagesWithMobile}/${Object.keys(p3.pages).length}`,
    codeChanged: files3 !== JSON.stringify(await build()),
    touched: Object.values(await build()).map((s) => (s as { touched?: string[] }).touched?.length),
    entry: (await history())[0],
  });

  // 4. Modification ciblée : un texte de la page ouverte.
  const p4 = await project();
  const pageId = Object.keys(p4.pages)[0];
  const texts: string[] = [];
  const walk = (n: { kind: string; text?: string; name?: string; children?: unknown[] }) => {
    if (n.kind === 'text' && n.text && !n.name) texts.push(n.text.trim().slice(0, 32));
    (n.children as typeof n[] | undefined)?.forEach(walk);
  };
  walk(p4.pages[pageId].root);
  log('textes', texts.slice(0, 5));
  await page
    .locator('.panel.left button', { hasText: p4.pages[pageId].name })
    .first()
    .click()
    .catch(() => {});
  const row = page.locator('.tree button', { hasText: texts[0] }).first();
  await row.click();
  const bar = page.getByLabel('Instruction');
  log('placeholder', await bar.getAttribute('placeholder'));
  const r4 = await run('4-cible', 'Mets ce texte en italique et en majuscules');
  expect(r4.ok).toBe(true);
  await keep();
  const e4 = (await history())[0];
  await note('4', { ...r4, placeholder: await bar.getAttribute('placeholder'), entry: e4 });

  // 5. Itération continue : quatre demandes liées.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  const asks = [
    'Ajoute une page Journal avec une collection d’articles (titre, date, image, texte)',
    'Affiche les trois derniers articles du journal sur l’accueil',
    'Ajoute une recherche et un filtre par catégorie sur la page Journal',
    'Rends l’ensemble plus sombre et plus élégant, sans rien casser',
  ];
  const r5 = [];
  for (const [i, a] of asks.entries()) {
    const r = await run(`5-${i + 1}`, a);
    r5.push({ instruction: a, ...r });
    if (r.ok) await keep();
  }
  const h5 = await history();
  const last = await project();
  await note('5', {
    runs: r5,
    questions: [...decisions],
    history: h5.slice(0, 8).map((e: { label?: string; choices?: string[] }) => [e.label, e.choices]),
    project: summary(last),
    build: await build(),
    where: await where(),
  });

  // 6. Bulle d'avis : Appliquer sur la dernière.
  const r6 = await run('6-avis-base', 'Vérifie la cohérence du design system et des pages');
  await note('6-base', r6);
  const advice = page.getByRole('status', { name: 'Avis' });
  if (r6.ok) {
    await keep();
    if (await advice.getByRole('button', { name: 'Appliquer' }).count()) {
      await advice.getByRole('button', { name: 'Appliquer' }).click();
      const r = await settle(page);
      await shot('6-applique');
      if (r.ok) await keep();
      await note('6-appliquer', { ...r, entry: (await history())[0] });
    } else await note('6-appliquer', 'aucun bouton Appliquer');
  }
  // Chaque étape est restaurable : retour à l'avant-dernière itération.
  const now = await project();
  await page.getByRole('button', { name: 'Historique' }).click();
  await page
    .getByRole('dialog', { name: 'Historique' })
    .getByRole('button', { name: 'Restaurer' })
    .first()
    .click();
  await page.waitForTimeout(1500);
  const restored = await project();
  await note('restore', {
    changed: JSON.stringify(restored) !== JSON.stringify(now),
    entry: (await history())[0],
  });
  await note('done', true);
  await app.close();
});

export type { Page };
