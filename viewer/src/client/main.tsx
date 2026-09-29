/**
 * Client entry: fonts, design tokens, theme, then the React app.
 *
 * IBM Plex Sans and Mono (400, 500, 600) are bundled from `@fontsource`
 * rather than loaded from Google Fonts, so the viewer works offline and
 * makes no third-party requests.
 */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { followSystemTheme } from './theme.js';

followSystemTheme();

const container = document.getElementById('root');
if (!container) throw new Error('phase-viewer: #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
