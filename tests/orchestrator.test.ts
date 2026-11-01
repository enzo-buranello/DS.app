import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Question, Step } from '../app/shared/agent.js';
import { emptyProject, type Project } from '../app/shared/project.js';
import {
  orchestrate,
  overview,
  session,
  type Run,
} from '../app/main/orchestrator.js';

type Result = { isError?: boolean; content: { type: string; text?: string }[] };

function setup(project: Project, over: Partial<Run> = {}) {
  const log = {
    steps: [] as Step[][],
    asked: [] as Question[][],
    confirmed: [] as string[][],
  };
  const run: Run = {
    project,
    instruction: 'x',
    images: [],
    settings: { questions: true, advice: true },
    ui: {
      steps: (s) => log.steps.push(s),
      ask: async (q) => (log.asked.push(q), { style: 'Sobre' }),
      confirm: async (items) => (log.confirmed.push(items), false),
    },
    code: {
      status: async () => 'Aucun langage',
      generate: async () => null,
      edit: async () => null,
      check: async () => ({ errors: [] }),
    },
    ...over,
  };
  const s = session(run);
  const call = (name: keyof typeof s.tools, args: unknown) =>
    (s.tools[name].handler as (a: unknown, e: unknown) => Promise<Result>)(
      args,
      null,
    );
  return { s, call, log };
}

const page = (id: string, name: string) => ({
  name,
  root: {
    id: 'root',
    kind: 'box',
    children: [{ id: 'title', kind: 'text', text: 'Bonjour' }],
  },
});

test('vue d’ensemble : plan des pages sans tout le contenu', () => {
  const p = {
    ...emptyProject('A'),
    pages: { home: page('home', 'Accueil') as Project['pages'][string] },
  };
  const o = overview(p);
  assert.deepEqual(o.pages.home.outline, [
    'root box',
    '  title text "Bonjour"',
  ]);
});

test('écriture : validée, refusée si invalide, références signalées', async () => {
  const { s, call } = setup(emptyProject('A'));
  const bad = await call('write', {
    changes: [{ kind: 'colors', id: 'primary', value: { name: 'P' } }],
  });
  assert.equal(bad.isError, true);
  const ok = await call('write', {
    changes: [
      {
        kind: 'pages',
        id: 'home',
        value: {
          name: 'Accueil',
          root: {
            id: 'root',
            kind: 'box',
            style: { desktop: { gap: 'space-4' } },
          },
        },
      },
    ],
  });
  assert.match(ok.content[0].text!, /spacing:space-4/);
  assert.ok(s.project.pages.home);
});

test('suppression : confirmation demandée, refus respecté', async () => {
  const base = {
    ...emptyProject('A'),
    pages: { home: page('home', 'Accueil') as Project['pages'][string] },
  };
  const { s, call, log } = setup(base);
  const r = await call('write', {
    changes: [{ kind: 'pages', id: 'home', value: null }],
  });
  assert.deepEqual(log.confirmed, [['Page « Accueil »']]);
  assert.match(r.content[0].text!, /refusée/);
  assert.ok(s.project.pages.home);
});

test('QCM : une seule fois, choix gardés, jamais reposés', async () => {
  const base = {
    ...emptyProject('A'),
    decisions: [{ question: 'Langage', answer: 'SwiftUI' }],
  };
  const { s, call, log } = setup(base);
  const questions = [
    { id: 'style', label: 'Ambiance', options: ['Chaleureuse', 'Sobre'] },
    { id: 'lang', label: 'Langage', options: ['React', 'SwiftUI'] },
  ];
  const r = await call('ask', { questions });
  // Seule la question nouvelle est montrée.
  assert.deepEqual(
    log.asked.map((q) => q.map((x) => x.id)),
    [['style']],
  );
  assert.deepEqual(JSON.parse(r.content[0].text!), [
    { question: 'Ambiance', answer: 'Sobre' },
    { question: 'Langage', answer: 'SwiftUI' },
  ]);
  assert.deepEqual(s.choices, ['Ambiance : Sobre']);
  assert.equal(s.project.decisions?.length, 2);
  // Second appel : pas d'interruption, recommandation.
  await call('ask', {
    questions: [{ id: 'n', label: 'Pages', options: ['3', '5'] }],
  });
  assert.equal(log.asked.length, 1);
  assert.equal(s.project.decisions?.at(-1)?.answer, '3');
});

