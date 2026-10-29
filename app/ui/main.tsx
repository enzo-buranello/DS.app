import { createRoot } from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import '@fontsource-variable/geist';
import './styles.css';
import App from './App.js';

createRoot(document.getElementById('root')!).render(
  <IconContext.Provider
    value={{ size: 16, weight: 'regular', color: 'currentColor' }}
  >
    <App />
  </IconContext.Provider>,
);
