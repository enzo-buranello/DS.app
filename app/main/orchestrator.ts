import { readFile } from 'node:fs/promises';
import {
  createSdkMcpServer,
  query,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type {
  Advice,
  Answers,
  Question,
  Settings,
  Step,
} from '../shared/agent.js';
import { find, update } from '../shared/nodes.js';
import {
  brokenReferences,
  foundationsSchema,
  projectSchema,
  targets,
  type Node,
  type Project,
} from '../shared/project.js';
import { RULES, withImages } from './agent.js';
import { claudeEnv } from './account.js';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// Agent transversal : une instruction globale peut toucher le design system,
// les pages, les contenus et le code. Il agit par des outils réels sur un
// brouillon du projet (validé à chaque écriture) et délègue le code à
// l'agent Développement. Aucun texte : un QCM, des étapes, un avis final.
// Seule l'app écrit le projet, à la fin, en une itération de l'historique.

/** Ce que l'interface montre pendant l'exécution. */
export type Ui = {
  steps(steps: Step[]): void;
  /** null : « Décider pour moi ». */
  ask(questions: Question[]): Promise<Answers | null>;
  confirm(items: string[]): Promise<boolean>;
};

/** Le code, hors du fichier projet ; fourni par le processus principal. */
export type Code = {
  /** Où en est le code : langage, dernière génération. */
  status(project: Project): Promise<string>;
  /** Écrit le brouillon sur disque puis génère ce qui a changé ; null : réussi. */
  generate(project: Project): Promise<string | null>;
  /** Écrit le brouillon puis retouche le code existant ; null : réussi. */
  edit(project: Project, instruction: string): Promise<string | null>;
  /** Rendu d'une page de l'aperçu : capture PNG (base64) et erreurs. */
  check(
    page: string,
    width: number,
  ): Promise<{ image?: string; errors: string[] }>;
};

export type Run = {
  project: Project;
  instruction: string;
  /** Images jointes, chemins absolus. */
  images: string[];
  /** Page ouverte dans l'app. */
  page?: string;
  settings: Settings;
  ui: Ui;
  code: Code;
};
export type Outcome = { project: Project; choices: string[]; advice?: Advice };

const AGENT = `Tu es l'agent de Studio : designer et développeur du projet. Tu exécutes l'instruction avec tes outils, en silence : aucune explication, aucun texte, aucun résumé, jamais de discussion.

Méthode :
1. overview d'abord : c'est l'état réel du projet ; ne te fie pas à ce que tu crois des demandes précédentes. Lis (read) seulement ce dont tu as besoin.
2. Demande ambiguë dont un mauvais choix coûterait cher à refaire (style ou ambiance, nombre de pages, langage, structure d'une page, fonctionnalité incertaine) : un seul appel ask, avant toute modification ; 1 à 3 questions, 2 à 4 options courtes, la recommandée en premier. Jamais une question déjà tranchée dans decisions. Demande claire ou facile à annuler : aucune question, décide seul le choix le plus raisonnable.
3. Plus d'une étape : plan (2 à 6 étapes de 1 ou 2 mots : « Design system », « Pages », « Contenus », « Code », « Vérification »), puis step dès qu'une étape est finie.
4. Ordre : design system (fondations, composants) → pages → collections → code. Respecte decisions, garde les identifiants, ne casse rien de ce qui marche.
5. Écris par petits lots : un appel write par famille de tokens, par quelques composants ou par page ; une page longue : sa racine d'abord, puis une section par update_node. write et update_node valident chaque écriture : corrige toute erreur ou référence absente qu'ils signalent.
6. Code : quand l'instruction crée ou refait un site ou une app, ou quand du code existe déjà (overview.code) et que le projet change. Sans langage : set_target (decisions, sinon react). generate_code régénère ce qui a changé et construit. edit_code pour la logique que le projet ne décrit pas : navigation, formulaires avec validation, filtres, recherche, états, données des collections, stockage local, appels d'API externes : clé lue dans une variable d'environnement (VITE_… en React, NEXT_PUBLIC_… en Next.js), jamais écrite ; si overview.code ne la liste pas, nomme-la dans l'avis pour qu'elle soit ajoutée dans Paramètres. check_preview vérifie le rendu (bureau 1280, mobile 390) : corrige ce qui est cassé.
7. Hors périmètre : authentification, rôles, backend, base de données distante, déploiement. Fais seulement l'interface et signale-le dans l'avis.
8. Supprimer une page, un composant ou une collection : write avec value null ; l'app demande confirmation. Refusée : n'insiste pas.
9. Mobile ou tablette : styles tablet et mobile sur chaque nœud concerné.
10. Projet nommé « Nouveau projet » : set_name avec un nom court tiré de la demande.

Fin : uniquement la sortie structurée. advice : une ou deux phrases, ton direct, sans jargon : ce que tu observes du projet et ton avis de designer pour la suite, pas un résumé de ce que tu as fait. apply : l'instruction qui exécute cet avis, si elle est utile. advice null si rien d'utile.

Format du projet :
${RULES}`;

const adviceSchema = z.object({
  advice: z
    .object({
      text: z.string().min(1).max(240),
      apply: z.string().min(1).max(300).optional(),
    })
    .nullable(),
});

const foundationKinds = Object.keys(foundationsSchema.shape) as Array<
  keyof Project['foundations']
>;
const kinds = [
  ...foundationKinds,
  'components',
  'pages',
  'collections',
] as const;
type Kind = (typeof kinds)[number];
const guarded = new Set<Kind>(['components', 'pages', 'collections']);
const kindLabel: Partial<Record<Kind, string>> = {
  components: 'Composant',
  pages: 'Page',
  collections: 'Collection',
};

const map = <T, U>(o: Record<string, T>, fn: (v: T) => U) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)]));