test('QCM désactivé : l’option recommandée, sans question', async () => {
  const { call, log } = setup(emptyProject('A'), {
    settings: { questions: false, advice: true },
  });
  const r = await call('ask', {
    questions: [{ id: 'a', label: 'Ambiance', options: ['Chaude', 'Froide'] }],
  });
  assert.equal(log.asked.length, 0);
  assert.equal(JSON.parse(r.content[0].text!)[0].answer, 'Chaude');
});

test('étapes : cochées dans l’ordre, échec sur une ligne', async () => {
  const { s, call, log } = setup(emptyProject('A'));
  await call('plan', { steps: ['Design system', 'Pages', 'Code'] });
  await call('step', { index: 0, state: 'done' });
  assert.deepEqual(
    log.steps.at(-1)!.map((x) => x.state),
    ['done', 'doing', 'todo'],
  );
  s.fail('Échec');
  assert.deepEqual(log.steps.at(-1)![1], {
    label: 'Pages',
    state: 'failed',
    error: 'Échec',
  });
});

test('code : sans langage, refusé ; sinon délégué avec le brouillon', async () => {
  let got: Project | null = null;
  const { call } = setup(emptyProject('A'), {
    code: {
      status: async () => '',
      generate: async (p) => ((got = p), null),
      edit: async () => null,
      check: async () => ({ errors: [] }),
    },
  });
  assert.equal((await call('generate_code', {})).isError, true);
  await call('set_target', { target: 'html' });
  await call('generate_code', {});
  assert.deepEqual(got!.targets, ['html']);
});

test('exécution simulée : QCM, étapes, design system, avis', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'orch-'));
  const ask = path.join(dir, 'ask.json');
  await writeFile(
    ask,
    JSON.stringify([
      { id: 'style', label: 'Ambiance', options: ['Chaleureuse', 'Sobre'] },
    ]),
  );
  process.env.STUDIO_FAKE_AGENT = 'tests/fixtures/design.json';
  process.env.STUDIO_FAKE_ASK = ask;
  process.env.STUDIO_FAKE_ADVICE = JSON.stringify({ text: 'Avis' });
  try {
    const { log } = setup(emptyProject('A'));
    const out = await orchestrate({
      project: emptyProject('A'),
      instruction: 'x',
      images: [],
      settings: { questions: true, advice: false },
      ui: {
        steps: (st) => log.steps.push(st),
        ask: async () => null,
        confirm: async () => true,
      },
      code: {
        status: async () => '',
        generate: async () => null,
        edit: async () => null,
        check: async () => ({ errors: [] }),
      },
    });
    assert.ok(Object.keys(out.project.components).length > 0);
    assert.deepEqual(out.choices, ['Ambiance : Chaleureuse']);
    assert.equal(out.advice, undefined); // avis désactivé
    assert.ok(log.steps.at(-1)!.every((x) => x.state === 'done'));
  } finally {
    delete process.env.STUDIO_FAKE_AGENT;
    delete process.env.STUDIO_FAKE_ASK;
    delete process.env.STUDIO_FAKE_ADVICE;
  }
});

test('fichiers retirés par rm ou mv : repérés pour Annuler', async () => {
  const { removed } = await import('../app/main/generate.js');
  const { mkdir } = await import('node:fs/promises');
  const out = await mkdtemp(path.join(tmpdir(), 'rm-'));
  await mkdir(path.join(out, 'src/pages'), { recursive: true });
  await writeFile(path.join(out, 'src/pages/A.tsx'), 'a');
  await writeFile(path.join(out, 'src/pages/B.tsx'), 'b');
  await writeFile(path.join(out, 'old.css'), 'c');
  assert.deepEqual(
    await removed(
      'rm -rf src/pages && mv old.css new.css && npm run build',
      out,
    ),
    ['src/pages/A.tsx', 'src/pages/B.tsx', 'old.css'],
  );
});

test('garde-fou : un lien vers le dossier reste dedans', async () => {
  const { inside } = await import('../app/main/guard.js');
  const { mkdir, symlink, realpath } = await import('node:fs/promises');
  const base = await realpath(await mkdtemp(path.join(tmpdir(), 'guard-')));
  await mkdir(path.join(base, 'real/out'), { recursive: true });
  await symlink(path.join(base, 'real'), path.join(base, 'link'));
  const out = path.join(base, 'link/out');
  assert.equal(inside(out, path.join(base, 'real/out/src/A.tsx')), true);
  assert.equal(inside(out, path.join(base, 'real/other.txt')), false);
});
