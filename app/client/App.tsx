import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  ClockCounterClockwise,
  Cube,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react';
import {
  Catalogue,
  ExportSheet as ExportBoard,
  Scenario,
} from './DesignSystem.js';
import { newComponent, type DSComponent } from '../shared/component.js';
import { Inspector } from './inspector/Inspector.js';
import { MultiInspector } from './inspector/MultiInspector.js';
import { moveAbsolute } from '../shared/canvas.js';
import {
  groupAt,
  select as selectAt,
  setPropMany,
  type Selected,
} from '../shared/edit.js';
import type { PreviewState } from './NodeView.js';
import { addComponent } from '../shared/migrate.js';
import {
  LayersPanel,
  type LayerAction,
  type ScreenAction,
} from './LayersPanel.js';
import {
  addVariant,
  autoLayout,
  copy,
  createComponent as componentFrom,
  createScreen,
  deleteScreen,
  detach,
  duplicate,
  duplicateScreen,
  group,
  insert,
  insertionPoint,
  move,
  paste,
  realId,
  remove,
  type Change,
  type Clip,
} from '../shared/docOps.js';
import { locate } from '../shared/render.js';
import ProjectBrief from './ProjectBrief.js';
import FigmaExportButton from './FigmaExportButton.js';
import FigmaBridgePanel from './FigmaBridgePanel.js';
import ImageImport from './ImageImport.js';
import { useTokenDraft } from './useTokenDraft.js';
import { EditOverlay, type Surface } from './EditOverlay.js';
import { SelectionPanel } from './SelectionPanel.js';
import {
  canEditText,
  chainOf,
  describe,
  findByKey,
  type Selection,
} from './selection.js';
import { useUndo, type UndoOp, type UndoStacks } from './useUndo.js';
import { useVersion } from './useVersion.js';
import type { InstanceOverride } from '../shared/edits.js';
import {
  componentOf,
  screenOf,
  screenSlug,
  type Doc,
  type DocNode,
  type StateName,
} from '../shared/doc.js';
import { applyToComponent, readOwn, writeLegacy } from '../shared/legacy.js';
import { bootstrap, commit, getState, request, type Bootstrap } from './api.js';
import {
  contrast,
  tokenKeys,
  type Proposal,
  type State,
  type TokenKey,
  type Tokens,
  type TokenValue,
} from '../shared/model.js';

const devices = [
  { label: 'Compact · 320', width: 320, height: 568 },
  { label: 'Standard · 375', width: 375, height: 812 },
  { label: 'Grand · 430', width: 430, height: 932 },
  { label: 'Desktop · 1024', width: 1024, height: 768 },
];
// Largeur de rendu du catalogue avant mise à l'échelle dans la scène.
const CATALOGUE_WIDTH = 960;
const PROMPT_MAX_LINES = 4;
// Préférence d'affichage seulement : perdue sans conséquence si le stockage est refusé.
const SECTIONS_KEY = 'ds-studio-settings-sections-v1';
type SectionId = 'create' | 'image' | 'other';
function useSections() {
  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => {
    const fallback = { create: true, image: true, other: true };
    try {
      return {
        ...fallback,
        ...JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}'),
      };
    } catch {
      return fallback;
    }
  });
  // Écriture immédiate (idempotente) : un rechargement juste après le clic la conserve.
  const set = (id: SectionId, value: boolean) =>
    setOpen((o) => {
      if (o[id] === value) return o;
      const next = { ...o, [id]: value };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* Facultatif. */
      }
      return next;
    });
  return [open, set] as const;
}

