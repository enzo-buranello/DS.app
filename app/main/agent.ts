import { readFile } from 'node:fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Scope } from '../shared/api.js';
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

async function ask(prompt: string, schema: z.ZodType, fake?: string) {
  if (fake) return schema.parse(JSON.parse(await readFile(fake, 'utf8')));
  for await (const m of query({
    prompt,
    options: {
      systemPrompt: DESIGN,
      tools: [],
      settingSources: [],
      maxTurns: 4,
      outputFormat: { type: 'json_schema', schema: jsonSchema(schema) },
    },
  }))
    if (m.type === 'result') {
      if (m.subtype === 'success') return schema.parse(m.structured_output);
      throw new Error(m.subtype);
    }
  throw new Error('Aucun résultat');
}

/** Applique une instruction et renvoie le projet modifié. */
export async function design(
  project: Project,
  instruction: string,
  scope: Scope = {},
  source?: unknown,
): Promise<Project> {
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
      prompt,
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
      source && `Import Figma à convertir :\n${JSON.stringify(source)}`,
      `Portée globale. Instruction : ${instruction}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const out = (await ask(
      prompt,
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

// Nom proposé pour un composant créé depuis une page : requête courte, sans outil.
const NAME = `Tu nommes un composant d'interface d'après son contenu. Un nom court en français, 1 à 3 mots, sans guillemets (ex. « Carte produit », « Bouton principal »). Uniquement la sortie structurée.`;
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
