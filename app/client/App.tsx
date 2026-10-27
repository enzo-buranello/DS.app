import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BookingCard,
  Button,
  Catalogue,
  ComponentView,
  DSProvider,
  ExampleForm,
  Navigation,
  Scenario,
} from './DesignSystem.js';
import type { DSComponent } from '../shared/component.js';
import { ComponentEditor, useComponents } from './ComponentEditor.js';
import ProjectBrief from './ProjectBrief.js';
import FigmaExportButton from './FigmaExportButton.js';
import ImageImport from './ImageImport.js';
import { useTokenDraft } from './useTokenDraft.js';
import { bootstrap, commit, getState, request, type Bootstrap } from './api.js';
import {
  contrast,
  tokenKeys,
  type Proposal,
  type State,
  type TokenKey,
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
export function Preview() {
  const { state, error } = useDesignState();
  const scenario =
    new URLSearchParams(location.search).get('scenario') ?? 'cards';
  return state ? (
    <Scenario tokens={state.tokens} scenario={scenario} />
  ) : (
    <p role="alert">{error || 'Chargement du scénario…'}</p>
  );
}
// Planche d'export Figma : composants isolés, rendus avec les tokens enregistrés.
export function ExportSheet() {
  const { state, error } = useDesignState();
  const [components, setComponents] = useState<DSComponent[]>();
  useEffect(() => {
    request<{ components: DSComponent[] }>('components')
      .then((r) => setComponents(r.components))
      .catch(() => setComponents([]));
  }, []);
  if (!state || !components)
    return <p role="alert">{error || 'Chargement…'}</p>;
  const items = [
    <Button key="p">Action principale</Button>,
    <Button key="s" variant="secondary">
      Secondaire
    </Button>,
    <Button key="d" variant="danger">
      Supprimer
    </Button>,
    <Button key="x" disabled>
      Indisponible
    </Button>,
    <BookingCard key="card" />,
    <ExampleForm key="form" />,
    <Navigation key="nav" />,
    ...components.map((c) => <ComponentView key={c.id} component={c} />),
  ];
  return (
    <DSProvider tokens={state.tokens}>
      <div className="export-sheet">
        {items.map((item, i) => (
          <div className="export-item" key={i}>
            {item}
          </div>
        ))}
      </div>
    </DSProvider>
  );
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
  const [noticeLink, setNoticeLink] = useState<string | null>(null);
  const [view, setView] = useState<'ds' | 'preview'>('ds');
  const [panelOpen, setPanelOpen] = useState(true);
  const [previewToolsOpen, setPreviewToolsOpen] = useState(true);
  const [sections, setSection] = useSections();
  const custom = useComponents(setError);
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
    !!state && view === 'ds',
  );
  const previewFit = useFit(
    stageFrame,
    deviceBox,
    !!state && view === 'preview',
  );
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
    const timer = setTimeout(
      () => {
        setNotice('');
        setNoticeLink(null);
      },
      noticeLink ? 15000 : 4000,
    );
    return () => clearTimeout(timer);
  }, [notice, noticeLink]);
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
    const measure = () =>
      setFrameHeight((h) => {
        const next = Math.max(devices[device].height, body.scrollHeight);
        return next === h ? h : next;
      });
    // L'observateur doit venir du document de l'iframe pour suivre ses éléments.
    const observer = new (win as unknown as typeof globalThis).ResizeObserver(
      measure,
    );
    observer.observe(body);
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
      const result = await request<{
        message: string;
        proposal: Proposal | null;
      }>(
        'agent',
        { agent, message: text, revision: state.revision, history: previous },
        abort.signal,
      );
      setChat((c) => [...c, { role: 'assistant', text: result.message }]);
      setReply(result.message);
      if (result.proposal) setProposal(result.proposal);
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
  if (!state)
    return (
      <main className="loading">
        <span className="brand-symbol">ds.</span>
        <p role="alert">{stateError || 'Ouverture du Design System…'}</p>
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
          <span className="local-badge">● Local</span>
          <FigmaExportButton
            tokens={state.tokens}
            scenario={scenario}
            scenarioLabel={scenario === 'form' ? 'Inscription' : 'Découvrir'}
            width={devices[device].width}
            onDone={(text, link) => {
              setError('');
              setNotice(text);
              setNoticeLink(link);
            }}
            onError={setError}
          />
          <button onClick={() => setHistoryOpen(true)} aria-haspopup="dialog">
            Historique · r{state.revision}
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
              Réglages d’aperçu
              <span aria-hidden="true">{previewToolsOpen ? ' ‹' : ' ›'}</span>
            </button>
          )}
          {view === 'preview' && (
            <FigmaExportButton
              tokens={state.tokens}
              scenario={scenario}
              scenarioLabel={scenario === 'form' ? 'Inscription' : 'Découvrir'}
              width={devices[device].width}
              onDone={(text, link) => {
                setError('');
                setNotice(text);
                setNoticeLink(link);
              }}
              onError={setError}
            />
          )}
        </div>
        <div className="stage-body">
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
                  <option value="cards">Découvrir</option>
                  <option value="form">Inscription</option>
                </select>
              </label>
            </div>
          )}
          <div className="stage-frame" ref={stageFrame}>
            {view === 'ds' ? (
              <div
                className="stage-content stage-catalogue"
                ref={catalogueBox}
                style={{
                  width: CATALOGUE_WIDTH,
                  transform: `translate(${catalogueFit.x}px, ${catalogueFit.y}px) scale(${catalogueFit.scale})`,
                }}
              >
                <Catalogue
                  tokens={state.tokens}
                  extra={
                    custom.components.length > 0 && (
                      <div className="custom-grid">
                        {custom.components.map((c) => (
                          <button
                            type="button"
                            key={c.id}
                            className={`custom-slot${c.layout.sizingX === 'fill' ? ' fill-x' : ''}`}
                            aria-pressed={c.id === custom.selected?.id}
                            aria-label={`Sélectionner ${c.name || 'Sans nom'}`}
                            onClick={() => {
                              custom.select(c.id);
                              setPanelOpen(true);
                              setSection('create', true);
                            }}
                          >
                            <ComponentView component={c} />
                          </button>
                        ))}
                      </div>
                    )
                  }
                />
              </div>
            ) : (
              <div
                className="stage-content stage-device"
                ref={deviceBox}
                style={{
                  transform: `translate(${previewFit.x}px, ${previewFit.y}px) scale(${previewFit.scale})`,
                }}
              >
                <iframe
                  title="Aperçu responsive"
                  src={`/?preview=1&scenario=${scenario}`}
                  width={devices[device].width}
                  height={frameHeight}
                  onLoad={(e) => watchFrame(e.currentTarget)}
                />
              </div>
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
          <span aria-hidden="true">{panelOpen ? '›' : '‹'}</span>
          <span className={panelOpen ? '' : 'sr-only'}>
            {panelOpen ? 'Replier les paramètres' : 'Paramètres'}
          </span>
        </button>
        <div className="settings-body" id="settings-body" hidden={!panelOpen}>
          <details
            className="settings-group"
            open={sections.create}
            onToggle={(e) => setSection('create', e.currentTarget.open)}
          >
            <summary>
              <h2>Créer un composant</h2>
            </summary>
            <section className="settings-section">
              <ComponentEditor
                tokens={state.tokens}
                components={custom.components}
                selected={custom.selected}
                onSelect={custom.select}
                onChange={custom.update}
                onCreate={() => {
                  custom.create();
                  setView('ds');
                }}
                onDelete={custom.remove}
              />
            </section>
          </details>
          <details
            className="settings-group"
            open={sections.image}
            onToggle={(e) => setSection('image', e.currentTarget.open)}
          >
            <summary>
              <h2>Importer une image</h2>
            </summary>
            <section className="settings-section" id="image-import">
              <ImageImport
                tokens={state.tokens}
                onCreate={async (component) => {
                  await custom.add(component);
                  setView('ds');
                  setNotice(`Composant « ${component.name} » créé.`);
                }}
              />
            </section>
          </details>
          <details
            className="settings-group"
            open={sections.other}
            onToggle={(e) => setSection('other', e.currentTarget.open)}
          >
            <summary>
              <h2>Autres réglages</h2>
            </summary>
            <section
              aria-labelledby="tokens-title"
              className="settings-section"
            >
              <div className="section-head">
                <h3 id="tokens-title" ref={tokensTitle} tabIndex={-1}>
                  Tokens
                </h3>
                <span className="muted">r{state.revision}</span>
              </div>
              <label className="field">
                Rechercher un token
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="color, space, font…"
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
                    ? 'Format #RRGGBB'
                    : 'Pixels, de 0 à 128'}
                </p>
              )}
              {draft !== String(current) && (
                <p className="draft-status" role="status">
                  {recovered
                    ? 'Brouillon récupéré.'
                    : 'Brouillon non enregistré.'}
                  <button type="button" onClick={discard}>
                    Abandonner le brouillon
                  </button>
                </p>
              )}
              <p className="contrast" aria-live="polite">
                Contraste marque / texte :{' '}
                <strong>{savedContrast.toFixed(2)}:1</strong> ·{' '}
                {savedContrast >= 4.5
                  ? 'AA texte courant'
                  : 'Contraste à améliorer'}
              </p>
              {draftContrast !== undefined && draft !== String(current) && (
                <p className="contrast" role="status">
                  Contraste proposé :{' '}
                  <strong>{draftContrast.toFixed(2)}:1</strong> ·{' '}
                  {draftContrast >= 4.5
                    ? 'AA texte courant'
                    : 'Contraste à améliorer'}
                </p>
              )}
            </section>

            <section className="settings-section">
              <ProjectBrief />
            </section>
            <section className="settings-section">
              <button
                className="wide"
                onClick={() => setHistoryOpen(true)}
                aria-haspopup="dialog"
              >
                Voir l’historique ({state.history.length})
              </button>
            </section>
          </details>
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
                  ×
                </button>
              )}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              <span>
                {notice}
                {noticeLink && (
                  <>
                    {' '}
                    <a href={noticeLink} target="_blank" rel="noreferrer">
                      Ouvrir la page dans Figma
                    </a>
                  </>
                )}
              </span>
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
                {agentName}
                {thinking ? ' · réflexion…' : ''}
                <span aria-hidden="true">{replyOpen ? ' ▾' : ' ▸'}</span>
              </button>
              <p id="reply-body" hidden={!replyOpen} aria-live="polite">
                {thinking ? 'Réflexion en cours…' : reply}
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
                  ? 'Mode manuel : modifiez les tokens dans le panneau.'
                  : selectedAgent && !selectedAgent.available
                    ? selectedAgent.detail
                    : 'Propose une couleur de marque plus chaleureuse.'
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
          <button onClick={() => setHistoryOpen(false)}>Fermer</button>
        </div>
        {!state.history.length && <p>Aucun changement enregistré.</p>}
        <ol>
          {[...state.history].reverse().map((event) => (
            <li key={event.id}>
              <div>
                <strong>Révision {event.revision}</strong> · {event.source} ·{' '}
                <time>{new Date(event.date).toLocaleString('fr-FR')}</time>
                <p>{event.patches.map((p) => p.key).join(', ')}</p>
              </div>
              <button
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
                Annuler la révision {event.revision}
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
        <p>
          Proposition {proposal?.source} · révision {proposal?.revision}
        </p>
        {staleProposal && (
          <p role="alert" className="error">
            Une autre validation a modifié le DS. Fermez ce diff et refaites
            votre proposition ; aucun écrasement n’est permis.
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
            Ne pas appliquer
          </button>
          <button
            className="studio-primary"
            onClick={() => void accept()}
            disabled={saving || staleProposal}
          >
            {saving ? 'Enregistrement…' : 'Valider et enregistrer'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
