import { createRoot } from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import App, { ExportSheet, Preview } from './App.js';
import '@fontsource-variable/geist';
import './styles.css';
const params = new URLSearchParams(location.search);
const preview = params.get('preview') === '1';
const exportSheet = params.get('export') === 'ds';
if (preview || exportSheet) document.body.classList.add('preview-body');
// Icônes Phosphor : graisse Regular, 16 px, couleur du texte.
createRoot(document.getElementById('root')!).render(
  <IconContext.Provider
    value={{ size: 16, weight: 'regular', color: 'currentColor' }}
  >
    {exportSheet ? <ExportSheet /> : preview ? <Preview /> : <App />}
  </IconContext.Provider>,
);
