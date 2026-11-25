import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import './i18n';
import './prefs';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

// Development only (stripped from release builds): lets the screenshot QA script drive the UI.
if (import.meta.env.DEV) {
  void Promise.all([import('./store'), import('./prefs'), import('./i18n'), import('./api')]).then(([store, prefs, i18n, api]) => {
    (window as unknown as { __mncord: unknown }).__mncord = { store: store.useStore, setPrefs: prefs.setPrefs, applyLang: i18n.applyLang, uploadFile: api.uploadFile };
  });
}

addEventListener('error', (e) => void window.mncord?.log.error(String(e.error?.stack ?? e.message)));
addEventListener('unhandledrejection', (e) => void window.mncord?.log.error(String((e.reason as Error)?.stack ?? e.reason)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
