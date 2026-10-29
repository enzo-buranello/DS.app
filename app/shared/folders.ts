// Dossiers d'éléments : « dossier/sous-dossier/nom » dans le nom d'un élément.

export type Folder = {
  name: string;
  path: string;
  /** [identifiant, nom sans le chemin] */
  leaves: [string, string][];
  folders: Folder[];
};

export function tree(items: [string, { name: string }][]): Folder {
  const root: Folder = { name: '', path: '', leaves: [], folders: [] };
  for (const [id, { name }] of items) {
    const parts = name
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const label = parts.pop() ?? name;
    let at = root;
    for (const part of parts) {
      let next = at.folders.find((f) => f.name === part);
      if (!next) {
        next = {
          name: part,
          path: at.path ? `${at.path}/${part}` : part,
          leaves: [],
          folders: [],
        };
        at.folders.push(next);
      }
      at = next;
    }
    at.leaves.push([id, label]);
  }
  return root;
}

/** Le dossier et tous ses sous-dossiers, dans l'ordre d'affichage. */
export const flatten = (f: Folder): Folder[] => [
  f,
  ...f.folders.flatMap(flatten),
];

export const contains = (f: Folder, id: string) =>
  flatten(f).some((x) => x.leaves.some(([leaf]) => leaf === id));
