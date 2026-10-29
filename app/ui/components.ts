import { componentize, draftName } from '../shared/instances.js';
import type { Node, Project } from '../shared/project.js';

// Création d'un composant depuis un élément, commune aux pages et aux
// composants ; le nom provisoire est remplacé par celui que propose l'IA.

/** Modifie le dernier état connu ; `label` nomme l'action dans l'historique. */
export type Update = (fn: (p: Project) => Project, label?: string) => void;

export function renameComponent(p: Project, id: string, name: string): Project {
  const c = p.components[id];
  if (!c) return p;
  return {
    ...p,
    components: {
      ...p.components,
      [id]: { ...c, name, root: { ...c.root, name } },
    },
  };
}

/** Nom libre parmi les composants : « Nom 2 » si déjà pris. */
function unique(name: string, p: Project, self: string) {
  const taken = new Set(
    Object.entries(p.components)
      .filter(([k]) => k !== self)
      .map(([, c]) => c.name.toLowerCase()),
  );
  let out = name;
  for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${name} ${i}`;
  return out;
}

const texts = (n: Node): string[] => [
  ...(n.text ? [n.text] : []),
  ...(n.children ?? []).flatMap(texts),
];

export function createComponent(
  project: Project,
  root: Node,
  id: string,
  embed: (p: Project, root: Node) => Project,
  onUpdate: Update,
) {
  const out = componentize(project, root, id);
  if (!out) return;
  // Le design system range ses composants en dossiers « Dossier/Nom ».
  const names = Object.values(project.components).map((x) => x.name);
  const folders = new Set(
    names.filter((n) => n.includes('/')).map((n) => n.split('/')[0]),
  );
  const draft = out.project.components[out.id].name;
  onUpdate(() => embed(out.project, out.root), 'Créer un composant');
  const c = out.project.components[out.id];
  window.studio
    .suggestName(
      JSON.stringify({
        textes: texts(c.root).slice(0, 12),
        nom: draftName(c.root, project),
        dossiers: [...folders],
        existants: [...names],
      }),
    )
    .then((name) =>
      onUpdate((p) =>
        p.components[out.id]?.name === draft
          ? renameComponent(p, out.id, unique(name, p, out.id))
          : p,
      ),
    )
    .catch(() => {});
}
