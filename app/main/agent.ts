import { readFile } from 'node:fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
  brokenReferences,
  designSchema,
  type Design,
  type Project,
} from '../shared/project.js';

// Agent Design : connexion Claude Code existante, aucun outil, aucune réponse
// en texte. Il renvoie le design system complet, validé avant d'être appliqué.

const DESIGN = `Tu es le designer d'un projet d'application. Tu exécutes l'instruction en silence : aucune explication, aucune question, uniquement la sortie structurée.

Tu renvoies le design system complet (fondations et composants) après modification. Garde tel quel tout ce que l'instruction ne demande pas de changer, avec les mêmes identifiants.

Règles :
- Noms : regroupe les éléments d'une même famille en dossiers avec « dossier/nom » (ex. « Primaire/500 », « Boutons/Principal ») dès que le design system grandit.
- Identifiants : minuscules, chiffres et tirets, en anglais court (primary, text-muted, space-4, button).
- Couleurs : une valeur claire et une valeur sombre, contraste AA pour le texte. Toujours une couleur background (fond de page) et une couleur text.
- Les styles utilisent les identifiants de fondations existantes : gap, padding, maxWidth → spacing ; background, color, border → colors ; radius → radius ; shadow → shadows ; font → fonts. Une valeur libre (nombre en px, couleur #rrggbb) seulement si aucune fondation ne convient.
- Mise en page en flux uniquement. Nœuds : box (direction row ou column, gap, align, justify, width, height), text (text), image (src), component (instance d'un autre composant par son id).
- Styles d'un nœud par format : desktop, puis tablet et mobile seulement s'ils changent.
- États d'un composant (hover, active, disabled) : patch de style par identifiant de nœud.
- Identifiants de nœuds uniques dans chaque composant.
- Design system vide : crée une base complète et cohérente (couleurs sémantiques, échelle typographique, espacements, arrondis, ombres) et les composants de base utiles (bouton, bouton secondaire, champ, carte, badge…).`;

const schema = z.toJSONSchema(designSchema, {
  io: 'input',
  target: 'draft-7',
}) as Record<string, unknown>;

async function ask(prompt: string): Promise<unknown> {
  if (process.env.STUDIO_FAKE_AGENT)
    return JSON.parse(await readFile(process.env.STUDIO_FAKE_AGENT, 'utf8'));
  for await (const m of query({
    prompt,
    options: {
      systemPrompt: DESIGN,
      tools: [],
      settingSources: [],
      maxTurns: 4,
      outputFormat: { type: 'json_schema', schema },
    },
  }))
    if (m.type === 'result') {
      if (m.subtype === 'success') return m.structured_output;
      throw new Error(m.subtype);
    }
  throw new Error('Aucun résultat');
}

/** Applique une instruction au design system et renvoie le projet modifié. */
export async function design(
  project: Project,
  instruction: string,
  source?: unknown,
): Promise<Project> {
  const current: Design = {
    foundations: project.foundations,
    components: project.components,
  };
  const prompt = [
    `Design system actuel :\n${JSON.stringify(current)}`,
    source && `Import Figma à convertir :\n${JSON.stringify(source)}`,
    `Instruction : ${instruction}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const next = { ...project, ...designSchema.parse(await ask(prompt)) };
  if (brokenReferences(next).length) throw new Error('Références invalides');
  return next;
}
