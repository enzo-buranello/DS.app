import { componentize, draftName } from '../shared/instances.js';
import type { Node, Project } from '../shared/project.js';

// Création d'un composant depuis un élément, commune aux pages et aux
// composants ; le nom provisoire est remplacé par celui que propose l'IA.

export type Update = (fn: (p: Project) => Project) => void;

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
  const draft = out.project.components[out.id].name;
  onUpdate(() => embed(out.project, out.root));
  const c = out.project.components[out.id];
  window.studio
    .suggestName(
      JSON.stringify({
        textes: texts(c.root).slice(0, 12),
        nom: draftName(c.root, project),
      }),
    )
    .then((name) =>
      onUpdate((p) =>
        p.components[out.id]?.name === draft
          ? renameComponent(p, out.id, name)
          : p,
      ),
    )
    .catch(() => {});
}