function useDesignState() {
  const [state, setState] = useState<State>();
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || !live) return;
      inFlight = true;
      try {
        const s = await getState();
        if (live) {
          setState((current) =>
            !current || s.revision >= current.revision ? s : current,
          );
          setError('');
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1200);
    const channel = new BroadcastChannel('ds-studio');
    channel.onmessage = refresh;
    return () => {
      live = false;
      clearInterval(timer);
      channel.close();
    };
  }, []);
  return { state, setState, error };
}
function announceChange() {
  const c = new BroadcastChannel('ds-studio');
  c.postMessage('updated');
  c.close();
}
// Ajuste le contenu à la scène : jamais de défilement, seulement une réduction.
function useFit(
  frame: React.RefObject<HTMLElement | null>,
  content: React.RefObject<HTMLElement | null>,
  active: boolean,
) {
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 });
  useLayoutEffect(() => {
    const f = frame.current;
    const c = content.current;
    if (!active || !f || !c) return;
    const measure = () => {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      if (!w || !h) return;
      const scale = Math.min(f.clientWidth / w, f.clientHeight / h, 1);
      setFit({
        scale,
        x: Math.max(0, (f.clientWidth - w * scale) / 2),
        y: Math.max(0, (f.clientHeight - h * scale) / 2),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(f);
    observer.observe(c);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [frame, content, active]);
  return fit;
}
// Valeurs en cours d'édition, diffusées par l'éditeur avant leur écriture.
const LIVE = 'ds-studio-live';
interface Live {
  revision: number;
  tokens: Tokens;
  doc: Doc;
  /** État montré sur l'élément en cours d'édition. */
  preview: PreviewState | null;
}
interface NodeOp {
  id: string;
  before: DocNode | null;
  after: DocNode | null;
}
type Applied =
  | { type: 'token'; patches: Proposal['patches']; state: State }
  | { type: 'doc'; ops: NodeOp[] };
// Document de nœuds enregistré, relu à chaque changement annoncé.
function useDocFile() {
  const [doc, setDoc] = useState<Doc>();
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () =>
      request<Doc>('doc')
        .then((d) => {
          setDoc(d);
          setError('');
        })
        .catch((e) => setError(e.message));
    void load();
    const channel = new BroadcastChannel('ds-studio');
    channel.onmessage = load;
    return () => channel.close();
  }, []);
  return { doc, error };
}
function patchDoc(
  doc: Doc,
  nodes: { id: string; after: DocNode | null }[],
  screens?: string[],
) {
  const next = {
    ...doc,
    nodes: { ...doc.nodes },
    ...(screens ? { screens } : {}),
  };
  for (const n of nodes)
    if (n.after) next.nodes[n.id] = n.after;
    else delete next.nodes[n.id];
  return next;
}
export function Preview() {
  const { state, error } = useDesignState();
  const { doc: saved, error: docError } = useDocFile();
  const [live, setLive] = useState<Live>();
  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') ?? 'cards';
  const editing = params.get('mode') === 'edit';
  useEffect(() => {
    const channel = new BroadcastChannel(LIVE);
    channel.onmessage = (e) => e.data?.tokens && setLive(e.data as Live);
    channel.postMessage('hello');
    return () => channel.close();
  }, []);
  // Mode Édition : les interactions natives sont neutralisées (le clic sert à
  // sélectionner dans l'overlay du parent). Aucun élément ajouté au DOM.
  useEffect(() => {
    if (!editing) return;
    const block = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const events = ['click', 'submit', 'beforeinput', 'pointerdown'];
    events.forEach((t) => window.addEventListener(t, block, true));
    return () =>
      events.forEach((t) => window.removeEventListener(t, block, true));
  }, [editing]);
  if (!state || !saved)
    return <p role="alert">{error || docError || 'Chargement du scénario…'}</p>;
  const current = live && live.revision >= state.revision ? live : undefined;
  return (
    <Scenario
      tokens={current?.tokens ?? state.tokens}
      doc={current?.doc ?? saved}
      scenario={scenario}
      preview={editing ? current?.preview : null}
    />
  );
}
// Planche d'export Figma : chaque composant DS isolé, avec les tokens enregistrés.
export function ExportSheet() {
  const { state, error } = useDesignState();
  const { doc, error: docError } = useDocFile();
  if (!state || !doc)
    return <p role="alert">{error || docError || 'Chargement…'}</p>;
  return <ExportBoard tokens={state.tokens} doc={doc} />;
}
export default function App() {
  const { state, setState, error: stateError } = useDesignState();
  const [boot, setBoot] = useState<Bootstrap>();
  const [key, setKey] = useState<TokenKey>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem('ds-studio-token-draft-v2') || 'null',
      );
      if (tokenKeys.includes(saved?.key)) return saved.key;
    } catch {
      /* Facultatif. */
    }
    return 'color.brand';
  });
  const { draft, setDraft, recovered, discard } = useTokenDraft(
    key,
    state?.tokens[key].$value,
  );
  const [search, setSearch] = useState('');
  const [agents, setAgents] = useState<Bootstrap['agents']>([]);
  const [proposal, setProposal] = useState<Proposal>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'ds' | 'preview'>('ds');
  const [panelOpen, setPanelOpen] = useState(true);
  const version = useVersion();
  const [previewToolsOpen, setPreviewToolsOpen] = useState(true);
  const [sections, setSection] = useSections();
  // Ouverture pilotée par le clic : l'évènement « toggle » est asynchrone et
  // un rendu intercalé (rafraîchissement de l'état) pouvait la contredire.
  const toggleSection =
    (id: Parameters<typeof setSection>[0]) => (e: React.MouseEvent) => {
      e.preventDefault();
      setSection(id, !sections[id]);
    };
  // Document de nœuds (aperçu, catalogue, composants).
  const [doc, setDoc] = useState<Doc>();
  const [docError, setDocError] = useState('');
  const [device, setDevice] = useState(1);
  const [scenario, setScenario] = useState('cards');
  const [frameHeight, setFrameHeight] = useState(devices[1].height);
  const [agent, setAgent] = useState('claude');
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<
    { role: 'user' | 'assistant'; text: string }[]
  >([]);
  const [reply, setReply] = useState('');
  const [replyOpen, setReplyOpen] = useState(true);
  const [promptHeight, setPromptHeight] = useState(72);
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const stageFrame = useRef<HTMLDivElement>(null);
  const catalogueBox = useRef<HTMLDivElement>(null);
  const deviceBox = useRef<HTMLDivElement>(null);
  const frameObserver = useRef<ResizeObserver | null>(null);
  const promptBar = useRef<HTMLFormElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const tokensTitle = useRef<HTMLHeadingElement>(null);
  const catalogueFit = useFit(
    stageFrame,
    catalogueBox,
    !!state && !!doc && view === 'ds',
  );
  const previewFit = useFit(
    stageFrame,
    deviceBox,
    !!state && !!doc && view === 'preview',
  );
  // --- Mode Édition / Test, sélection, écritures directes et annulation ---
  const [mode, setMode] = useState<'edit' | 'test'>('edit');
  // Remonte le canevas au retour en Édition : écran de départ, champs vides.
  const [resetKey, setResetKey] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Multi-sélection : calques ajoutés à la sélection principale (Maj+clic,
  // rectangle). Toute nouvelle sélection principale la vide, sauf celles
  // faites par ces gestes.
  const [others, setOthers] = useState<Selection[]>([]);
  const keepOthers = useRef(false);
  useEffect(() => {
    if (keepOthers.current) keepOthers.current = false;
    else setOthers([]);
  }, [selection?.key]);
  const selectedAll = selection
    ? [selection, ...others.filter((o) => o.key !== selection.key)]
    : [];
  function selectMany(list: Selection[]) {
    const [first, ...rest] = list;
    keepOthers.current = first?.key !== selection?.key || !!rest.length;
    setOthers(rest);
    setSelection(first ?? null);
    if (first) setPanelOpen(true);
  }
  // Maj+clic : ajoute ou retire un calque (un token reste seul).
  function toggleSelect(s: Selection) {
    if (s.kind === 'token' || selection?.kind === 'token')
      return selectMany([s]);
    const has = selectedAll.some((x) => x.key === s.key);
    // Un parent et son enfant ne sont pas sélectionnés ensemble.
    const sf = surface();
    const el = sf && findByKey(sf.root, s.key);
    const nested = (x: Selection) => {
      const o = sf && findByKey(sf.root, x.key);
      return !!o && !!el && (o.contains(el) || el.contains(o));
    };
    const list = has
      ? selectedAll.filter((x) => x.key !== s.key)
      : [...selectedAll.filter((x) => !nested(x)), s];
    selectMany(list);
  }
  // État (survol…) édité dans l'inspecteur, montré sur le canevas.
  const [editState, setEditState] = useState<StateName | null>(null);
  const [scoped, setScoped] = useState(true);
  const [liveTokens, setLiveTokens] = useState<
    Partial<Record<TokenKey, TokenValue>>
  >({});
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const docRef = useRef(doc);
  docRef.current = doc;
  const tokenQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingTokens = useRef(
    new Map<
      TokenKey,
      {
        before: TokenValue;
        after: TokenValue;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  // Geste en cours sur le document : nœuds touchés (valeur avant le geste).
  const pendingDoc = useRef(
    new Map<string, { before: DocNode | null; after: DocNode | null }>(),
  );
  const docTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    request<Doc>('doc')
      .then(setDoc)
      .catch((e) =>
        setDocError(
          // Serveur lancé avant le document de nœuds : il faut le relancer.
          String(e.message).startsWith('Route inconnue')
            ? 'Le serveur DS-Studio en cours date d’avant cette mise à jour : fermez-le puis relancez-le.'
            : e.message,
        ),
      );
    request<UndoStacks>('history')
      .then((h) => undo.load(h))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setSelection(null);
  }, [view, mode, scenario]);
  useEffect(() => {
    setScoped(true);
    setEditState(null);
  }, [selection?.key]);
  function switchMode(next: 'edit' | 'test') {
    if (next === mode) return;
    if (next === 'edit') setResetKey((k) => k + 1);
    setMode(next);
  }
  // Tokens et overrides affichés : valeurs enregistrées + écritures en attente.
  const shownTokens =
    state &&
    (() => {
      const t = structuredClone(state.tokens);
      for (const [k, v] of Object.entries(liveTokens))
        (t[k as TokenKey] as { $value: TokenValue }).$value = v!;
      return t;
    })();
  const live = useRef<Live | null>(null);
  live.current =
    state && shownTokens && doc
      ? {
          revision: state.revision,
          tokens: shownTokens,
          doc,
          preview:
            selection && editState
              ? { key: selection.key, state: editState }
              : null,
        }
      : null;
  useEffect(() => {
    const channel = new BroadcastChannel(LIVE);
    channel.onmessage = (e) =>
      e.data === 'hello' && live.current && channel.postMessage(live.current);
    return () => channel.close();
  }, []);
  useEffect(() => {
    if (!live.current) return;
    const channel = new BroadcastChannel(LIVE);
    channel.postMessage(live.current);
    channel.close();
  }, [
    JSON.stringify(liveTokens),
    doc,
    state?.revision,
    selection?.key,
    editState,
  ]);

  function writeTokens(changes: { key: TokenKey; value: TokenValue }[]) {
    const run = tokenQueue.current.then(async () => {
      const current = stateRef.current!;
      const p = await request<Proposal>('proposals', {
        revision: current.revision,
        changes,
      });
      const next = await commit(p);
      stateRef.current = next;
      setState(next);
      announceChange();
    });
    tokenQueue.current = run.catch(() => {});
    return run;
  }
  async function flushToken(key: TokenKey) {
    const p = pendingTokens.current.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    pendingTokens.current.delete(key);
    const done = () =>
      setLiveTokens((t) => {
        const { [key]: _, ...rest } = t;
        return rest;
      });
    if (p.before === p.after) return done();
    try {
      await writeTokens([{ key, value: p.after }]);
      undo.push([{ type: 'token', key, before: p.before, after: p.after }]);
    } catch (e) {
      setError((e as Error).message);
    }
    done();
  }
  // Token modifié dans le panneau : affiché tout de suite, écrit après une pause.
  function liveToken(key: TokenKey, value: TokenValue) {
    setLiveTokens((t) => ({ ...t, [key]: value }));
    const p = pendingTokens.current.get(key);
    if (p) clearTimeout(p.timer);
    pendingTokens.current.set(key, {
      before: p?.before ?? stateRef.current!.tokens[key].$value,
      after: value,
      timer: setTimeout(() => void flushToken(key), 350),
    });
  }
  function localDoc(
    nodes: { id: string; after: DocNode | null }[],
    screens?: string[],
  ) {
    if (!docRef.current) return;
    const next = patchDoc(docRef.current, nodes, screens);
    docRef.current = next;
    setDoc(next);
  }
  // Écriture serveur : refusée (409) si un nœud a changé ailleurs ; on relit.
  async function saveDoc(
    ops: NodeOp[],
    screens?: { before: string[]; after: string[] },
  ) {
    try {
      await request<Doc>('doc/ops', { ops, ...(screens ? { screens } : {}) });
      announceChange();
    } catch (e) {
      const fresh = await request<Doc>('doc').catch(() => null);
      if (fresh) {
        docRef.current = fresh;
        setDoc(fresh);
      }
      throw e;
    }
  }
  async function flushDoc() {
    if (docTimer.current) clearTimeout(docTimer.current);
    docTimer.current = null;
    // Un geste qui revient à la valeur de départ n'écrit rien.
    const ops = [...pendingDoc.current]
      .map(([id, v]) => ({ id, ...v }))
      .filter((op) => JSON.stringify(op.before) !== JSON.stringify(op.after));
    pendingDoc.current.clear();
    if (!ops.length) return;
    try {
      await saveDoc(ops);
      undo.push(ops.map((op) => ({ type: 'node' as const, ...op })));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // Champ du panneau : rendu immédiat, écriture regroupée par geste (350 ms).
  function liveNodes(nodes: DocNode[]) {
    const current = docRef.current;
    if (!current || !nodes.length) return;
    for (const n of nodes) {
      const p = pendingDoc.current.get(n.id);
      pendingDoc.current.set(n.id, {
        before: p ? p.before : (current.nodes[n.id] ?? null),
        after: n,
      });
    }
    localDoc(nodes.map((n) => ({ id: n.id, after: n })));
    if (docTimer.current) clearTimeout(docTimer.current);
    docTimer.current = setTimeout(() => void flushDoc(), 350);
  }
  // Geste immédiat en plusieurs nœuds (une seule entrée d'annulation).
  async function commitNodes(nodes: DocNode[]) {
    await flushDoc();
    const current = docRef.current!;
    const ops = nodes.map((n) => ({
      id: n.id,
      before: current.nodes[n.id] ?? null,
      after: n,
    }));
    if (!ops.length) return;
    localDoc(ops);
    await saveDoc(ops);
    undo.push(ops.map((op) => ({ type: 'node' as const, ...op })));
  }
  // Geste de structure : nœuds créés, déplacés ou supprimés (et écrans).
  async function commitChanges(
    changes: { id: string; after: DocNode | null }[],
    screens?: string[],
    /** Appelé dès l'affichage local, avant l'écriture serveur. */
    onLocal?: () => void,
  ) {
    await flushDoc();
    const current = docRef.current!;
    const ops = changes.map((c) => ({
      id: c.id,
      before: current.nodes[c.id] ?? null,
      after: c.after,
    }));
    const screensOp = screens && { before: current.screens, after: screens };
    if (!ops.length && !screensOp) return;
    localDoc(ops, screens);
    onLocal?.();
    await saveDoc(ops, screensOp);
    undo.push([
      ...ops.map((op) => ({ type: 'node' as const, ...op })),
      ...(screensOp ? [{ type: 'screens' as const, ...screensOp }] : []),
    ]);
  }
  async function flushAll() {
    await Promise.all([
      ...[...pendingTokens.current.keys()].map(flushToken),
      flushDoc(),
    ]);
  }
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undo = useUndo(
    async (ops, side) => {
      const other = side === 'before' ? 'after' : 'before';
      const nodes = ops.flatMap((op) =>
        op.type === 'node'
          ? [{ id: op.id, before: op[other], after: op[side] }]
          : [],
      );
      const sc = ops.find((op) => op.type === 'screens');
      const screens =
        sc?.type === 'screens'
          ? { before: sc[other], after: sc[side] }
          : undefined;
      // Nœuds d'un même geste : une écriture, vérifiée contre l'état courant.
      if (nodes.length || screens) {
        await saveDoc(nodes, screens);
        localDoc(nodes, screens?.after);
      }
      for (const op of ops) {
        if (op.type === 'token')
          await writeTokens([{ key: op.key, value: op[side] }]).catch((e) => {
            if (!String(e.message).startsWith('Aucune modification')) throw e;
          });
      }
    },
    (stacks) => {
      if (historyTimer.current) clearTimeout(historyTimer.current);
      historyTimer.current = setTimeout(
        () =>
          void request('history', { history: stacks }).catch((e) =>
            setError(`Historique non enregistré : ${e.message}`),
          ),
        300,
      );
    },
  );
  // Appuis rapides sur Cmd+Z : traités l'un après l'autre, aucun n'est perdu.
  const historyQueue = useRef<Promise<void>>(Promise.resolve());
  function history(dir: 'undo' | 'redo') {
    historyQueue.current = historyQueue.current.then(async () => {
      try {
        await flushAll();
        const moved = await (dir === 'undo' ? undo.undo() : undo.redo());
        if (moved)
          setNotice(
            dir === 'undo' ? 'Modification annulée.' : 'Modification rétablie.',
          );
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }
  // Surface de sélection : le catalogue (même DOM) ou le document de l'iframe.
  const surface = useCallback((): Surface | null => {
    if (view === 'ds')
      return catalogueBox.current ? { root: catalogueBox.current } : null;
    const frame = frameRef.current;
    const body = frame?.contentDocument?.body;
    return frame && body ? { root: body, frame } : null;
  }, [view]);
  function select(next: Selection | null) {
    setSelection(next);
    if (!next) return;
    setPanelOpen(true);
  }
  // Nouveau composant (ou composant importé d'une image) : ajouté à la
  // section « Mes composants » du document, puis sélectionné.
  async function createComponent(c?: DSComponent) {
    const current = docRef.current;
    if (!current) return;
    const count = Object.keys(current.nodes).filter((k) =>
      /^custom\/[0-9a-f-]{36}$/.test(k),
    ).length;
    const component = c ?? newComponent(crypto.randomUUID(), count + 1);
    await commitNodes(addComponent(current, component));
    setView('ds');
    setMode('edit');
    const key = `custom/${component.id}`;
    setSelection({
      key,
      kind: 'master',
      id: key,
      name: component.name,
      text: component.label,
    });
    setPanelOpen(true);
  }
  // Sélection par clé (panneau Calques, nouvel élément) : nom provisoire tiré
  // du document, précisé par le rendu dès qu'il est à jour.
  function selectKey(key: string) {
    const d = docRef.current;
    const t = d && locate(d, key);
    const n = t && d.nodes[t.id];
    if (!d || !n) return;
    const inMaster = !!componentOf(d, n.id) && !key.includes('>');
    setSelection({
      key,
      kind:
        key.includes('>') || n.type === 'instance'
          ? 'instance'
          : inMaster
            ? 'master'
            : 'node',
      id: key,
      name: n.name,
      text: n.characters ?? null,
    });
    setPanelOpen(true);
    for (const delay of [60, 300])
      setTimeout(() => {
        const sf = surface();
        const el = sf && findByKey(sf.root, key);
        const desc = el && describe(el);
        if (desc) setSelection((x) => (x?.key === key ? desc : x));
      }, delay);
  }
  // Racine affichée : page des composants ou écran courant de l'aperçu.
  const layersRoot = doc
    ? view === 'ds'
      ? doc.components
      : screenOf(doc, scenario)
    : '';
  const clipboard = useRef<Clip | null>(null);
  // Geste de structure : une écriture, une entrée d'annulation, une sélection.
  async function structure(
    run: (d: Doc) => {
      changes: Change[];
      select?: string | null;
      screens?: string[];
      scenario?: string;
    },
  ) {
    const d = docRef.current;
    if (!d) return;
    try {
      await flushDoc();
      const r = run(docRef.current!);
      // La sélection suit tout de suite (un raccourci peut suivre aussitôt).
      await commitChanges(r.changes, r.screens, () => {
        if (r.scenario) setScenario(r.scenario);
        if (r.select === null) setSelection(null);
        else if (r.select) selectKey(r.select);
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selectedReal = (d: Doc) => {
    if (!selection || selection.kind === 'token')
      throw new Error('Sélectionnez un calque.');
    return realId(d, selection.key);
  };
  // Calques réels de la sélection (multi-sélection comprise), sans doublon.
  const selectedReals = (d: Doc) => {
    selectedReal(d);
    return [...new Set(selectedAll.map((x) => realId(d, x.key)))];
  };
  function command(
    name: Extract<LayerAction, { type: 'command' }>['name'] | 'copy' | 'paste',
  ) {
    if (name === 'copy') {
      try {
        clipboard.current = copy(
          docRef.current!,
          selectedReals(docRef.current!),
        );
        setNotice('Calque copié.');
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    void structure((d) => {
      if (name === 'paste') {
        if (!clipboard.current) throw new Error('Rien à coller.');
        const r = paste(
          d,
          clipboard.current,
          insertionPoint(d, selection?.key ?? null, layersRoot),
        );
        return { changes: r.changes, select: r.ids[0] };
      }
      if (name === 'detach') {
        const r = detach(d, selection?.key ?? '');
        return { changes: r.changes, select: r.id };
      }
      const id = selectedReal(d);
      const ids = selectedReals(d);
      if (name === 'duplicate') {
        const r = duplicate(d, ids);
        return { changes: r.changes, select: r.ids[0] };
      }
      if (name === 'delete') return { changes: remove(d, ids), select: null };
      if (name === 'group') {
        const r = group(d, ids);
        return { changes: r.changes, select: r.id };
      }
      if (name === 'auto-layout') {
        const r = autoLayout(d, ids);
        return { changes: r.changes, select: r.id };
      }
      if (name === 'variant') {
        const n = d.nodes[id];
        const r = addVariant(d, n.type === 'instance' ? n.componentId! : id);
        return { changes: r.changes, select: r.id };
      }
      const r = componentFrom(d, ids);
      setNotice(
        'Composant créé dans « Mes composants » ; la sélection en est une instance.',
      );
      return { changes: r.changes, select: r.instance };
    });
  }
  function onLayer(a: LayerAction) {
    const d = docRef.current;
    if (!d) return;
    if (a.type === 'select' && a.add) {
      const sf = surface();
      const el = sf && findByKey(sf.root, a.key);
      const s = el && describe(el);
      if (s) toggleSelect(s);
      return;
    }
    if (a.type === 'select') return selectKey(a.key);
    if (a.type === 'command') return command(a.name);
    void structure((d) => {
      if (a.type === 'insert') {
        const at = insertionPoint(d, selection?.key ?? null, layersRoot);
        const r = insert(d, at, a.kind, a.component);
        return { changes: r.changes, select: r.id };
      }
      const id = realId(d, a.key);
      if (a.type === 'rename')
        return {
          changes: [
            { id, after: { ...structuredClone(d.nodes[id]), name: a.name } },
          ],
        };
      if (a.type === 'toggle') {
        const n = structuredClone(d.nodes[id]);
        const layer = { ...n.props.layer };
        if (a.field === 'visible') layer.visible = layer.visible === false;
        else layer.locked = !layer.locked;
        n.props = { ...n.props, layer };
        return { changes: [{ id, after: n }] };
      }
      const target = realId(d, a.target);
      if (a.where === 'inside')
        return { changes: move(d, id, target), select: id };
      const parent = d.nodes[target].parent!;
      const index =
        d.nodes[parent].children.indexOf(target) +
        (a.where === 'after' ? 1 : 0);
      return { changes: move(d, id, parent, index), select: id };
    });
  }
  function onScreen(a: ScreenAction) {
    if (a.type === 'open') {
      setScenario(screenSlug(a.id));
      setView('preview');
      return;
    }
    void structure((d) => {
      if (a.type === 'rename')
        return {
          changes: [
            {
              id: a.id,
              after: { ...structuredClone(d.nodes[a.id]), name: a.name },
            },
          ],
        };
      const r =
        a.type === 'create'
          ? createScreen(d, `Écran ${d.screens.length + 1}`)
          : a.type === 'duplicate'
            ? duplicateScreen(d, a.id)
            : deleteScreen(d, a.id);
      return {
        changes: r.changes,
        screens: r.screens,
        scenario: screenSlug(r.id),
        select: null,
      };
    });
  }
  // Taille rendue de la sélection (px du document), pour « Fixe ».
  function measureSelection() {
    const sf = surface();
    const el = selection && sf && findByKey(sf.root, selection.key);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const scale = sf.frame ? 1 : catalogueFit.scale || 1;
    return { w: r.width / scale, h: r.height / scale };
  }
  function editText(s: Selection, text: string) {
    if (s.kind === 'token' || !docRef.current) return;
    const own = readOwn(docRef.current, s.key);
    void commitNodes(
      writeLegacy(docRef.current, s.key, { ...own, label: text }),
    ).catch((e) => setError(e.message));
    setSelection({ ...s, text });
  }
  // « Appliquer au composant » : tous les overrides passent sur le maître.
  function applyToMaster(s: Selection) {
    if (!docRef.current) return;
    void commitNodes(applyToComponent(docRef.current, s.key))
      .then(() =>
        setNotice(
          'Overrides appliqués au composant : toutes ses occurrences sont à jour.',
        ),
      )
      .catch((e) => setError(e.message));
  }
  // Raccourcis : E / P (mode), Échap (remonter), Cmd+Z / Cmd+Maj+Z.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const typing =
      !!t &&
      (t.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    if (typing || e.defaultPrevented || document.querySelector('dialog[open]'))
      return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      e.preventDefault();
      void history(e.shiftKey ? 'redo' : 'undo');
      return;
    }
    // Structure (mode Édition), comme dans Figma.
    if (mode === 'edit') {
      const mod = e.metaKey || e.ctrlKey;
      const has = !!selection && selection.kind !== 'token';
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (mod && e.altKey && e.code === 'KeyK' && has)
        return run(() => command('component'));
      if (mod && !e.altKey && !e.shiftKey) {
        if (k === 'd' && has) return run(() => command('duplicate'));
        if (k === 'c' && has) return run(() => command('copy'));
        if (k === 'v' && clipboard.current) return run(() => command('paste'));
        if (k === 'g' && has) return run(() => command('group'));
      }
      if (!mod && !e.altKey) {
        if (e.shiftKey && k === 'a' && has)
          return run(() => command('auto-layout'));
        if (!e.shiftKey && (k === 'f' || k === 't' || k === 'r'))
          return run(() =>
            onLayer({
              type: 'insert',
              kind: k === 'f' ? 'frame' : k === 't' ? 'text' : 'rect',
            }),
          );
        if ((k === 'delete' || k === 'backspace') && has)
          return run(() => command('delete'));
        // Flèches : déplace les calques absolus (Maj = 10 px).
        const arrow = {
          arrowleft: [-1, 0],
          arrowright: [1, 0],
          arrowup: [0, -1],
          arrowdown: [0, 1],
        }[k];
        const d = docRef.current;
        if (arrow && has && d) {
          const keys = selectedAll.map((x) => x.key);
          const absolute = keys.every((key) => {
            const s = selectAt(d, key);
            return s && groupAt(s, 'position', null)?.mode === 'absolute';
          });
          if (absolute) {
            const step = e.shiftKey ? 10 : 1;
            return run(() =>
              liveNodes(
                setPropMany(d, keys, null, 'position', null, (s: Selected) =>
                  moveAbsolute(
                    groupAt(s, 'position', null) ?? {},
                    arrow[0] * step,
                    arrow[1] * step,
                  ),
                ),
              ),
            );
          }
        }
      }
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'e') switchMode('edit');
    else if (k === 'p') switchMode('test');
    else if (k === 'escape' && mode === 'edit' && selectedAll.length > 1)
      selectMany([selection!]);
    else if (k === 'escape' && mode === 'edit' && selection) {
      const sf = surface();
      const el = sf && findByKey(sf.root, selection.key);
      const parent = el && sf ? chainOf(el, sf.root).at(-1) : undefined;
      setSelection(parent ? describe(parent) : null);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  // Contexte de l'élément pour le prompt : valeurs lues sur le rendu réel.
  function elementContext(s: Selection) {
    if (s.kind === 'token')
      return {
        kind: s.kind,
        key: s.id,
        name: s.name,
        current: { value: state!.tokens[s.id as TokenKey].$value },
      };
    const sf = surface();
    const el = sf && findByKey(sf.root, s.key);
    const cs =
      el && (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
    return {
      kind: s.kind === 'node' ? 'master' : s.kind,
      key: s.id,
      name: s.name,
      current: {
        text: s.text,
        ...(cs
          ? {
              background: cs.backgroundColor,
              color: cs.color,
              fontSize: cs.fontSize,
              borderRadius: cs.borderTopLeftRadius,
              padding: cs.padding,
            }
          : {}),
      },
    };
  }

  useEffect(() => {
    bootstrap()
      .then(setBoot)
      .catch((e) => setError(e.message));
    return () => {
      controller.current?.abort();
      frameObserver.current?.disconnect();
    };
  }, []);
  useEffect(() => {
    if (agent !== 'manual')
      request<Bootstrap['agents']>('agents')
        .then(setAgents)
        .catch((e) => setError(e.message));
  }, [agent]);
  useEffect(() => {
    setFrameHeight(devices[device].height);
  }, [device, scenario]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  // La hauteur de la barre de prompt borne la scène et le panneau.
  useLayoutEffect(() => {
    const bar = promptBar.current;
    if (!bar) return;
    const observer = new ResizeObserver(() =>
      setPromptHeight(bar.offsetHeight),
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, [!!state]);
  useLayoutEffect(() => {
    const input = promptInput.current;
    if (!input) return;
    const line = parseFloat(getComputedStyle(input).lineHeight) || 20;
    const padding =
      parseFloat(getComputedStyle(input).paddingTop) +
      parseFloat(getComputedStyle(input).paddingBottom);
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, line * PROMPT_MAX_LINES + padding)}px`;
  }, [message, !!state]);
  const current = state?.tokens[key].$value;

  useEffect(() => {
    if (historyOpen) historyDialog.current?.showModal();
    else historyDialog.current?.close();
  }, [historyOpen]);
  useEffect(() => {
    if (proposal) {
      dialog.current?.showModal();
      cancelButton.current?.focus();
    } else dialog.current?.close();
  }, [proposal]);
  const clearError = () => {
    setError('');
    setNotice('');
  };
  async function perform(action: () => Promise<void>) {
    clearError();
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function focusTokens() {
    setPanelOpen(true);
    setSection('other', true);
    requestAnimationFrame(() => tokensTitle.current?.focus());
  }
  // L'iframe prend la hauteur de son contenu : c'est la scène qui réduit, pas l'iframe qui défile.
  function watchFrame(frame: HTMLIFrameElement) {
    frameObserver.current?.disconnect();
    const win = frame.contentWindow;
    const body = frame.contentDocument?.body;
    if (!win || !body) return;
    // Raccourcis actifs aussi quand le focus est dans l'aperçu (mode Test).
    win.addEventListener('keydown', (e) => keyHandler.current(e));
    const measure = () =>
      setFrameHeight((h) => {
        const next = Math.max(devices[device].height, body.scrollHeight);
        return next === h ? h : next;
      });
    // L'observateur doit venir du document de l'iframe pour suivre ses éléments.
    const observer = new (win as unknown as typeof globalThis).ResizeObserver(
      measure,
    );
    // La racine React grandit quand le document arrive ; body, lui, garde
    // la hauteur de l'iframe.
    observer.observe(body);
    for (const child of body.children) observer.observe(child);
    frameObserver.current = observer;
    measure();
  }
  async function proposeToken() {
    if (!state) return;
    await perform(async () => {
      const token = state.tokens[key];
      const value = token.$type === 'dimension' ? Number(draft) : draft;
      setProposal(
        await request<Proposal>('proposals', {
          revision: state.revision,
          changes: [{ key, value }],
        }),
      );
    });
  }
  async function accept() {
    if (!proposal) return;
    setSaving(true);
    await perform(async () => {
      const next = await commit(proposal);
      try {
        sessionStorage.removeItem('ds-studio-token-draft-v2');
      } catch {
        /* Facultatif. */
      }
      setState(next);
      setProposal(undefined);
      announceChange();
      setNotice(`Révision ${next.revision} enregistrée.`);
    });
    setSaving(false);
  }
  async function sendMessage() {
    if (!state || !message.trim() || thinking || agent === 'manual') return;
    const text = message;
    setMessage('');
    setThinking(true);
    setReplyOpen(true);
    clearError();
    const previous = chat.slice(-10);
    setChat([...chat, { role: 'user', text }]);
    const abort = new AbortController();
    controller.current = abort;
    try {
      await flushAll();
      const target = scoped && selection ? selection : null;
      const result = await request<{
        message: string;
        applied: Applied | null;
      }>(
        'agent',
        {
          agent,
          message: text,
          revision: stateRef.current!.revision,
          history: previous,
          ...(target ? { element: elementContext(target) } : {}),
        },
        abort.signal,
      );
      setChat((c) => [...c, { role: 'assistant', text: result.message }]);
      setReply(result.message);
      // Écriture directe par le serveur : on affiche et on rend annulable.
      const a = result.applied;
      if (a?.type === 'token') {
        stateRef.current = a.state;
        setState(a.state);
        announceChange();
        undo.push(
          a.patches.map((p) => ({
            type: 'token',
            key: p.key,
            before: p.before,
            after: p.after,
          })),
        );
      } else if (a?.type === 'doc') {
        localDoc(a.ops);
        announceChange();
        undo.push(a.ops.map((op) => ({ type: 'node' as const, ...op })));
      }
      if (a) setNotice('Modification appliquée. Cmd+Z pour annuler.');
    } catch (e) {
      setError(
        abort.signal.aborted
          ? 'Demande interrompue. Aucun changement accepté.'
          : (e as Error).message,
      );
    } finally {
      setThinking(false);
      controller.current = null;
    }
  }
  // Onglet ou serveur d'une version antérieure : dit, avec quoi faire.
  const versionBanner = (version.reload || version.serverStale) && (
    <div className="version-banner" role="alert">
      {version.serverStale ? (
        <span>
          Le serveur DS-Studio tourne sur une version antérieure du code.
          Relancez-le (lanceur : « Démarrer DS-Studio », ou Ctrl+C puis{' '}
          <code>npm start</code>), puis rechargez la page.
        </span>
      ) : (
        <>
          <span>
            DS-Studio a été mis à jour : rechargez la page pour utiliser la
            nouvelle version.
          </span>
          <button
            type="button"
            onClick={() =>
              void flushAll()
                .catch(() => {})
                .finally(() => location.reload())
            }
          >
            Recharger
          </button>
        </>
      )}
    </div>
  );
  if (!state || !doc)
    return (
      <main className="loading">
        {versionBanner}
        <span className="brand-symbol">ds.</span>
        <p role="alert">
          {stateError || docError || 'Ouverture du Design System…'}
        </p>
      </main>
    );
  const selectedAgent = agents.find((a) => a.id === agent);
  const agentName = 'Claude';
  const manual = agent === 'manual';
  const staleProposal = !!proposal && proposal.revision !== state.revision;
  const draftContrast =
    /^#[0-9a-fA-F]{6}$/.test(draft) &&
    (key === 'color.brand' || key === 'color.onBrand')
      ? contrast(
          key === 'color.brand' ? draft : state.tokens['color.brand'].$value,
          key === 'color.onBrand'
            ? draft
            : state.tokens['color.onBrand'].$value,
        )
      : undefined;
  const savedContrast = contrast(
    state.tokens['color.brand'].$value,
    state.tokens['color.onBrand'].$value,
  );
  const matchingKeys = tokenKeys.filter((k) =>
    k.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const fit = view === 'ds' ? catalogueFit : previewFit;
  return (
    <div
      className="studio"
      data-panel={panelOpen ? 'open' : 'closed'}
      style={{ '--prompt-h': `${promptHeight}px` } as React.CSSProperties}
    >
      {versionBanner}
      <a
        className="skip-link"
        href="#tokens-title"
        onClick={(e) => {
          e.preventDefault();
          focusTokens();
        }}
      >
        Aller aux tokens
      </a>
      <header className="studio-header">
        <span className="brand-symbol" aria-hidden="true">
          ds.
        </span>
        <h1 className="sr-only">DS-Studio</h1>
        <div className="header-status">
          <span className="badge">Local</span>
          <FigmaBridgePanel />
          <FigmaExportButton
            tokens={state.tokens}
            scenario={{
              id: scenario,
              label: scenario === 'form' ? 'Inscription' : 'Découvrir',
              width: devices[device].width,
            }}
            initialKind="design_system"
            onDone={(text) => {
              setError('');
              setNotice(text);
            }}
            onError={setError}
          />
          <button
            className="ghost"
            onClick={() => setHistoryOpen(true)}
            aria-haspopup="dialog"
            aria-label="Historique"
          >
            <ClockCounterClockwise />
            Historique
            <span className="badge" aria-hidden="true">
              r{state.revision}
            </span>
          </button>
        </div>
      </header>

      <main className="stage" aria-label="Scène">
        <div className="stage-bar">
          <div className="segmented" role="group" aria-label="Vue de la scène">
            <button aria-pressed={view === 'ds'} onClick={() => setView('ds')}>
              Design System
            </button>
            <button
              aria-pressed={view === 'preview'}
              onClick={() => setView('preview')}
            >
              Aperçu
            </button>
          </div>
          <div
            className="segmented mode-toggle"
            role="group"
            aria-label="Mode du canevas"
          >
            <button
              aria-pressed={mode === 'edit'}
              aria-keyshortcuts="E"
              title="Édition (E) : le clic sélectionne"
              onClick={() => switchMode('edit')}
            >
              Édition <kbd>E</kbd>
            </button>
            <button
              aria-pressed={mode === 'test'}
              aria-keyshortcuts="P"
              title="Test (P) : prototype interactif"
              onClick={() => switchMode('test')}
            >
              Test <kbd>P</kbd>
            </button>
          </div>
          <span className="stage-meta" aria-live="polite">
            {view === 'preview' && `${devices[device].width} px · `}
            {Math.round(fit.scale * 100)} %
          </span>
          {view === 'preview' && (
            <button
              className="preview-tools-toggle"
              aria-expanded={previewToolsOpen}
              aria-controls="preview-tools"
              onClick={() => setPreviewToolsOpen(!previewToolsOpen)}
            >
              <SlidersHorizontal />
              Réglages d’aperçu
            </button>
          )}
          {view === 'preview' && (
            <FigmaExportButton
              tokens={state.tokens}
              scenario={{
                id: scenario,
                label: scenario === 'form' ? 'Inscription' : 'Découvrir',
                width: devices[device].width,
              }}
              initialKind="preview"
              onDone={(text) => {
                setError('');
                setNotice(text);
              }}
              onError={setError}
            />
          )}
        </div>
        <div className="stage-body">
          {mode === 'edit' && doc && layersRoot && (
            <LayersPanel
              doc={doc}
              root={layersRoot}
              selected={
                selection?.kind === 'token' ? null : (selection?.key ?? null)
              }
              extra={selectedAll.slice(1).map((x) => x.key)}
              onLayer={onLayer}
              screens={view === 'preview' ? { current: scenario } : undefined}
              onScreen={onScreen}
            />
          )}
          {view === 'preview' && (
            // Panneau latéral glissant : replié, il libère la place et sort du parcours clavier.
            <div
              className="preview-tools"
              id="preview-tools"
              role="group"
              aria-label="Réglages d’aperçu"
              data-open={previewToolsOpen}
              inert={!previewToolsOpen}
            >
              <label className="field">
                Largeur d’écran
                <select
                  value={device}
                  onChange={(e) => setDevice(Number(e.target.value))}
                >
                  {devices.map((d, i) => (
                    <option key={d.width} value={i}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Scénario
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                >
                  {doc?.screens.map((id) => (
                    <option key={id} value={screenSlug(id)}>
                      {doc.nodes[id]?.name ?? id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="stage-frame" ref={stageFrame} data-mode={mode}>
            {view === 'ds' ? (
              <div
                className="stage-content stage-catalogue"
                key={resetKey}
                ref={catalogueBox}
                inert={mode === 'edit'}
                style={{
                  width: CATALOGUE_WIDTH,
                  transform: `translate(${catalogueFit.x}px, ${catalogueFit.y}px) scale(${catalogueFit.scale})`,
                }}
              >
                <Catalogue
                  tokens={shownTokens!}
                  doc={doc}
                  preview={
                    selection && editState
                      ? { key: selection.key, state: editState }
                      : null
                  }
                />
              </div>
            ) : (
              <div
                className="stage-content stage-device"
                ref={deviceBox}
                inert={mode === 'edit'}
                style={{
                  transform: `translate(${previewFit.x}px, ${previewFit.y}px) scale(${previewFit.scale})`,
                }}
              >
                <iframe
                  title="Aperçu responsive"
                  ref={frameRef}
                  key={`${resetKey}-${mode}`}
                  src={`/?preview=1&scenario=${scenario}&mode=${mode}`}
                  width={devices[device].width}
                  height={frameHeight}
                  onLoad={(e) => watchFrame(e.currentTarget)}
                />
              </div>
            )}
            {mode === 'edit' && (
              <EditOverlay
                surface={surface}
                doc={doc}
                selected={selection}
                others={selectedAll.slice(1)}
                onSelect={select}
                onToggle={toggleSelect}
                onMarquee={(list, add) =>
                  selectMany(
                    add
                      ? [
                          ...selectedAll,
                          ...list.filter(
                            (s) => !selectedAll.some((x) => x.key === s.key),
                          ),
                        ]
                      : list,
                  )
                }
                onText={editText}
                canEditText={(s) => canEditText(doc, s)}
                onNodes={liveNodes}
                onGestureEnd={() => void flushDoc()}
                onReorder={(key, parent, index) =>
                  void structure((d) => ({
                    changes: move(d, key, parent, index),
                    select: key,
                  }))
                }
              />
            )}
          </div>
        </div>
      </main>

      <aside
        className="settings"
        id="settings-panel"
        aria-label="Paramètres"
        data-open={panelOpen}
      >
        <button
          className="settings-toggle"
          aria-expanded={panelOpen}
          aria-controls="settings-body"
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {panelOpen ? <CaretRight /> : <CaretLeft />}
          <span className={panelOpen ? '' : 'sr-only'}>
            {panelOpen ? 'Replier les paramètres' : 'Paramètres'}
          </span>
        </button>
        <div className="settings-body" id="settings-body" hidden={!panelOpen}>
          {selection && selectedAll.length > 1 ? (
            <SelectionPanel
              selection={{
                ...selection,
                kind: 'node',
                name: `${selectedAll.length} calques`,
              }}
              tokens={shownTokens!}
              onToken={liveToken}
              onClose={() => setSelection(null)}
            >
              <MultiInspector
                doc={doc}
                keys={selectedAll.map((x) => x.key)}
                tokens={shownTokens!}
                state={editState}
                onNodes={liveNodes}
              />
            </SelectionPanel>
          ) : selection ? (
            <SelectionPanel
              selection={selection}
              tokens={shownTokens!}
              onToken={liveToken}
              onClose={() => setSelection(null)}
            >
              <Inspector
                key={selection.key}
                doc={doc}
                selKey={selection.key}
                tokens={shownTokens!}
                state={editState}
                onState={setEditState}
                onNodes={liveNodes}
                onApply={() => applyToMaster(selection)}
                onCommand={command}
                onRename={(name) => setSelection((x) => x && { ...x, name })}
                measure={measureSelection}
              />
            </SelectionPanel>
          ) : (
            <>
              <details className="settings-group" open={sections.create}>
                <summary onClick={toggleSection('create')}>
                  <CaretRight className="chevron" />
                  <h2>Créer</h2>
                </summary>
                <section className="settings-section">
                  <button
                    type="button"
                    className="list-item"
                    onClick={() =>
                      void createComponent().catch((e) => setError(e.message))
                    }
                  >
                    <span className="icon-box" aria-hidden="true">
                      <Cube />
                    </span>
                    <span className="list-item-text">
                      <span className="list-item-title">Nouveau composant</span>
                      <span className="list-item-desc">
                        Ajouté à « Mes composants »
                      </span>
                    </span>
                  </button>
                </section>
              </details>
              <details className="settings-group" open={sections.image}>
                <summary onClick={toggleSection('image')}>
                  <CaretRight className="chevron" />
                  <h2>Importer une image</h2>
                </summary>
                <section className="settings-section" id="image-import">
                  <ImageImport
                    tokens={state.tokens}
                    onCreate={async (component) => {
                      await createComponent(component);
                      setNotice(`Composant « ${component.name} » créé.`);
                    }}
                  />
                </section>
              </details>
              <details
                className="settings-group"
                open={sections.other}
                aria-labelledby="tokens-title"
              >
                <summary onClick={toggleSection('other')}>
                  <CaretRight className="chevron" />
                  <h2 id="tokens-title" ref={tokensTitle} tabIndex={-1}>
                    Tokens
                  </h2>
                  <span className="badge">r{state.revision}</span>
                </summary>
                <section className="settings-section">
                  <label className="field">
                    <span className="sr-only">Rechercher un token</span>
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher"
                    />
                  </label>
                  <p className="token-hint" role="status">
                    {matchingKeys.length} résultat(s).
                  </p>
                  <div className="swatches">
                    {matchingKeys
                      .filter((k) => k.startsWith('color.'))
                      .map((k) => (
                        <button
                          title={k}
                          aria-label={`Sélectionner ${k}`}
                          aria-pressed={key === k}
                          key={k}
                          style={{ background: String(state.tokens[k].$value) }}
                          onClick={() => setKey(k)}
                        >
                          <span className="sr-only">{k}</span>
                        </button>
                      ))}
                  </div>
                  <form
                    className="token-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void proposeToken();
                    }}
                  >
                    <label className="field">
                      Token
                      <select
                        value={key}
                        onChange={(e) => setKey(e.target.value as TokenKey)}
                      >
                        {[...new Set([key, ...matchingKeys])].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </label>
                    <div className="token-value">
                      <label className="field">
                        Valeur
                        {state.tokens[key].$type === 'fontFamily' ? (
                          <select
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                          >
                            {['system-ui', 'Arial', 'Georgia', 'Verdana'].map(
                              (f) => (
                                <option key={f}>{f}</option>
                              ),
                            )}
                          </select>
                        ) : (
                          <input
                            aria-label="Valeur du token"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            required
                            type={
                              state.tokens[key].$type === 'dimension'
                                ? 'number'
                                : 'text'
                            }
                            min={
                              state.tokens[key].$type === 'dimension'
                                ? 0
                                : undefined
                            }
                            max={
                              state.tokens[key].$type === 'dimension'
                                ? 128
                                : undefined
                            }
                            step={
                              state.tokens[key].$type === 'dimension'
                                ? 'any'
                                : undefined
                            }
                            maxLength={20}
                          />
                        )}
                      </label>
                      {state.tokens[key].$type === 'color' && (
                        <input
                          className="color-picker"
                          aria-label="Sélecteur de couleur"
                          type="color"
                          value={
                            /^#[0-9a-fA-F]{6}$/.test(draft)
                              ? draft
                              : String(current)
                          }
                          onChange={(e) => setDraft(e.target.value)}
                        />
                      )}
                      <button
                        className="studio-primary"
                        disabled={!boot || draft === String(current)}
                      >
                        Proposer
                      </button>
                    </div>
                  </form>
                  {state.tokens[key].$type !== 'fontFamily' && (
                    <p className="token-hint">
                      {state.tokens[key].$type === 'color'
                        ? '#RRGGBB'
                        : '0–128 px'}
                    </p>
                  )}
                  {draft !== String(current) && (
                    <p className="draft-status" role="status">
                      <span className="badge">
                        {recovered ? 'Brouillon récupéré' : 'Brouillon'}
                      </span>
                      <button
                        type="button"
                        className="ghost"
                        aria-label="Abandonner le brouillon"
                        onClick={discard}
                      >
                        Abandonner
                      </button>
                    </p>
                  )}
                  <p className="contrast" aria-live="polite">
                    Contraste <strong>{savedContrast.toFixed(2)}:1</strong>
                    <span
                      className={
                        savedContrast >= 4.5 ? 'badge' : 'badge badge-strong'
                      }
                    >
                      {savedContrast >= 4.5 ? 'AA' : 'Contraste à améliorer'}
                    </span>
                  </p>
                  {draftContrast !== undefined && draft !== String(current) && (
                    <p className="contrast" role="status">
                      Contraste proposé :{' '}
                      <strong>{draftContrast.toFixed(2)}:1</strong>
                      <span
                        className={
                          draftContrast >= 4.5 ? 'badge' : 'badge badge-strong'
                        }
                      >
                        {draftContrast >= 4.5 ? 'AA' : 'Contraste à améliorer'}
                      </span>
                    </p>
                  )}
                </section>
              </details>
              <section className="settings-section settings-sub">
                <ProjectBrief />
              </section>
            </>
          )}
        </div>
      </aside>

      <div className="dock">
        <div className="dock-messages">
          {(error || stateError) && (
            <p className="error" role="alert">
              {error || stateError}
              {error && (
                <button
                  className="dismiss"
                  aria-label="Fermer le message"
                  onClick={() => setError('')}
                >
                  <X />
                </button>
              )}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {(thinking || reply) && (
            <section className="reply" aria-label={`Réponse de ${agentName}`}>
              <button
                className="reply-toggle"
                aria-expanded={replyOpen}
                aria-controls="reply-body"
                onClick={() => setReplyOpen(!replyOpen)}
              >
                {replyOpen ? <CaretDown /> : <CaretRight />}
                {agentName}
                {thinking ? ' · réflexion…' : ''}
              </button>
              <p id="reply-body" hidden={!replyOpen} aria-live="polite">
                {thinking ? '…' : reply}
              </p>
            </section>
          )}
        </div>
        <form
          className="prompt-bar"
          ref={promptBar}
          onSubmit={(e) => {
            e.preventDefault();
            if (thinking) controller.current?.abort();
            else if (manual) focusTokens();
            else void sendMessage();
          }}
        >
          <label className="mode-select">
            <span className="sr-only">Mode de travail</span>
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="claude">Claude</option>
              <option value="manual">Manuel</option>
            </select>
          </label>
          {selection && scoped && !manual && (
            <span className="prompt-chip" data-testid="prompt-chip">
              {selection.name}
              <button
                type="button"
                aria-label="Retirer l’élément du prompt"
                onClick={() => setScoped(false)}
              >
                <X />
              </button>
            </span>
          )}
          <label className="prompt-field">
            <span className="sr-only">Votre demande</span>
            <textarea
              ref={promptInput}
              rows={1}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={8000}
              disabled={manual || thinking}
              placeholder={
                manual
                  ? 'Mode manuel'
                  : selectedAgent && !selectedAgent.available
                    ? selectedAgent.detail
                    : selection && scoped
                      ? `Modifier « ${selection.name} »…`
                      : 'Décrire un changement…'
              }
            />
          </label>
          <button
            className={thinking ? 'stop' : 'studio-primary'}
            disabled={
              !thinking &&
              !manual &&
              (!message.trim() || !selectedAgent?.available)
            }
          >
            {thinking ? 'Arrêter' : manual ? 'Ouvrir les tokens' : 'Envoyer'}
          </button>
        </form>
      </div>

      <dialog
        ref={historyDialog}
        className="history"
        onCancel={() => setHistoryOpen(false)}
        aria-labelledby="history-title"
      >
        <div className="dialog-head">
          <h2 id="history-title">Historique</h2>
          <button
            className="icon-btn"
            aria-label="Fermer"
            onClick={() => setHistoryOpen(false)}
          >
            <X />
          </button>
        </div>
        {!state.history.length && <p>Aucun changement enregistré.</p>}
        <ol>
          {[...state.history].reverse().map((event) => (
            <li key={event.id}>
              <div>
                <strong>r{event.revision}</strong> · {event.source} ·{' '}
                <time>{new Date(event.date).toLocaleString('fr-FR')}</time>
                <p>{event.patches.map((p) => p.key).join(', ')}</p>
              </div>
              <button
                aria-label={`Annuler la révision ${event.revision}`}
                onClick={() =>
                  void perform(async () => {
                    const undo = await request<Proposal>('undo', {
                      revision: state.revision,
                      id: event.id,
                    });
                    setHistoryOpen(false);
                    setProposal(undo);
                  })
                }
              >
                Annuler
              </button>
            </li>
          ))}
        </ol>
      </dialog>

      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (saving) e.preventDefault();
          else setProposal(undefined);
        }}
        aria-labelledby="diff-title"
      >
        <h2 id="diff-title">Valider le changement</h2>
        <p className="token-hint">
          {proposal?.source} · r{proposal?.revision}
        </p>
        {staleProposal && (
          <p role="alert" className="error">
            Une autre validation a modifié le DS. Refaire la proposition.
          </p>
        )}
        <div className="diff-scroll">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Avant</th>
                <th>Après</th>
              </tr>
            </thead>
            <tbody>
              {proposal?.patches.map((p) => (
                <tr key={p.key}>
                  <th>{p.key}</th>
                  <td>
                    <del>{p.before}</del>
                  </td>
                  <td>
                    <ins>{p.after}</ins>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            ref={cancelButton}
            onClick={() => setProposal(undefined)}
            disabled={saving}
          >
            Rejeter
          </button>
          <button
            className="studio-primary"
            onClick={() => void accept()}
            disabled={saving || staleProposal}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
