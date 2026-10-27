import { useEffect, useState } from 'react';
import {
  figmaFileKey,
  type ComponentListItem,
  type LiveInfo,
} from '../shared/figmaComponents.js';
import { request } from './api.js';

interface Live {
  connected: boolean;
  file: LiveInfo['file'] | null;
  pages: LiveInfo['pages'];
  selection: { fileUrl: string; pageId: string };
}

// Import de composants depuis le fichier ouvert dans Figma Desktop, via le plugin local.
export default function FigmaImport({
  onImported,
}: {
  onImported: (summary: string) => void;
}) {
  const [live, setLive] = useState<Live>();
  const [pairCode, setPairCode] = useState('');
  const [showPairing, setShowPairing] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const [pageId, setPageId] = useState('');
  const [items, setItems] = useState<ComponentListItem[]>();
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'list' | 'import'>('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let restored = false;
    const poll = async () => {
      try {
        const next = await request<Live>('figma/live');
        if (!alive) return;
        setLive(next);
        if (!restored) {
          restored = true;
          setFileUrl(next.selection.fileUrl);
          setPageId(next.selection.pageId);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const connected = !!live?.connected;
  const pageExists = !!live?.pages.some((p) => p.id === pageId);
  // Le plugin ne voit que le fichier ouvert : un lien collé sert à vérifier la cible.
  const pastedKey = fileUrl.trim() ? figmaFileKey(fileUrl.trim()) : null;
  const urlProblem = !fileUrl.trim()
    ? ''
    : !pastedKey
      ? 'Lien Figma non reconnu (figma.com/design/… attendu).'
      : live?.file?.key && live.file.key !== pastedKey
        ? `Ce lien ne correspond pas au fichier ouvert (« ${live.file.name} »). Ouvrez-le dans Figma Desktop puis relancez le plugin.`
        : '';

  useEffect(() => {
    if (!connected || !pageExists) {
      setItems(undefined);
      return;
    }
    let alive = true;
    setBusy('list');
    setError('');
    setChosen([]);
    request<{ items: ComponentListItem[] }>('figma/components', { pageId })
      .then((r) => alive && setItems(r.items))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setBusy(''));
    return () => {
      alive = false;
    };
  }, [connected, pageId, pageExists]);

  function remember(next: { fileUrl?: string; pageId?: string }) {
    request('figma/selection', {
      fileUrl: next.fileUrl ?? fileUrl,
      pageId: next.pageId ?? pageId,
    }).catch((e) => setError((e as Error).message));
  }
  async function importChosen() {
    setBusy('import');
    setError('');
    try {
      const r = await request<{ created: number; updated: number }>(
        'figma/import-components',
        { pageId, ids: chosen },
      );
      setChosen([]);
      onImported(
        `Import Figma : ${r.created} composant(s) créé(s), ${r.updated} mis à jour.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (!live) return <p className="token-hint">Recherche du plugin Figma…</p>;
  if (!connected)
    return (
      <div className="figma-import">
        <p className="figma-state">Figma non connecté.</p>
        <button
          type="button"
          onClick={() => {
            setShowPairing(true);
            request<{ pairCode: string }>('figma')
              .then((r) => setPairCode(r.pairCode))
              .catch((e) => setError((e as Error).message));
          }}
        >
          Connecter Figma
        </button>
        {showPairing && (
          <ol className="figma-steps">
            <li>Ouvrez le fichier dans Figma Desktop.</li>
            <li>Plugins › Development › DS-Studio Bridge.</li>
            <li>
              Collez le code{' '}
              <code className="pair-code">{pairCode || '…'}</code> puis «
              Enregistrer et tester ».
            </li>
          </ol>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div className="figma-import">
      <label className="field">
        Fichier Figma
        <select disabled value="open">
          <option value="open">{live.file?.name ?? 'Fichier ouvert'}</option>
        </select>
      </label>
      <label className="field">
        Ou coller l’URL du fichier
        <input
          type="url"
          value={fileUrl}
          placeholder="https://www.figma.com/design/…"
          onChange={(e) => setFileUrl(e.target.value)}
          onBlur={() => remember({})}
        />
      </label>
      {urlProblem && (
        <p className="error" role="alert">
          {urlProblem}
        </p>
      )}
      <label className="field">
        Page
        <select
          value={pageExists ? pageId : ''}
          onChange={(e) => {
            setPageId(e.target.value);
            remember({ pageId: e.target.value });
          }}
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
      {busy === 'list' && (
        <p className="token-hint" role="status">
          Chargement des composants…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items && busy !== 'list' && items.length === 0 && (
        <p className="figma-state">Aucun composant sur cette page.</p>
      )}
      {items && items.length > 0 && busy !== 'list' && (
        <>
          <ul className="figma-components" aria-label="Composants de la page">
            {items.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={chosen.includes(item.id)}
                    onChange={(e) =>
                      setChosen((c) =>
                        e.target.checked
                          ? [...c, item.id]
                          : c.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" />
                  ) : (
                    <span className="thumb-empty" aria-hidden="true" />
                  )}
                  <span>
                    {item.name}
                    {item.type === 'COMPONENT_SET' && (
                      <small> · {item.variants} variante(s)</small>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="studio-primary wide"
            disabled={!chosen.length || busy === 'import' || !!urlProblem}
            onClick={() => void importChosen()}
          >
            {busy === 'import'
              ? 'Import en cours…'
              : `Importer${chosen.length ? ` (${chosen.length})` : ''}`}
          </button>
        </>
      )}
    </div>
  );
}
