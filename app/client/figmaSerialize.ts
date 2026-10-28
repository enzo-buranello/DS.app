import type { Tokens } from '../shared/model.js';
import { screenOf, type Doc } from '../shared/doc.js';
import type { ExportPayload, PageTarget } from '../shared/figmaExport.js';
import {
  designSystemScene,
  screenScene,
  type Box,
  type Measures,
} from '../shared/figmaScene.js';

// Export Figma (v2) : la scène est construite depuis le document de nœuds
// (shared/figmaScene.ts). Le rendu réel, dans une iframe cachée, ne sert
// qu'à mesurer positions et tailles calculées par le navigateur.

async function render(src: string, width: number, ready: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:1200px;border:0;opacity:0;pointer-events:none`;
  frame.src = src;
  document.body.append(frame);
  await new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    setTimeout(() => reject(new Error('Rendu trop long à charger.')), 15_000);
  });
  const doc = frame.contentDocument!;
  const deadline = Date.now() + 10_000;
  while (!doc.querySelector(ready)) {
    if (Date.now() > deadline) {
      frame.remove();
      throw new Error('Rendu introuvable pour l’export.');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  await doc.fonts?.ready;
  // Hauteur naturelle : l'iframe est réduite puis ajustée au contenu.
  const tick = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  frame.style.height = '50px';
  await tick();
  frame.style.height = `${doc.documentElement.scrollHeight}px`;
  await tick();
  return { frame, doc };
}
// Mesures relevées une fois : l'iframe est retirée aussitôt après.
function measure(root: Document): Measures {
  const boxes = new Map<string, Box>();
  const lines = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll('[data-ds-node]'))) {
    const key = el.getAttribute('data-ds-node')!;
    if (boxes.has(key)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    boxes.set(key, { x: r.left, y: r.top, w: r.width, h: r.height });
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    if (Number.isFinite(lh)) lines.set(key, lh);
  }
  return {
    box: (k) => boxes.get(k) ?? null,
    lineHeight: (k) => lines.get(k) ?? null,
  };
}
async function measured(src: string, width: number, ready: string) {
  const { frame, doc } = await render(src, width, ready);
  try {
    return measure(doc);
  } finally {
    frame.remove();
  }
}
async function currentDoc(): Promise<Doc> {
  const r = await fetch('/api/doc');
  if (!r.ok) throw new Error('Document illisible pour l’export.');
  return r.json();
}
// Images de fond : jointes en base64, une fois chacune.
async function withImages(
  payload: ExportPayload,
  assets: string[],
): Promise<ExportPayload> {
  const images: ExportPayload['images'] = [];
  for (const asset of assets) {
    const r = await fetch(`/api/assets/${asset}`);
    if (!r.ok) continue;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    images.push({ asset, data: btoa(bin) });
  }
  return { ...payload, images };
}

export async function designSystemPayload(
  tokens: Tokens,
  page: PageTarget,
): Promise<ExportPayload> {
  const doc = await currentDoc();
  const m = await measured('/?export=ds', 480, '.export-sheet');
  const { payload, assets } = designSystemScene(doc, tokens, page, m);
  return withImages(payload, assets);
}

export async function previewPayload(
  tokens: Tokens,
  page: PageTarget,
  scenario: { id: string; label: string; width: number },
): Promise<ExportPayload> {
  const doc = await currentDoc();
  const screen = await measured(
    `/?preview=1&scenario=${encodeURIComponent(scenario.id)}`,
    scenario.width,
    '.scenario',
  );
  const components = await measured('/?export=ds', 480, '.export-sheet');
  const node = screenOf(doc, scenario.id);
  const { payload, assets } = screenScene(
    doc,
    tokens,
    page,
    {
      node,
      id: scenario.id,
      label: doc.nodes[node]?.name ?? scenario.label,
      width: scenario.width,
    },
    screen,
    components,
  );
  return withImages(payload, assets);
}
