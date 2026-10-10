import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

async function boot() {
  // Dev only: without Electron (plain `vite`), use the mock bridge so the
  // screens can be built and screenshotted in a browser. Removed from
  // production builds because import.meta.env.DEV is false there.
  if (import.meta.env.DEV && !(window as unknown as { pcwCare?: unknown }).pcwCare) {
    await import('./mock/mockBridge');
  }
  createRoot(document.getElementById('root')!).render(<App />);
}

void boot();
