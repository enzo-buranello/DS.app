import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../app/server/store.js';
import { tokensSchema, type AgentReply } from '../app/shared/model.js';
import { createStudioServer } from '../app/server/http.js';
import type { AgentContext } from '../connectors/agents/types.js';
import type { Doc } from '../app/shared/doc.js';
import { newComponent } from '../app/shared/component.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);
// Agent simulé : renvoie la réponse préparée et mémorise le contexte reçu.
async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  legacy?: unknown,
  components?: unknown,
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-edits-'));
  if (legacy)
    await writeFile(path.join(directory, 'edits.json'), JSON.stringify(legacy));
  if (components)
    await writeFile(
      path.join(directory, 'components.json'),
      JSON.stringify(components),
    );
  const store = new Store(directory, seed);
  await store.init();
  const agent = {
    next: { message: 'ok', changes: [] } as AgentReply,
    seen: null as AgentContext | null,
  };
  const app = await createStudioServer({
    root,
    store,
    claude: {
      id: 'claude',
      async status() {
        return { available: true, detail: 'simulation' };
      },
      async reply(_message: string, context: AgentContext) {
        agent.seen = context;
        return agent.next;
      },
    },
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const post = async (route: string, body: unknown) => {
    const r = await fetch(origin + '/api/' + route, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-DS-Studio': boot.csrf,
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const get = async (route: string) =>
    (await fetch(origin + '/api/' + route)).json();
  const doc = async () => (await get('doc')) as Doc;
  const ask = (element: unknown) =>
    post('agent', {
      agent: 'claude',
      message: 'Modifie-le',
      revision: store.snapshot().revision,
      history: [],
      element,
    });
  return { post, get, doc, ask, agent, store, directory, origin };
}

// edits.json réel de l'étudiant (anonymisé) : un maître modifié et un texte
// identique à celui affiché, donc sans effet.
const LEGACY = {
  masters: {
    'button/primary': {
      fill: { token: 'color.muted', opacity: 1 },
      text: { token: 'color.onBrand', opacity: 1 },
      radius: { token: 'space.md' },
      paddingX: { token: 'space.md' },
      paddingY: { token: 'space.md' },
      fontSize: { token: 'font.body' },
    },
    'booking-card#title': { label: 'Faire moins, mais mieux.' },
  },
  instances: {
    'cards.rhythm.cta': { label: 'Je m’inscris', link: null },
  },
};

test('document : migration v1 sans perte, edits.json intact', async (t) => {
  const { doc, directory } = await fixture(t, LEGACY);
  const before = await readFile(path.join(directory, 'edits.json'), 'utf8');
  const d = await doc();
  assert.equal(d.version, 2);
  const primary = d.nodes['button/primary'];
  assert.deepEqual(primary.props.fills, [
    {
      type: 'solid',
      color: { token: 'color.muted', opacity: 1 },
      visible: true,
    },
  ]);
  assert.deepEqual(primary.props.radius?.topLeft, { token: 'space.md' });
  assert.deepEqual(primary.props.layout?.padding, {
    top: { token: 'space.md' },
    right: { token: 'space.md' },
    bottom: { token: 'space.md' },
    left: { token: 'space.md' },
  });
  // Les états restent distincts : le hover du bouton n'est pas écrasé.
  assert.ok(primary.states?.hover?.fills);
  // Texte identique à l'affiché : non migré.
  assert.equal(
    d.nodes['booking-card/title'].characters,
    'Faire moins, mais mieux.',
  );
  // Instance : libellé en override du calque texte, lien retiré.
  const cta = d.nodes['cards.rhythm.cta'];
  assert.equal(
    cta.overrides?.['button/secondary/label']?.characters,
    'Je m’inscris',
  );
  assert.deepEqual(cta.interactions, []);
  assert.match(d.migratedFrom?.edits ?? '', /^[0-9a-f]{64}$/);
  // Les fichiers v1 ne sont ni modifiés ni supprimés.
  assert.equal(
    await readFile(path.join(directory, 'edits.json'), 'utf8'),
    before,
  );
  // Deuxième lecture : document relu, pas de nouvelle migration.
  assert.deepEqual(await doc(), d);
});

test('document : opérations par nœud, conflit, validation, persistance', async (t) => {
  const { post, doc, directory } = await fixture(t);
  const d = await doc();
  const node = d.nodes['cards.rhythm.title'];
  const after = { ...node, characters: 'Nouveau titre' };
  let r = await post('doc/ops', {
    ops: [{ id: node.id, before: node, after }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.nodes[node.id].characters, 'Nouveau titre');
  const disk = JSON.parse(
    await readFile(path.join(directory, 'document.json'), 'utf8'),
  );
  assert.equal(disk.nodes[node.id].characters, 'Nouveau titre');
  // Valeur « avant » périmée : 409, rien écrit.
  r = await post('doc/ops', {
    ops: [{ id: node.id, before: node, after: { ...node, characters: 'x' } }],
  });
  assert.equal(r.status, 409);
  assert.equal((await doc()).nodes[node.id].characters, 'Nouveau titre');
  // Arbre incohérent (enfant orphelin) : 422.
  r = await post('doc/ops', {
    ops: [{ id: node.id, before: after, after: null }],
  });
  assert.equal(r.status, 422);
  // Valeur hors limites : 400.
  r = await post('doc/ops', {
    ops: [
      {
        id: node.id,
        before: after,
        after: { ...after, props: { layer: { opacity: 4 } } },
      },
    ],
  });
  assert.equal(r.status, 400);
});

test('historique : pile Cmd+Z enregistrée et relue', async (t) => {
  const { post, get } = await fixture(t);
  assert.deepEqual(await get('history'), { done: [], undone: [] });
  const history = {
    done: [
      [
        {
          type: 'token',
          key: 'color.brand',
          before: '#000000',
          after: '#111111',
        },
      ],
    ],
    undone: [],
  };
  assert.equal((await post('history', { history })).status, 200);
  assert.deepEqual(await get('history'), history);
  const bad = {
    done: [[{ type: 'token', key: 'color.nope', before: 1, after: 2 }]],
    undone: [],
  };
  assert.equal((await post('history', { history: bad })).status, 400);
});

test('prompt sur un élément : seul cet élément change, hors périmètre refusé', async (t) => {
  const { ask, agent, doc, store } = await fixture(t);
  const element = {
    kind: 'instance',
    key: 'cards.rhythm.cta',
    name: 'Button · Secondaire',
    current: { text: 'Voir les ateliers' },
  };
  agent.next = {
    message: 'Fond rouge.',
    changes: [],
    patch: { fill: { token: 'color.danger', opacity: 1 } },
  };
  let r = await ask(element);
  assert.equal(r.status, 200);
  // Le contrôleur a recalculé le périmètre : champs d'une instance de bouton.
  assert.ok(agent.seen?.element?.fields.includes('link'));
  assert.equal(r.body.applied.type, 'doc');
  assert.deepEqual(
    r.body.applied.ops.map((o: { id: string }) => o.id),
    ['cards.rhythm.cta'],
  );
  const cta = (await doc()).nodes['cards.rhythm.cta'];
  assert.deepEqual(cta.props.fills?.[0], {
    type: 'solid',
    color: { token: 'color.danger', opacity: 1 },
    visible: true,
  });
  // Le lien de navigation existant est conservé.
  assert.equal(cta.interactions?.[0]?.action.type, 'navigate');
  // Un token modifié avec un élément sélectionné : refusé, rien appliqué.
  agent.next = {
    message: 'x',
    changes: [{ key: 'color.brand', value: '#000000' }],
  };
  r = await ask(element);
  assert.equal(r.status, 422);
  assert.equal(store.snapshot().revision, 0);
  // Champ non autorisé pour un sous-élément texte : refusé.
  agent.next = { message: 'x', changes: [], patch: { link: 'form' } };
  r = await ask({ ...element, key: 'cards.booking>booking-card/title' });
  assert.equal(r.status, 422);
  // Élément inconnu : 404.
  r = await ask({ ...element, key: 'nope' });
  assert.equal(r.status, 404);
  // Token sélectionné : seule sa clé peut changer, écrite et journalisée.
  agent.next = {
    message: 'Plus sombre.',
    changes: [{ key: 'color.brand', value: '#123456' }],
  };
  r = await ask({
    kind: 'token',
    key: 'color.brand',
    name: 'color.brand',
    current: {},
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.applied.type, 'token');
  assert.equal(store.snapshot().tokens['color.brand'].$value, '#123456');
  assert.equal(store.snapshot().history.at(-1)?.source, 'claude');
  agent.next = {
    message: 'x',
    changes: [{ key: 'color.text', value: '#000000' }],
  };
  r = await ask({
    kind: 'token',
    key: 'color.brand',
    name: 'color.brand',
    current: {},
  });
  assert.equal(r.status, 422);
});

test('document : composants créés importés une fois, components.json intact', async (t) => {
  const c = newComponent('33333333-3333-4333-8333-333333333333', 1);
  const { doc, directory } = await fixture(t, undefined, { components: [c] });
  const before = await readFile(
    path.join(directory, 'components.json'),
    'utf8',
  );
  const d = await doc();
  assert.equal(d.nodes[`custom/${c.id}`].type, 'component');
  assert.equal(d.nodes[`custom/${c.id}`].parent, 'catalogue.custom');
  assert.match(d.migratedFrom?.components ?? '', /^[0-9a-f]{64}$/);
  assert.equal(
    await readFile(path.join(directory, 'components.json'), 'utf8'),
    before,
  );
  assert.deepEqual(await doc(), d);
});

test('images de fond : format vérifié, nom par empreinte, lecture fermée', async (t) => {
  const { post, origin } = await fixture(t);
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
  ]);
  let r = await post('assets', {
    mediaType: 'image/png',
    data: png.toString('base64'),
  });
  assert.equal(r.status, 200);
  assert.match(r.body.asset, /^[0-9a-f]{32}\.png$/);
  const got = await fetch(`${origin}/api/assets/${r.body.asset}`);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), png);
  // Contenu qui ne correspond pas au format annoncé : refusé.
  r = await post('assets', {
    mediaType: 'image/jpeg',
    data: png.toString('base64'),
  });
  assert.equal(r.status, 400);
  for (const name of ['../document.json', 'x.png', `${'a'.repeat(32)}.svg`])
    assert.equal(
      (await fetch(`${origin}/api/assets/${encodeURIComponent(name)}`)).status,
      404,
    );
});

test('agent sur le modèle de nœuds : patchs du périmètre, refus hors périmètre', async (t) => {
  const { ask, agent, doc } = await fixture(t);
  const element = {
    kind: 'instance',
    key: 'cards.booking',
    name: 'Carte réservation',
    current: {},
  };
  agent.next = {
    message: 'Titre et survol.',
    changes: [],
    nodes: [
      {
        key: 'cards.booking>booking-card/title',
        characters: 'Atelier du soir',
        props: { text: { color: { token: 'color.danger', opacity: 1 } } },
      },
      {
        key: 'cards.booking>booking-card/meta',
        props: { layer: { opacity: 0.8 } },
      },
      {
        key: 'cards.booking',
        props: { radius: { topLeft: { px: 4 } } },
        states: { hover: { layer: { opacity: 0.9 } } },
      },
    ],
  };
  let r = await ask(element);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // Le périmètre transmis : l'instance et ses calques rendus.
  const keys = (agent.seen?.element?.nodes as { key: string }[]).map(
    (n) => n.key,
  );
  assert.equal(keys[0], 'cards.booking');
  assert.ok(keys.includes('cards.booking>booking-card/title'));
  // Une seule écriture : l'instance porte overrides et valeurs propres.
  assert.deepEqual(
    r.body.applied.ops.map((o: { id: string }) => o.id),
    ['cards.booking'],
  );
  const card = (await doc()).nodes['cards.booking'];
  assert.equal(
    card.overrides?.['booking-card/title']?.characters,
    'Atelier du soir',
  );
  assert.deepEqual(card.overrides?.['booking-card/title']?.props?.text?.color, {
    token: 'color.danger',
    opacity: 1,
  });
  assert.equal(
    card.overrides?.['booking-card/meta']?.props?.layer?.opacity,
    0.8,
  );
  assert.deepEqual(card.props.radius?.topLeft, { px: 4 });
  assert.equal(card.states?.hover?.layer?.opacity, 0.9);

  const revision = JSON.stringify(await doc());
  // Clé hors périmètre (un autre écran) : tout est refusé.
  agent.next = {
    message: 'x',
    changes: [],
    nodes: [
      { key: 'cards.booking>booking-card/title', characters: 'Non' },
      { key: 'cards.title', characters: 'Ailleurs' },
    ],
  };
  r = await ask(element);
  assert.equal(r.status, 422);
  // Propriété invalide pour le schéma : refusée.
  agent.next = {
    message: 'x',
    changes: [],
    nodes: [{ key: 'cards.booking', props: { layer: { opacity: 4 } } }],
  };
  r = await ask(element);
  assert.equal(r.status, 422);
  // Texte sur un calque qui n'en est pas un : refusé.
  agent.next = {
    message: 'x',
    changes: [],
    nodes: [{ key: 'cards.booking', characters: 'x' }],
  };
  assert.equal((await ask(element)).status, 422);
  // Patch de nœud sans élément sélectionné : refusé.
  assert.equal((await ask(undefined)).status, 422);
  assert.equal(JSON.stringify(await doc()), revision);
});
