import { readFile } from 'node:fs/promises';
import {
  query,
  type Options,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Scope } from '../shared/api.js';
import { figmaEnv, figmaServer, figmaTools, type FigmaLink } from './figma.js';
import { find, update } from '../shared/nodes.js';
import {
  brokenReferences,
  designSchema,
  nodeSchema,
  projectSchema,
  type Node,
  type Project,
} from '../shared/project.js';

// Agent Design : connexion Claude Code existante, aucun outil, aucune réponse
// en texte. Portée globale : il renvoie le design system et les pages ; portée
// élément : il ne renvoie que cet élément. Tout est validé avant d'être écrit,
// et seule l'app écrit, dans le dossier du projet.

const DESIGN = `Tu es le designer d'un projet d'application. Tu exécutes l'instruction en silence : aucune explication, aucune question, uniquement la sortie structurée. Tu ne touches qu'à ce que la portée désigne.

Règles :
- Portée globale : tu renvoies le design system complet (fondations, composants) et les pages. Garde tel quel tout ce que l'instruction ne demande pas de changer, avec les mêmes identifiants.
- Portée élément : tu renvoies uniquement cet élément (et ses enfants), avec le même identifiant. Rien d'autre.
- Utilise les fondations et les composants du design system : gap, padding, maxWidth → spacing ; background, color, border → colors ; radius → radius ; shadow → shadows ; font → fonts ; un composant s'insère par un nœud « component » qui donne son id. Une valeur libre (nombre en px, couleur #rrggbb) seulement si rien ne convient.
- Noms : regroupe les éléments d'une même famille en dossiers avec « dossier/nom » (ex. « Primaire/500 », « Boutons/Principal ») dès que le design system grandit.
- Identifiants : minuscules, chiffres et tirets, en anglais court (primary, text-muted, space-4, button, home).
- Couleurs : une valeur claire et une valeur sombre, contraste AA pour le texte. Toujours une couleur background (fond de page) et une couleur text.
- Mise en page en flux de préférence : box (direction row, column ou grid avec columns ; gap, align, justify, width, height), text (text), image (src), shape, component. La disposition « free » (x, y) seulement si on la demande.
- Une page : racine « root », box en colonne, width fill, des sections empilées.
- Contenus : une collection a des champs (text, longText, image, number, date, link, boolean) et des éléments. Pour afficher une collection, un nœud « list » avec bind.collection ; ses enfants forment le modèle d'un élément, et un text ou une image s'y lie par bind { collection, field }. Tu peux créer ou remplir des collections en portée globale.
- Styles d'un nœud par format : desktop, puis tablet et mobile seulement s'ils changent.
- États d'un composant (hover, active, disabled) : patch de style par identifiant de nœud.
- Identifiants de nœuds uniques dans chaque page et chaque composant.
- Design system vide : crée une base complète et cohérente (couleurs sémantiques, échelle typographique, espacements, arrondis, ombres) et les composants de base utiles (bouton, bouton secondaire, champ, carte, badge…).`;

const globalSchema = designSchema.extend({
  pages: projectSchema.shape.pages.optional(),
  collections: projectSchema.shape.collections.optional(),
});
const elementSchema = z.object({ node: nodeSchema });
const jsonSchema = (s: z.ZodType) =>
  z.toJSONSchema(s, { io: 'input', target: 'draft-7' }) as Record<
    string,
    unknown
  >;

const media = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} as const;

/** Instruction accompagnée d'images de référence. */
async function* withImages(
  text: string,
  files: string[],
): AsyncIterable<SDKUserMessage> {
  const images = await Promise.all(
    files.map(async (f) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: media[f.split('.').pop() as keyof typeof media],
        data: (await readFile(f)).toString('base64'),
      },
    })),
  );
  yield {
    type: 'user',
    message: {
      role: 'user',
      content: [
        ...images,
        {
          type: 'text',
          text: `Images jointes : références visuelles.\n\n${text}`,
        },
      ],
    },
    parent_tool_use_id: null,
  };
}

