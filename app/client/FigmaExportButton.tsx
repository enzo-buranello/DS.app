import { useEffect, useId, useRef, useState } from 'react';
import type { Tokens } from '../shared/model.js';
import { request } from './api.js';
import { captureDesignSystem, captureScreen } from './figmaExport.js';

interface Live {
  connected: boolean;
  unpaired: boolean;
  file: { name: string; key: string | null } | null;
  pages: { id: string; name: string }[];
  selection: { fileUrl: string; pageId: string };
}
interface Summary {
  pageName: string;
  created: number;
  updated: number;
  components: number;
  sets: number;
  screens: number;
  mismatched: string[];
  link: string | null;
}

// Export natif vers la page Figma choisie, via le plugin ouvert (lien direct).
export default function FigmaExportButton({
  tokens,
  scenario,
  scenarioLabel,
  width,
  onDone,
  onError,
}: {
  tokens: Tokens;
  scenario: string;
  scenarioLabel: string;
  width: number;
  onDone: (text: string, link: string | null) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<Live>();
  const [pageId, setPageId] = useState('');
  const [busy, setBusy] = useState(false);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const poll = () =>
      request<Live>('figma/live')
        .then((next) => {
          if (!alive) return;
          setLive(next);
          setPageId((current) =>
            next.pages.some((p) => p.id === current)
              ? current
              : next.pages.some((p) => p.id === next.selection.pageId)
                ? next.selection.pageId
                : '',
          );
        })
        .catch((e) => alive && onError((e as Error).message));
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    const outside = (e: PointerEvent) => {
      if (
        !menu.current?.contains(e.target as Node) &&
        !button.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    // Premier contrôle utilisable, sinon le menu lui-même (choix désactivés).
    requestAnimationFrame(() =>
      (
        menu.current?.querySelector<HTMLElement>(
          'select:not(:disabled), button:not(:disabled)',
        ) ?? menu.current
      )?.focus(),
    );
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function run(kind: 'ds' | 'preview') {
    setBusy(true);
    try {
      const body =
        kind === 'ds'
          ? {
              pageId,
              kind,
              definitions: await captureDesignSystem(tokens),
              screens: [],
            }
          : await (async () => {
              const screen = await captureScreen(
                scenario,
                scenarioLabel,
                width,
                tokens,
              );
              return {
                pageId,
                kind,
                definitions: [],
                screens: [
                  {
                    key: `${scenario}:${width}`,
                    name: screen.name,
                    root: screen.root,
                  },
                ],
              };
            })();
      const r = await request<Summary>('figma/export', body);
      const what =
        kind === 'ds'
          ? `${r.components} composant(s), ${r.sets} set(s)`
          : `${r.screens} écran(s), ${r.components} composant(s) utilisé(s)`;
      onDone(
        `Export Figma vers « ${r.pageName} » : ${what} · ${r.created} créé(s), ${r.updated} mis à jour.` +
          (r.mismatched.length
            ? ` Variables à vérifier : ${r.mismatched.join(', ')}.`
            : ''),
        r.link,
      );
      setOpen(false);
      button.current?.focus();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const problem = !live
    ? 'Recherche du plugin Figma…'
    : live.unpaired
      ? 'Plugin lancé mais non connecté : collez le code d’appairage dans le plugin.'
      : !live.connected
        ? 'Plugin Figma non lancé : ouvrez-le dans Figma Desktop.'
        : !pageId
          ? 'Choisissez la page Figma cible.'
          : '';
  return (
    <div className="export-anchor">
      <button
        ref={button}
        className="export-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">↗</span> Exporter
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="export-menu"
          role="dialog"
          aria-label="Exporter vers Figma"
          tabIndex={-1}
        >
          {live?.connected && (
            <label className="field">
              Page Figma · {live.file?.name}
              <select
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
              >
                <option value="" disabled>
                  Choisir une page
                </option>
                {live.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {problem && (
            <p className="export-problem" role="status">
              {problem}
            </p>
          )}
          <div className="export-choices">
            <button disabled={!!problem || busy} onClick={() => void run('ds')}>
              Design system
            </button>
            <button
              disabled={!!problem || busy}
              onClick={() => void run('preview')}
            >
              Aperçu actuel
            </button>
          </div>
          {busy && (
            <p className="token-hint" role="status">
              Export en cours…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
