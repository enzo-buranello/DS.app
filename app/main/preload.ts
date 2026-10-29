import { contextBridge, ipcRenderer } from 'electron';
import { apiMethods } from '../shared/api.js';

contextBridge.exposeInMainWorld(
  'studio',
  Object.fromEntries(
    apiMethods.map((m) => [
      m,
      (...args: unknown[]) => ipcRenderer.invoke(m, ...args),
    ]),
  ),
);
