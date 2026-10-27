import { createRoot } from 'react-dom/client';
import App, { ExportSheet, Preview } from './App.js';
import './styles.css';
const params = new URLSearchParams(location.search);
const preview = params.get('preview') === '1';
const exportSheet = params.get('export') === 'ds';
if (preview || exportSheet) document.body.classList.add('preview-body');
createRoot(document.getElementById('root')!).render(
  exportSheet ? <ExportSheet /> : preview ? <Preview /> : <App />,
);