async function ask(
  prompt: string | AsyncIterable<SDKUserMessage>,
  schema: z.ZodType,
  fake?: string,
  options: Options = {},
) {
  if (fake) return schema.parse(JSON.parse(await readFile(fake, 'utf8')));
  for await (const m of query({
    prompt,
    options: {
      systemPrompt: DESIGN,
      tools: [],
      settingSources: [],
      maxTurns: 4,
      outputFormat: { type: 'json_schema', schema: jsonSchema(schema) },
      ...options,
    },
  })) {
    // Import Figma : connexion absente ou expirée, rien n'est lu.
    if (
      m.type === 'system' &&
      m.subtype === 'init' &&
      options.mcpServers?.figma &&
      m.mcp_servers.find((s) => s.name === 'figma')?.status !== 'connected'
    )
      throw new Error('figma:auth');
    if (m.type === 'result') {
      if (m.subtype === 'success') return schema.parse(m.structured_output);
      throw new Error(m.subtype);
    }
  }
  throw new Error('Aucun résultat');
}

/** Applique une instruction et renvoie le projet modifié. */
export async function design(
  project: Project,
  instruction: string,
  scope: Scope = {},
  images: string[] = [],
): Promise<Project> {
  const send = (text: string) =>
    images.length ? withImages(text, images) : text;
  const ds = {
    foundations: project.foundations,
    components: project.components,
  };
  const fields = Object.fromEntries(
    Object.entries(project.collections).map(([k, c]) => [
      k,
      { name: c.name, fields: c.fields },
    ]),
  );
  let next: Project;
  if (scope.node) {
    const tree = scope.page
      ? project.pages[scope.page]?.root
      : scope.component && project.components[scope.component]?.root;
    const node = tree && find(tree, scope.node)?.node;
    if (!tree || !node) throw new Error('Élément introuvable');
    const prompt = [
      `Design system :\n${JSON.stringify(ds)}`,
      `Collections :\n${JSON.stringify(fields)}`,
      `Portée élément. Élément à modifier :\n${JSON.stringify(node)}`,
      `Instruction : ${instruction}`,
    ].join('\n\n');
    const out = (await ask(
      send(prompt),
      elementSchema,
      process.env.STUDIO_FAKE_NODE,
    )) as {
      node: Node;
    };
    const root = update(tree, node.id, () => ({ ...out.node, id: node.id }));
    next = scope.page
      ? {
          ...project,
          pages: {
            ...project.pages,
            [scope.page]: { ...project.pages[scope.page], root },
          },
        }
      : {
          ...project,
          components: {
            ...project.components,
            [scope.component!]: {
              ...project.components[scope.component!],
              root,
            },
          },
        };
  } else {
    const prompt = [
      `Projet actuel :\n${JSON.stringify({ ...ds, pages: project.pages, collections: project.collections })}`,
      scope.page && `Page ouverte : ${scope.page}`,
      `Portée globale. Instruction : ${instruction}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const out = (await ask(
      send(prompt),
      globalSchema,
      process.env.STUDIO_FAKE_AGENT,
    )) as z.infer<typeof globalSchema>;
    next = {
      ...project,
      ...out,
      pages: out.pages ?? project.pages,
      collections: out.collections ?? project.collections,
    };
  }
  next = projectSchema.parse(next);
  if (brokenReferences(next).length) throw new Error('Références invalides');
  return next;
}

// Import Figma : l'agent lit le fichier par le MCP de Figma (lecture seule)
// et renvoie les fondations et les composants. Un réimport met à jour sans
// doublon ; ce qui n'a pas été renvoyé (ajouts faits dans l'app) est gardé.
const FIGMA = `${DESIGN}

Import Figma. Tu lis le fichier avec les outils Figma, puis tu crées ou complètes le design system du projet.
- Lecture légère : commence par create_session avec la clé du fichier. Si un nœud est donné, ne lis que ce nœud (get_metadata, get_variable_defs, get_design_context, get_screenshot). Sinon, get_metadata du fichier, puis seulement les pages qui contiennent des composants ou des styles.
- Variables et styles définis : convertis-les en fondations. Sinon, déduis-les du design visible : couleurs récurrentes regroupées en neutres, couleurs principales et états (succès, alerte, erreur) ; échelle typographique ; espacements et arrondis récurrents ; ombres.
- Composants : ceux déclarés (avec leurs variantes d'état) et les motifs réutilisables qui se répètent, même non déclarés. Ils n'utilisent que les tokens créés, aucune valeur libre.
- Noms clairs en français, sans jargon (« Primaire/500 », « Bouton principal ») ; identifiants courts en anglais.
- Design system existant : mets à jour les tokens et composants correspondants en gardant leurs identifiants, sans créer de doublon. Renvoie le design system complet.
- Fichier introuvable, non partagé ou illisible : found = false, rien d'autre.`;

const importSchema = z.object({
  found: z.boolean(),
  design: designSchema.optional(),
});

/** Lit le fichier Figma et renvoie le projet avec son design system. */
export async function importFigma(
  project: Project,
  link: FigmaLink,
): Promise<Project> {
  const ds = {
    foundations: project.foundations,
    components: project.components,
  };
  const prompt = [
    `Design system actuel :\n${JSON.stringify(ds)}`,
    `Fichier Figma : ${link.fileKey}`,
    link.nodeId ? `Nœud visé : ${link.nodeId}` : 'Lien vers le fichier entier.',
  ].join('\n\n');
  const out = (await ask(prompt, importSchema, process.env.STUDIO_FAKE_FIGMA, {
    systemPrompt: FIGMA,
    maxTurns: 40,
    mcpServers: figmaServer,
    allowedTools: figmaTools,
    permissionMode: 'dontAsk',
    env: figmaEnv,
  })) as z.infer<typeof importSchema>;
  if (!out.found || !out.design) throw new Error('figma:notfound');
  const f = project.foundations;
  const d = out.design.foundations;
  const next = projectSchema.parse({
    ...project,
    foundations: {
      colors: { ...f.colors, ...d.colors },
      fonts: { ...f.fonts, ...d.fonts },
      spacing: { ...f.spacing, ...d.spacing },
      radius: { ...f.radius, ...d.radius },
      shadows: { ...f.shadows, ...d.shadows },
    },
    components: { ...project.components, ...out.design.components },
    figma: { fileKey: link.fileKey, importedAt: new Date().toISOString() },
  });
  if (brokenReferences(next).length) throw new Error('Références invalides');
  return next;
}

// Nom proposé pour un composant créé depuis une page : requête courte, sans outil.
const NAME = `Tu nommes un composant d'interface d'après son contenu. Un nom court en français, 1 à 3 mots, sans guillemets (ex. « Carte produit », « Bouton principal »). Range-le dans le dossier existant qui convient (« dossiers ») sous la forme « Dossier/Nom », par exemple « Boutons/Principal » ; sinon un nouveau dossier au pluriel (« Navigation/En-tête »). Le nom ne reprend aucun nom de « existants ». Uniquement la sortie structurée.`;
const nameSchema = z.object({ name: z.string().min(1).max(40) });

export async function suggestName(summary: string): Promise<string> {
  if (process.env.STUDIO_FAKE_NAME) return process.env.STUDIO_FAKE_NAME;
  for await (const m of query({
    prompt: summary.slice(0, 4000),
    options: {
      systemPrompt: NAME,
      tools: [],
      settingSources: [],
      maxTurns: 3,
      outputFormat: {
        type: 'json_schema',
        schema: z.toJSONSchema(nameSchema, { target: 'draft-7' }) as Record<
          string,
          unknown
        >,
      },
    },
  }))
    if (m.type === 'result' && m.subtype === 'success')
      return nameSchema.parse(m.structured_output).name.trim();
  throw new Error('Aucun nom');
}
