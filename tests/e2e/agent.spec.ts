import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Agent transversal simulé : QCM (STUDIO_FAKE_ASK), étapes, design system
// (STUDIO_FAKE_AGENT) et avis (STUDIO_FAKE_ADVICE), par les vrais outils.
test('accueil par prompt : QCM, étapes, avis, dossier à la génération', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const dir = path.join(root, 'site');
  const ask = path.join(root, 'ask.json');
  await writeFile(
    ask,
    JSON.stringify([
      { id: 'style', label: 'Ambiance', options: ['Chaleureuse', 'Sobre'] },
      { id: 'pages', label: 'Pages', options: ['3', '5'] },
    ]),
  );
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_FAKE_AUTH: 'in',
      STUDIO_PICK_DIRS: dir,
      STUDIO_FAKE_AGENT: path.resolve('tests/fixtures/design.json'),
      STUDIO_FAKE_ASK: ask,
      STUDIO_FAKE_ADVICE: JSON.stringify({
        text: 'Trois tailles de titre proches.',
        apply: 'Contraste l’échelle des titres',
      }),
      STUDIO_FAKE_GENERATE: '1',
    },
  });
  const page = await app.firstWindow();
  const drafts = path.join(root, 'data', 'projects');
  const entries = async (d: string) =>
    JSON.parse(
      await readFile(path.join(d, '.studio/history/index.json'), 'utf8'),
    ).reverse();

  // Une instruction crée le projet, sans formulaire ni dossier.
  const start = page.getByLabel('Que voulez-vous créer ?');
  await start.fill('Crée-moi un site pour mon restaurant');
  await start.press('Enter');

  // QCM : la recommandation est cochée d'office, « Autre » en texte libre.
  const card = page.getByRole('form', { name: 'Précisions' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('radio', { name: /Chaleureuse/ })).toBeChecked();
  await expect(card.getByText('Recommandé')).toHaveCount(2);
  await card.getByLabel('Pages : autre').fill('4');
  await card.getByRole('button', { name: 'Valider' }).click();
  await expect(card).toHaveCount(0);

  // Puis la bulle d'avis, et Garder.
  const advice = page.getByRole('status', { name: 'Avis' });
  await expect(advice).toContainText('Trois tailles de titre proches.');
  await page.getByRole('button', { name: 'Garder' }).click();
  const [draft] = await readdir(drafts);
  const d = path.join(drafts, draft);
  const saved = JSON.parse(
    await readFile(path.join(d, '.studio/project.json'), 'utf8'),
  );
  expect(saved.decisions).toEqual([
    { question: 'Ambiance', answer: 'Chaleureuse' },
    { question: 'Pages', answer: '4' },
  ]);
  expect((await entries(d))[0].choices).toEqual([
    'Ambiance : Chaleureuse',
    'Pages : 4',
  ]);

  // Appliquer : une nouvelle itération, sans reposer les questions.
  await advice.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.getByRole('button', { name: 'Garder' })).toBeVisible();
  await expect(card).toHaveCount(0);
  expect((await entries(d))[0].label).toBe('Contraste l’échelle des titres');
  await page.getByRole('button', { name: 'Garder' }).click();
  await advice.getByRole('button', { name: 'Fermer' }).click();
  await expect(advice).toHaveCount(0);

  // L'historique montre les choix.
  await page.getByRole('button', { name: 'Historique' }).click();
  await expect(page.getByRole('dialog', { name: 'Historique' })).toContainText(
    'Ambiance : Chaleureuse',
  );
  await page.getByRole('button', { name: 'Historique' }).click();

  // Le dossier n'est demandé qu'à la première génération du code.
  await page.getByRole('button', { name: 'Code' }).click();
  await page.getByLabel('Langage').selectOption({ label: 'HTML/CSS' });
  await page.getByRole('button', { name: 'Générer' }).click();
  await expect
    .poll(() =>
      readFile(path.join(dir, 'code/html/GENERATED.json'), 'utf8').then(
        () => true,
        () => false,
      ),
    )
    .toBe(true);
  expect(await readdir(drafts)).toEqual([]);
  expect((await entries(dir)).length).toBeGreaterThan(2);
  await app.close();
});

test('« Décider pour moi » : la recommandation, gardée', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-e2e-'));
  const ask = path.join(root, 'ask.json');
  await writeFile(
    ask,
    JSON.stringify([
      { id: 'style', label: 'Ambiance', options: ['Chaleureuse', 'Sobre'] },
    ]),
  );
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      STUDIO_USER_DATA: path.join(root, 'data'),
      STUDIO_FAKE_AUTH: 'in',
      STUDIO_FAKE_AGENT: path.resolve('tests/fixtures/design.json'),
      STUDIO_FAKE_ASK: ask,
    },
  });
  const page = await app.firstWindow();
  const start = page.getByLabel('Que voulez-vous créer ?');
  await start.fill('Un restaurant');
  await start.press('Enter');
  await page.getByRole('button', { name: 'Décider pour moi' }).click();
  await page.getByRole('button', { name: 'Garder' }).click();
  const [draft] = await readdir(path.join(root, 'data', 'projects'));
  const saved = JSON.parse(
    await readFile(
      path.join(root, 'data', 'projects', draft, '.studio/project.json'),
      'utf8',
    ),
  );
  expect(saved.decisions).toEqual([
    { question: 'Ambiance', answer: 'Chaleureuse' },
  ]);
  await app.close();
});
