import { useSyncExternalStore } from 'react';
import {
  getCurrentHistoryMeta,
  initializeNavigationHistory,
  pushOverlayHistoryEntry,
  replaceNavigationHistoryContext,
  requestHistoryBack,
  subscribeHistoryTransitions,
} from './historyCoordinator';

export type RootId = 'home' | 'channels' | 'playlists' | 'you';

export type Overlay =
  | { type: 'search'; fromPlayer?: boolean }
  | { type: 'channel'; channelId: string; title?: string; fromPlayer?: boolean }
  | { type: 'playlist'; playlistId: string; title?: string; fromPlayer?: boolean }
  | { type: 'favorites'; fromPlayer?: boolean }
  | { type: 'downloads'; fromPlayer?: boolean }
  | { type: 'history'; fromPlayer?: boolean };

export interface NavigationSnapshot {
  root: RootId;
  stack: Overlay[];
  overlayStack: Overlay[];
  scrollY: Record<RootId, number>;
}

const STORAGE_KEY = 'youngtube_navigation_scroll_v1';

let snapshot: NavigationSnapshot = {
  root: 'home',
  stack: [],
  overlayStack: [],
  scrollY: {
    home: 0,
    channels: 0,
    playlists: 0,
    you: 0,
  },
};

const listeners = new Set<() => void>();

function readStoredScroll(): Record<RootId, number> {
  if (typeof window === 'undefined') return snapshot.scrollY;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Record<RootId, number>>;
    return {
      home: Number.isFinite(parsed.home) ? Math.max(0, parsed.home as number) : 0,
      channels: Number.isFinite(parsed.channels) ? Math.max(0, parsed.channels as number) : 0,
      playlists: Number.isFinite(parsed.playlists) ? Math.max(0, parsed.playlists as number) : 0,
      you: Number.isFinite(parsed.you) ? Math.max(0, parsed.you as number) : 0,
    };
  } catch {
    return snapshot.scrollY;
  }
}

snapshot.scrollY = readStoredScroll();

function emit() {
  for (const listener of listeners) listener();
}

function persistScroll() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.scrollY));
  } catch {
    // Best effort only.
  }
}

export function getNavigationSnapshot(): NavigationSnapshot {
  return snapshot;
}

export function subscribeNavigation(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordCurrentScroll(root: RootId = snapshot.root) {
  if (typeof window === 'undefined') return;
  const y = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
  if (snapshot.scrollY[root] !== y) {
    snapshot = { ...snapshot, scrollY: { ...snapshot.scrollY, [root]: y } };
    persistScroll();
  }
}

function isRootId(value: unknown): value is RootId {
  return value === 'home' || value === 'channels' || value === 'playlists' || value === 'you';
}

function syncSnapshotFromHistory(meta: ReturnType<typeof getCurrentHistoryMeta>) {
  if (!meta) return;
  const root = isRootId(meta.root) ? meta.root : 'home';
  const stack = Array.isArray(meta.overlayStack) ? meta.overlayStack as Overlay[] : [];
  if (snapshot.root === root
      && snapshot.stack.length === stack.length
      && snapshot.stack.every((entry, index) => JSON.stringify(entry) === JSON.stringify(stack[index]))) {
    return;
  }
  snapshot = { ...snapshot, root, stack, overlayStack: stack };
  emit();
}

function syncFromHistoryTransition(transition: { toMeta?: ReturnType<typeof getCurrentHistoryMeta> | null }) {
  syncSnapshotFromHistory(transition.toMeta ?? null);
}

export function switchRoot(root: RootId) {
  recordCurrentScroll();
  if (snapshot.root === root && snapshot.stack.length === 0) {
    scrollRootToTop(root);
    return;
  }
  snapshot = { ...snapshot, root, stack: [], overlayStack: [] };
  replaceNavigationHistoryContext(root, []);
  emit();
}

export function pushOverlay(overlay: Overlay) {
  const nextStack = [...snapshot.stack, overlay];
  const result = pushOverlayHistoryEntry(nextStack, overlay);
  const actualStack = result.overlayStack as Overlay[];
  snapshot = { ...snapshot, stack: actualStack, overlayStack: actualStack };
  emit();
}

export function popOverlay() {
  if (snapshot.stack.length === 0) return false;
  if (typeof window !== 'undefined') return requestHistoryBack('overlay-back');
  const nextStack = snapshot.stack.slice(0, -1);
  snapshot = { ...snapshot, stack: nextStack, overlayStack: nextStack };
  emit();
  return true;
}

export function replaceOverlayStack(stack: Overlay[]) {
  const nextStack = [...stack];
  snapshot = { ...snapshot, stack: nextStack, overlayStack: nextStack };
  replaceNavigationHistoryContext(snapshot.root, nextStack);
  emit();
}

export function getActiveOverlay(): Overlay | null {
  return snapshot.stack[snapshot.stack.length - 1] ?? null;
}

export function scrollRootToTop(root: RootId = snapshot.root) {
  snapshot = { ...snapshot, scrollY: { ...snapshot.scrollY, [root]: 0 } };
  persistScroll();
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  emit();
}

export function restoreRootScroll(root: RootId = snapshot.root) {
  if (typeof window === 'undefined') return;
  const y = Math.max(0, snapshot.scrollY[root] || 0);
  requestAnimationFrame(() => {
    window.scrollTo({ top: y, behavior: 'auto' });
  });
}

// Initialize and mirror all application-level History transitions once. The coordinator
// owns the only popstate listener; this store is a read model, not a second history owner.
if (typeof window !== 'undefined') {
  initializeNavigationHistory(snapshot.root);
  syncSnapshotFromHistory(getCurrentHistoryMeta());
  subscribeHistoryTransitions(syncFromHistoryTransition);
}

export function useNavigation() {
  return useSyncExternalStore(subscribeNavigation, getNavigationSnapshot, getNavigationSnapshot);
}
