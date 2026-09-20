import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register service worker immediately on startup and request update
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    void reg?.update();
  },
});

// Clean up legacy YouTube thumbnail cache entries on startup
if (typeof window !== 'undefined' && 'caches' in window) {
  try {
    void window.caches.delete('yt-thumbnails');
  } catch {
    // Ignore storage/cache access errors (e.g. strict private browsing)
  }
}

// Suppress benign browser-level ResizeObserver notifications (common with virtualization)
if (typeof window !== 'undefined') {
  const resizeObserverLoopErrRe = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i;

  // 1. Throttle / rAF patch Native ResizeObserver
  if (typeof window.ResizeObserver !== 'undefined') {
    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class PatchedResizeObserver extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        let frame: number | null = null;
        let lastEntries: ResizeObserverEntry[] | null = null;
        let lastObserver: ResizeObserver | null = null;

        super((entries, observer) => {
          lastEntries = entries;
          lastObserver = observer;
          if (frame === null) {
            frame = window.requestAnimationFrame(() => {
              frame = null;
              if (lastEntries && lastObserver) {
                try {
                  callback(lastEntries, lastObserver);
                } catch (err: unknown) {
                  if (err instanceof Error && resizeObserverLoopErrRe.test(err.message)) {
                    return;
                  }
                  if (typeof err === 'string' && resizeObserverLoopErrRe.test(err)) {
                    return;
                  }
                  throw err;
                }
                lastEntries = null;
                lastObserver = null;
              }
            });
          }
        });
      }
    };
  }

  // 2. Suppress console.error
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

  // 3. window.onerror handler (returns true to suppress top-level reporting)
  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (typeof message === 'string' && resizeObserverLoopErrRe.test(message)) {
      return true;
    }
    if (error && error.message && resizeObserverLoopErrRe.test(error.message)) {
      return true;
    }
    if (typeof originalOnError === 'function') {
      return originalOnError(message, source, lineno, colno, error);
    }
    return false;
  };

  // 4. Capture phase error listener
  window.addEventListener(
    'error',
    (e: ErrorEvent) => {
      if (
        (e.message && resizeObserverLoopErrRe.test(e.message)) ||
        (e.error && typeof e.error.message === 'string' && resizeObserverLoopErrRe.test(e.error.message))
      ) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true
  );

  // 5. Unhandled rejection listener
  window.addEventListener(
    'unhandledrejection',
    (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      if (
        (typeof reason === 'string' && resizeObserverLoopErrRe.test(reason)) ||
        (reason instanceof Error && resizeObserverLoopErrRe.test(reason.message))
      ) {
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

