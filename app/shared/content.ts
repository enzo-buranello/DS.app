import { fieldTypes, type Node, type Project } from './project.js';

// Contenus : collections simples, valeurs typées, liaisons depuis les pages.

export type FieldType = (typeof fieldTypes)[number];
export type Value = string | number | boolean;
export type Collection = Project['collections'][string];

export const fieldLabels: Record<FieldType, string> = {
  text: 'Texte',
  longText: 'Texte long',
  image: 'Image',
  number: 'Nombre',
  date: 'Date',
  link: 'Lien',
  boolean: 'Oui/non',
};

/** Valeur gardée quand le type d'un champ change. */
export function convert(
  v: Value | undefined,
  type: FieldType,
): Value | undefined {
  if (v === undefined || v === '') return undefined;
  if (type === 'number') {
    const n =
      typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'boolean')
    return v === true || v === 'true' || v === 'oui' || v === 1;
  return String(v);
}

/** Texte affiché pour une valeur. */
export function display(v: Value | undefined, type: FieldType | undefined) {
  if (v === undefined || v === '') return '';
  if (type === 'boolean') return v ? 'Oui' : 'Non';
  if (type === 'date' && typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v))
    return new Date(v).toLocaleDateString('fr-FR');
  if (type === 'number' && typeof v === 'number')
    return v.toLocaleString('fr-FR');
  return String(v);
}

/** Collections et champs utilisés par les pages et les composants. */
export function bindings(p: Project) {
  const used = new Set<string>();
  const walk = (n: Node) => {
    if (n.bind) {
      used.add(n.bind.collection);
      if (n.bind.field) used.add(`${n.bind.collection}:${n.bind.field}`);
    }
    n.children?.forEach(walk);
  };
  Object.values(p.pages).forEach((pg) => walk(pg.root));
  Object.values(p.components).forEach((c) => walk(c.root));
  return used;
}

/** Collection de la liste la plus proche au-dessus d'un élément. */
export function listAbove(root: Node, id: string): string | null {
  const path: Node[] = [];
  const find = (n: Node): boolean => {
    path.push(n);
    if (n.id === id || n.children?.some(find)) return true;
    path.pop();
    return false;
  };
  if (!find(root)) return null;
  for (const n of path.slice(0, -1).reverse())
    if (n.kind === 'list' && n.bind) return n.bind.collection;
  return null;
}