/** Une ligne par élément, indentée : de quoi viser sans tout relire. */
export function outline(n: Node, depth = 0): string[] {
  const bits = [
    `${'  '.repeat(depth)}${n.id} ${n.kind}`,
    n.name && `« ${n.name} »`,
    n.component && `→ ${n.component}`,
    n.bind && `⇢ ${n.bind.collection}${n.bind.field ? `.${n.bind.field}` : ''}`,
    n.text && JSON.stringify(n.text.slice(0, 40)),
  ];
  return [
    bits.filter(Boolean).join(' '),
    ...(n.children ?? []).flatMap((c) => outline(c, depth + 1)),
  ];
}

/** Vue d'ensemble légère : noms, plans des pages, décisions. */
export const overview = (p: Project) => ({
  name: p.name,
  targets: p.targets,
  decisions: p.decisions ?? [],
  foundations: map(p.foundations, (v) => Object.keys(v)),
  components: map(p.components, (c) => ({
    name: c.name,
    states: Object.keys(c.states),
  })),
  pages: map(p.pages, (pg) => ({
    name: pg.name,
    outline: outline(pg.root).slice(0, 200),
  })),
  collections: map(p.collections, (c) => ({
    name: c.name,
    fields: c.fields.map((f) => `${f.id}:${f.type}`),
    items: c.items.length,
  })),
});

const text = (t: string, isError = false) => ({
  content: [{ type: 'text' as const, text: t }],
  ...(isError && { isError: true }),
});
const json = (v: unknown) => text(JSON.stringify(v));

