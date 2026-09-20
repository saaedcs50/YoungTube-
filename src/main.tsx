import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register service worker immediately on startup
registerSW({ immediate: true });

// One-time cleanup of legacy/bad YouTube thumbnail cache entries
if (typeof window !== 'undefined' && 'caches' in window) {
  try {
    if (!localStorage.getItem('yt_thumb_cache_v2')) {
      window.caches.delete('yt-thumbnails').catch(() => {});
      localStorage.setItem('yt_thumb_cache_v2', '1');
    }
  } catch {
    // Ignore storage/cache access errors (e.g. strict private browsing)
  }
}

// Suppress benign browser-level ResizeObserver notifications (common with virtualization)
if (typeof window !== 'undefined') {
  const resizeObserverLoopErrRe = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i;

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && resizeObserverLoopErrRe.test(args[0])) {
      return;
    }
    if (args[0] instanceof Error && resizeObserverLoopErrRe.test(args[0].message)) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  window.addEventListener(
    'error',
    (e: ErrorEvent) => {
      if (e.message && resizeObserverLoopErrRe.test(e.message)) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

