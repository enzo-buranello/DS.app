import { contextBridge, ipcRenderer } from 'electron';
import { apiMethods } from '../shared/api.js';

contextBridge.exposeInMainWorld('studio', {
  ...Object.fromEntries(
    apiMethods.map((m) => [
      m,
      (...args: unknown[]) => ipcRenderer.invoke(m, ...args),
    ]),
  ),
  onActivity(fn: (a: unknown) => void) {
    const on = (_e: unknown, a: unknown) => fn(a);
    ipcRenderer.on('activity', on);
    return () => ipcRenderer.off('activity', on);
  },
});