/** Les outils de l'agent sur un brouillon du projet. */
export function session(run: Run) {
  let draft = run.project;
  let steps: Step[] = [];
  let asked = false;
  let wrote = false;
  const choices: string[] = [];

  const accept = (next: unknown) => {
    const r = projectSchema.safeParse(next);
    if (!r.success) return z.prettifyError(r.error);
    draft = r.data;
    wrote = true;
    return null;
  };
  const broken = () => {
    const b = brokenReferences(draft);
    return b.length ? ` Références absentes : ${b.join(', ')}.` : '';
  };
  const show = (next: Step[]) => {
    steps = next;
    run.ui.steps(steps);
  };

  const tools = {
    overview: tool(
      'overview',
      'État réel du projet et du code. À lire avant de modifier.',
      {},
      async () =>
        json({ ...overview(draft), code: await run.code.status(draft) }),
    ),
    read: tool(
      'read',
      'Lit en entier les fondations, un composant, une page, une collection, ou le schéma JSON du projet.',
      {
        kind: z.enum([
          'foundations',
          'component',
          'page',
          'collection',
          'schema',
        ]),
        id: z.string().optional(),
      },
      async ({ kind, id }) => {
        if (kind === 'schema')
          return json(z.toJSONSchema(projectSchema, { io: 'input' }));
        if (kind === 'foundations') return json(draft.foundations);
        const bag = {
          component: draft.components,
          page: draft.pages,
          collection: draft.collections,
        }[kind];
        const v = id ? bag[id] : undefined;
        return v ? json(v) : text('Introuvable', true);
      },
    ),
    write: tool(
      'write',
      'Crée, remplace ou supprime (value: null) des tokens, composants, pages ou collections. Chaque value est complète et suit le schéma (read kind=schema).',
      {
        changes: z
          .array(
            z.object({
              kind: z.enum(kinds),
              id: z.string(),
              value: z.record(z.string(), z.unknown()).nullable(),
            }),
          )
          .min(1)
          .max(50),
      },
      async ({ changes }) => {
        const bag = (p: Project, k: Kind): Record<string, unknown> =>
          (foundationKinds as string[]).includes(k)
            ? p.foundations[k as keyof Project['foundations']]
            : p[k as 'components' | 'pages' | 'collections'];
        const gone = changes.filter(
          (c) =>
            c.value === null && guarded.has(c.kind) && bag(draft, c.kind)[c.id],
        );
        const refused =
          gone.length &&
          !(await run.ui.confirm(
            gone.map((c) => {
              const v = bag(draft, c.kind)[c.id] as { name: string };
              return `${kindLabel[c.kind]} « ${v.name} »`;
            }),
          ))
            ? new Set(gone)
            : new Set();
        const next = structuredClone(draft);
        for (const c of changes) {
          if (refused.has(c)) continue;
          if (c.value === null) delete bag(next, c.kind)[c.id];
          else bag(next, c.kind)[c.id] = c.value;
        }
        const err = accept(next);
        if (err) return text(err, true);
        return text(
          `Écrit.${broken()}${refused.size ? ' Suppression refusée : ne la refais pas.' : ''}`,
        );
      },
    ),
    update_node: tool(
      'update_node',
      "Remplace un élément (et ses enfants) d'une page ou d'un composant ; même identifiant.",
      {
        page: z.string().optional(),
        component: z.string().optional(),
        id: z.string(),
        node: z.record(z.string(), z.unknown()),
      },
      async ({ page, component, id, node }) => {
        const owner = page
          ? draft.pages[page]
          : component
            ? draft.components[component]
            : undefined;
        if (!owner || !find(owner.root, id))
          return text('Élément introuvable', true);
        const root = update(owner.root, id, () => ({ ...node, id }) as Node);
        const next = page
          ? { ...draft, pages: { ...draft.pages, [page]: { ...owner, root } } }
          : {
              ...draft,
              components: {
                ...draft.components,
                [component!]: { ...owner, root },
              },
            };
        const err = accept(next);
        return err ? text(err, true) : text(`Écrit.${broken()}`);
      },
    ),
    set_name: tool(
      'set_name',
      'Nom du projet, 1 à 3 mots.',
      { name: z.string().min(1).max(40) },
      async ({ name }) => {
        const err = accept({ ...draft, name });
        return err ? text(err, true) : text('Écrit.');
      },
    ),
    set_target: tool(
      'set_target',
      'Langage du code généré.',
      { target: z.enum(targets) },
      async ({ target }) => {
        accept({ ...draft, targets: [target] });
        return text('Écrit.');
      },
    ),
    ask: tool(
      'ask',
      'QCM avant toute modification, une seule fois : 1 à 3 questions, 2 à 4 options courtes, la recommandée en premier. Renvoie les choix.',
      {
        questions: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().min(1).max(120),
              options: z.array(z.string().min(1).max(60)).min(2).max(4),
            }),
          )
          .min(1)
          .max(3),
      },
      async ({ questions }) => {
        const known = new Map(
          (draft.decisions ?? []).map((d) => [d.question, d.answer]),
        );
        const open = questions.filter((q) => !known.has(q.label));
        // Une seule interruption, avant d'agir ; sinon la recommandation.
        const answers =
          open.length && run.settings.questions && !asked && !wrote
            ? await run.ui.ask(open)
            : null;
        asked = true;
        const out = questions.map((q) => ({
          question: q.label,
          answer: known.get(q.label) ?? answers?.[q.id] ?? q.options[0],
        }));
        const fresh = out.filter((o) => !known.has(o.question));
        if (fresh.length) {
          draft = projectSchema.parse({
            ...draft,
            decisions: [...(draft.decisions ?? []), ...fresh].slice(-100),
          });
          choices.push(...fresh.map((o) => `${o.question} : ${o.answer}`));
        }
        return json(out);
      },
    ),
    plan: tool(
      'plan',
      'Étapes affichées (1 ou 2 mots chacune).',
      { steps: z.array(z.string().min(1).max(24)).min(2).max(6) },
      async ({ steps: labels }) => {
        show(
          labels.map((label, i) => ({ label, state: i ? 'todo' : 'doing' })),
        );
        return text('Affiché.');
      },
    ),
    step: tool(
      'step',
      "Étape finie (done) ou en échec (failed, une ligne courte d'erreur).",
      {
        index: z.number().int().min(0),
        state: z.enum(['done', 'failed']),
        error: z.string().max(80).optional(),
      },
      async ({ index, state, error }) => {
        if (!steps[index]) return text('Étape inconnue', true);
        const next = steps.map((s, i) =>
          i === index ? { label: s.label, state, ...(error && { error }) } : s,
        );
        const todo = next.findIndex((s) => s.state === 'todo');
        if (
          state === 'done' &&
          todo >= 0 &&
          !next.some((s) => s.state === 'doing')
        )
          next[todo] = { ...next[todo], state: 'doing' };
        show(next);
        return text('Affiché.');
      },
    ),
    generate_code: tool(
      'generate_code',
      'Écrit le projet, puis génère et construit le code de ce qui a changé.',
      {},
      async () => {
        if (!draft.targets.length)
          return text('Aucun langage : set_target d’abord.', true);
        const err = await run.code.generate(draft);
        return err ? text(err, true) : text('Code généré et construit.');
      },
    ),
    edit_code: tool(
      'edit_code',
      'Retouche le code généré (logique, interactions) par l’agent Développement, qui construit et corrige.',
      { instruction: z.string().min(1).max(4000) },
      async ({ instruction }) => {
        if (!draft.targets.length)
          return text('Aucun langage : set_target d’abord.', true);
        const err = await run.code.edit(draft, instruction);
        return err ? text(err, true) : text('Code retouché et construit.');
      },
    ),
    check_preview: tool(
      'check_preview',
      'Rendu d’une page de l’aperçu à une largeur donnée : capture et erreurs de la console.',
      {
        page: z
          .string()
          .default('')
          .describe(
            'Chemin relatif à l’aperçu : « », « #/contact », « contact.html »',
          ),
        width: z.number().int().min(320).max(1920).default(1280),
      },
      async ({ page, width }) => {
        const r = await run.code.check(page, width);
        return {
          content: [
            ...(r.image
              ? [
                  {
                    type: 'image' as const,
                    data: r.image,
                    mimeType: 'image/png',
                  },
                ]
              : []),
            {
              type: 'text' as const,
              text: r.errors.length
                ? `Erreurs :\n${r.errors.join('\n')}`
                : 'Aucune erreur.',
            },
          ],
        };
      },
    ),
  };

  return {
    tools,
    get project() {
      return draft;
    },
    choices,
    /** L'étape en cours passe en échec, une ligne. */
    fail(error: string) {
      const i = steps.findIndex((s) => s.state === 'doing');
      if (i >= 0)
        show(
          steps.map((s, j) => (j === i ? { ...s, state: 'failed', error } : s)),
        );
    },
  };
}

