import { useEffect, useState } from 'react';
import type {
  ExportJob,
  FigmaCommand,
  FigmaParams,
  StudioFigmaStatus,
  TargetResult,
} from '../shared/figmaProtocol.js';
import type { ExportPayload } from '../shared/figmaExport.js';
import { request } from './api.js';

// Seule couche client Figma de l'app : état du pont et commandes au plugin.
// Le bouton Exporter s'appuiera sur ces fonctions.
export const figmaStatus = () => request<StudioFigmaStatus>('figma/status');

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
  const [status, setStatus] = useState<StudioFigmaStatus>();
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
              connections: [],
              target: null,
              targetConnected: false,
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

// Export : tâche côté serveur, suivie par sondage et annulable.
export const startFigmaExport = (payload: ExportPayload) =>
  request<ExportJob>('figma/export', payload);
export const figmaExportJob = (id: string) =>
  request<ExportJob>(`figma/export/${id}`);
export const cancelFigmaExport = (id: string) =>
  request<ExportJob>(`figma/export/${id}/cancel`, {});

// Cible : fichier et page Figma choisis par URL, mémorisés par projet.
export const setFigmaTarget = (url: string) =>
  request<TargetResult>('figma/target', { url });
export const clearFigmaTarget = () => request('figma/target/clear', {});
/** Ouverture système du lien : Figma desktop ouvre le fichier. */
export const openFigmaFile = (url: string) => request('figma/open', { url });
