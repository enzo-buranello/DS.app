// Import Figma au plus léger : styles et composants publiés, puis leurs seuls
// nœuds. Jamais le fichier complet. Le résultat est réduit avant l'agent.

export const fileKey = (url: string) =>
  url.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/)?.[1] ?? null;

type FNode = Record<string, any>;
const hex = (c?: { r: number; g: number; b: number; a?: number }) =>
  c &&
  '#' +
    [c.r, c.g, c.b, ...(c.a !== undefined && c.a < 1 ? [c.a] : [])]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
const paints = (list?: FNode[]) =>
  list
    ?.filter((p) => p.visible !== false)
    .map((p) =>
      p.type === 'SOLID'
        ? hex({ ...p.color, a: p.opacity ?? p.color.a })
        : p.type,
    );

/** Garde ce qui sert au design system ; profondeur et enfants bornés. */
export function simplify(n: FNode | undefined, depth = 0): FNode | undefined {
  if (!n || depth > 6) return undefined;
  const out: FNode = { type: n.type, name: n.name };
  const keep = [
    'layoutMode',
    'itemSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'primaryAxisAlignItems',
    'counterAxisAlignItems',
    'layoutSizingHorizontal',
    'cornerRadius',
    'characters',
  ];
  for (const k of keep) if (n[k] !== undefined) out[k] = n[k];
  if (n.fills?.length) out.fills = paints(n.fills);
  if (n.strokes?.length) out.strokes = paints(n.strokes);
  if (n.effects?.length)
    out.effects = n.effects.map((e: FNode) => ({
      type: e.type,
      x: e.offset?.x,
      y: e.offset?.y,
      blur: e.radius,
      color: hex(e.color),
    }));
  if (n.style) {
    const { fontFamily, fontSize, fontWeight, lineHeightPx } = n.style;
    out.font = { fontFamily, fontSize, fontWeight, lineHeightPx };
  }
  const kids = (n.children as FNode[] | undefined)
    ?.slice(0, 30)
    .map((c) => simplify(c, depth + 1))
    .filter(Boolean);
  if (kids?.length) out.children = kids;
  return out;
}

export async function fetchFigma(
  key: string,
  token: string,
  get: typeof fetch = fetch,
) {
  const api = async (path: string) => {
    const r = await get(`https://api.figma.com/v1/files/${key}${path}`, {
      headers: { 'X-Figma-Token': token },
    });
    if (!r.ok) throw new Error(`Figma ${r.status}`);
    return r.json() as Promise<FNode>;
  };
  const [styles, components] = await Promise.all([
    api('/styles'),
    api('/components'),
  ]);
  const list = [
    ...(styles.meta?.styles ?? []),
    ...(components.meta?.components ?? []),
  ] as FNode[];
  const nodes: FNode = {};
  const ids = [...new Set(list.map((s) => s.node_id as string))];
  for (let i = 0; i < ids.length; i += 50)
    Object.assign(
      nodes,
      (
        await api(
          `/nodes?ids=${encodeURIComponent(ids.slice(i, i + 50).join(','))}`,
        )
      ).nodes,
    );
  const pick = (s: FNode) => ({
    name: s.name,
    ...(s.style_type && { type: s.style_type }),
    node: simplify(nodes[s.node_id]?.document),
  });
  return {
    styles: (styles.meta?.styles ?? []).map(pick),
    components: (components.meta?.components ?? []).map(pick),
  };
}