/** Exécute une instruction globale ; rien n'est écrit dans le projet ici. */
export async function orchestrate(
  run: Run,
  abort?: AbortController,
): Promise<Outcome> {
  const s = session(run);
  let advice: Advice | undefined;
  const studio = createSdkMcpServer({
    name: 'studio',
    version: '1.0.0',
    tools: Object.values(s.tools),
  });
  /** Un passage de l'agent ; advice null : réponse incomplète. */
  async function turn(
    prompt: string | AsyncIterable<SDKUserMessage>,
    resume?: string,
  ) {
    let session = resume;
    for await (const m of query({
      prompt,
      options: {
        systemPrompt: AGENT,
        tools: [],
        settingSources: [],
        env: claudeEnv(),
        mcpServers: { studio },
        allowedTools: Object.keys(s.tools).map((t) => `mcp__studio__${t}`),
        permissionMode: 'dontAsk',
        maxTurns: 150,
        outputFormat: {
          type: 'json_schema',
          schema: z.toJSONSchema(adviceSchema, {
            target: 'draft-7',
          }) as Record<string, unknown>,
        },
        abortController: abort,
        ...(resume && { resume }),
      },
    })) {
      session = m.session_id ?? session;
      if (process.env.STUDIO_DEBUG && m.type === 'assistant')
        for (const c of m.message.content)
          if (c.type === 'tool_use')
            console.log(
              '[agent]',
              c.name,
              JSON.stringify(c.input).slice(0, 200),
            );
          else if (c.type === 'text')
            console.log('[agent:text]', c.text.slice(0, 300));
      if (m.type === 'result') {
        if (process.env.STUDIO_DEBUG)
          console.log('[agent] fin', m.subtype, m.num_turns, m.total_cost_usd);
        if (m.subtype === 'success') {
          const r = adviceSchema.safeParse(m.structured_output);
          return {
            session,
            advice: r.success ? (r.data.advice ?? undefined) : null,
          };
        }
        if (m.subtype !== 'error_during_execution') throw new Error(m.subtype);
      }
    }
    return { session, advice: null };
  }
  try {
    if (process.env.STUDIO_FAKE_AGENT) advice = await fake(s);
    else {
      const prompt = [
        run.page && `Page ouverte : ${run.page}`,
        `Instruction : ${run.instruction}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      // Réponse coupée (veille, réseau) : la même session reprend, deux fois au plus.
      let session: string | undefined;
      for (let attempt = 0; ; attempt++) {
        const out = await turn(
          session
            ? 'Reprends là où tu t’es arrêté : relis overview, termine l’instruction, puis la sortie structurée.'
            : run.images.length
              ? withImages(prompt, run.images)
              : prompt,
          session,
        );
        session = out.session;
        if (out.advice !== null) {
          advice = out.advice;
          break;
        }
        if (attempt >= 2 || !session) throw new Error('Réponse incomplète');
      }
    }
    const project = projectSchema.parse(s.project);
    if (brokenReferences(project).length)
      throw new Error('Références invalides');
    return {
      project,
      choices: s.choices,
      ...(advice && run.settings.advice && { advice }),
    };
  } catch (e) {
    if (process.env.STUDIO_DEBUG) console.log('[agent] échec', e);
    s.fail('Échec');
    throw e;
  }
}

// Tests : le design system de STUDIO_FAKE_AGENT, par les mêmes outils ;
// STUDIO_FAKE_ASK (questions) et STUDIO_FAKE_ADVICE (avis) en option.
async function fake(s: ReturnType<typeof session>) {
  const call = <K extends keyof typeof s.tools>(
    k: K,
    args: Parameters<(typeof s.tools)[K]['handler']>[0],
  ) =>
    (
      s.tools[k].handler as (
        a: typeof args,
        e: unknown,
      ) => Promise<{ isError?: boolean; content: { text?: string }[] }>
    )(args, null).then((r) => {
      if (r.isError) throw new Error(r.content[0]?.text);
      return r;
    });
  const file = async (f: string) => JSON.parse(await readFile(f, 'utf8'));
  if (process.env.STUDIO_FAKE_ASK)
    await call('ask', { questions: await file(process.env.STUDIO_FAKE_ASK) });
  await call('plan', { steps: ['Design system', 'Pages'] });
  const out = await file(process.env.STUDIO_FAKE_AGENT!);
  const changes = [
    ...foundationKinds.flatMap((k) =>
      Object.entries(out.foundations?.[k] ?? {}).map(([id, value]) => ({
        kind: k,
        id,
        value,
      })),
    ),
    ...(['components', 'pages', 'collections'] as const).flatMap((k) =>
      Object.entries(out[k] ?? {}).map(([id, value]) => ({
        kind: k,
        id,
        value,
      })),
    ),
  ] as { kind: Kind; id: string; value: Record<string, unknown> }[];
  for (let i = 0; i < changes.length; i += 50)
    await call('write', { changes: changes.slice(i, i + 50) });
  await call('step', { index: 0, state: 'done', error: undefined });
  await call('step', { index: 1, state: 'done', error: undefined });
  return process.env.STUDIO_FAKE_ADVICE
    ? (JSON.parse(process.env.STUDIO_FAKE_ADVICE) as Advice)
    : undefined;
}
