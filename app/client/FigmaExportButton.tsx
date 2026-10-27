import { useEffect, useId, useRef, useState } from 'react';
import type { Tokens } from '../shared/model.js';
import { request } from './api.js';
import { captureDesignSystem, captureScreen } from './figmaExport.js';

interface Status {
  pairCode: string;
  live: {
    connected: boolean;
    unpaired: boolean;
    file: { name: string; key: string | null } | null;
  };
  account: {
    configured: boolean;
    connected: boolean;
    user: { handle: string; email: string } | null;
    storage: 'keychain' | 'file';
  };
  selection: {
    fileUrl: string;
    fileKey: string;
    fileName: string;
    pageId: string;
    pageName: string;
  };
}
interface FileInfo {
  fileKey: string;
  name: string;
  role: string;
  pages: { id: string; name: string }[];
}
interface Summary {
  pageName: string;
  created: number;
  updated: number;
  components: number;
  sets: number;
  screens: number;
  mismatched: string[];
  link: string;
}

// Seul point d'entrée Figma de l'app : connexion OAuth, choix fichier › page,
// puis écriture native par le plugin local ouvert sur ce fichier.
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
  const [status, setStatus] = useState<Status>();
  const [fileUrl, setFileUrl] = useState('');
  const [file, setFile] = useState<FileInfo>();
  const [pageId, setPageId] = useState('');
  const [busy, setBusy] = useState<'' | 'file' | 'export'>('');
  const [problem, setProblem] = useState('');
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  async function loadFile(url: string) {
    setBusy('file');
    setProblem('');
    try {
      const r = await request<FileInfo & { selection: Status['selection'] }>(
        'figma/file',
        { url },
      );
      setFile(r);
      setPageId(r.selection.pageId);
    } catch (e) {
      setFile(undefined);
      setProblem((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let restored = false;
    const poll = () =>
      request<Status>('figma')
        .then((next) => {
          if (!alive) return;
          setStatus(next);
          // Dernier choix mémorisé : fichier rechargé dès que le compte est connecté.
          if (!restored && next.account.connected) {
            restored = true;
            if (next.selection.fileUrl) {
              setFileUrl(next.selection.fileUrl);
              void loadFile(next.selection.fileUrl);
            }
          }
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
    requestAnimationFrame(() => menu.current?.focus());
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function run(kind: 'ds' | 'preview') {
    setBusy('export');
    setProblem('');
    try {
      const body =
        kind === 'ds'
          ? {
              pageId,
              kind,
              definitions: await captureDesignSystem(tokens),
              screens: [],
            }
          : await captureScreen(scenario, scenarioLabel, width, tokens).then(
              (screen) => ({
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
              }),
            );
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
      // Erreur visible dans le menu et dans la zone de messages (toast).
      setProblem((e as Error).message);
      onError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const account = status?.account;
  const live = status?.live;
  const page = file?.pages.find((p) => p.id === pageId);
  // Le plugin doit être lancé sur le fichier choisi, avec le bon code.
  const pluginProblem = !file
    ? ''
    : live?.unpaired
      ? 'Plugin lancé mais non connecté : collez ce code dans DS-Studio Bridge.'
      : !live?.connected
        ? `Plugin non lancé : ouvrez « ${file.name} » dans Figma Desktop, puis Plugins › Development › DS-Studio Bridge.`
        : live.file &&
            (live.file.key
              ? live.file.key !== file.fileKey
              : live.file.name !== file.name)
          ? `Fichier non ouvert dans Figma : le plugin est lancé sur « ${live.file.name} », ouvrez « ${file.name} ».`
          : '';
  const ready = !!page && !pluginProblem && file?.role !== 'viewer';
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
          {!account ? (
            <p className="token-hint" role="status">
              Chargement…
            </p>
          ) : !account.configured ? (
            <p className="export-problem" role="status">
              Connexion Figma non configurée : renseignez FIGMA_CLIENT_ID et
              FIGMA_CLIENT_SECRET dans .env, puis relancez DS-Studio.
            </p>
          ) : !account.connected ? (
            <>
              <p className="export-problem" role="status">
                Non connecté à Figma.
              </p>
              <a
                className="button-link"
                href="/api/figma/oauth/start"
                target="_blank"
                rel="noopener"
              >
                Se connecter à Figma
              </a>
            </>
          ) : (
            <>
              <div className="export-account">
                <span>
                  Connecté : <strong>{account.user?.handle}</strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void request('figma/logout', {})
                      .then(() => {
                        setFile(undefined);
                        setStatus(
                          (s) =>
                            s && {
                              ...s,
                              account: {
                                ...s.account,
                                connected: false,
                                user: null,
                              },
                            },
                        );
                      })
                      .catch((e) => onError((e as Error).message))
                  }
                >
                  Se déconnecter
                </button>
              </div>
              <form
                className="export-file"
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadFile(fileUrl);
                }}
              >
                <label className="field">
                  Fichier Figma (lien)
                  <input
                    type="url"
                    value={fileUrl}
                    placeholder="https://www.figma.com/design/…"
                    onChange={(e) => setFileUrl(e.target.value)}
                  />
                </label>
                <button disabled={!fileUrl.trim() || busy === 'file'}>
                  {busy === 'file' ? '…' : 'Charger'}
                </button>
              </form>
              {file && (
                <label className="field">
                  Page · {file.name}
                  <select
                    value={page ? pageId : ''}
                    onChange={(e) => {
                      const next = file.pages.find(
                        (p) => p.id === e.target.value,
                      );
                      setPageId(e.target.value);
                      if (next)
                        void request('figma/page', {
                          pageId: next.id,
                          pageName: next.name,
                        }).catch((err) => onError((err as Error).message));
                    }}
                  >
                    <option value="" disabled>
                      Choisir une page
                    </option>
                    {file.pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {file?.role === 'viewer' && (
                <p className="export-problem" role="status">
                  Droits insuffisants : ce fichier est en lecture seule pour
                  votre compte.
                </p>
              )}
              {pluginProblem && (
                <p className="export-problem" role="status">
                  {pluginProblem}
                  {(live?.unpaired || !live?.connected) && (
                    <>
                      {' '}
                      Code :{' '}
                      <code className="pair-code">{status.pairCode}</code>
                    </>
                  )}
                </p>
              )}
              {problem && (
                <p className="error" role="alert">
                  {problem}
                </p>
              )}
              <div className="export-choices">
                <button
                  disabled={!ready || !!busy}
                  onClick={() => void run('ds')}
                >
                  Design system
                </button>
                <button
                  disabled={!ready || !!busy}
                  onClick={() => void run('preview')}
                >
                  Aperçu actuel
                </button>
              </div>
              {busy === 'export' && (
                <p className="token-hint" role="status">
                  Export en cours…
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
