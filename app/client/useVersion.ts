import { useEffect, useState } from 'react';

// Onglet ou serveur périmé après une mise à jour : l'onglet compare son
// bundle à celui que le serveur publie, et le serveur dit s'il tourne sur un
// code plus ancien que celui du disque. Un serveur sans /api/version date
// d'avant ce contrôle : il est forcément périmé.
export interface VersionState {
  /** Un bundle plus récent est publié : recharger l'onglet. */
  reload: boolean;
  /** Le serveur exécute un code plus ancien : le relancer. */
  serverStale: boolean;
}
const CHECK_MS = 20_000;

/** Bundle de cet onglet (« assets/index-….js »), null en développement. */
export function ownBuild(): string | null {
  try {
    const p = new URL(import.meta.url).pathname;
    return /^\/assets\/index-[\w-]+\.js$/.test(p) ? p.slice(1) : null;
  } catch {
    return null;
  }
}

export function versionState(
  own: string | null,
  response: {
    status: number;
    body?: { client: string | null; serverStale: boolean };
  },
): VersionState {
  if (response.status === 404) return { reload: false, serverStale: true };
  if (!response.body) return { reload: false, serverStale: false };
  const { client, serverStale } = response.body;
  return { reload: !!own && !!client && client !== own, serverStale };
}

export function useVersion(): VersionState {
  const [state, setState] = useState<VersionState>({
    reload: false,
    serverStale: false,
  });
  useEffect(() => {
    const own = ownBuild();
    let stopped = false;
    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        const body = r.ok ? await r.json() : undefined;
        const next = versionState(own, { status: r.status, body });
        if (!stopped)
          setState((s) =>
            s.reload === next.reload && s.serverStale === next.serverStale
              ? s
              : next,
          );
      } catch {
        /* Serveur arrêté : l'app affiche déjà ses erreurs de connexion. */
      }
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_MS);
    const onFocus = () => document.visibilityState === 'visible' && check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  return state;
}
