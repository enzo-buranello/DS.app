import { useEffect, useState } from 'react';
import type {
  FigmaCommand,
  FigmaParams,
  FigmaStatus,
} from '../shared/figmaProtocol.js';
import { request } from './api.js';

// Seule couche client Figma de l'app : état du pont et commandes au plugin.
// Le bouton Exporter s'appuiera sur ces fonctions.
export const figmaStatus = () => request<FigmaStatus>('figma/status');

export async function runFigma<C extends FigmaCommand>(
  command: C,
  params: FigmaParams<C>,
): Promise<unknown> {
  const r = await request<{ ok: true; result: unknown }>('figma/command', {
    command,
    params,
  });
  return r.result;
}

/** État du pont, rafraîchi en continu : suit aussi les reconnexions du plugin. */
export function useFigmaStatus(intervalMs = 1500) {
  const [status, setStatus] = useState<FigmaStatus>();
  useEffect(() => {
    let alive = true;
    const poll = () =>
      figmaStatus()
        .then((s) => alive && setStatus(s))
        .catch(
          () =>
            alive &&
            setStatus({
              state: 'disconnected',
              port: 0,
              fileName: null,
              error: 'Serveur DS-Studio injoignable.',
            }),
        );
    void poll();
    const timer = setInterval(() => void poll(), intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return status;
}
