import { useSyncExternalStore } from 'react';

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
  scrollY: Record<RootId, number>;
}

const STORAGE_KEY = 'youngtube_navigation_scroll_v1';

let snapshot: NavigationSnapshot = {
  root: 'home',
  stack: [],
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

export function switchRoot(root: RootId) {
  recordCurrentScroll();
  if (snapshot.root === root && snapshot.stack.length === 0) {
    scrollRootToTop(root);
    return;
  }
  snapshot = { ...snapshot, root, stack: [] };
  emit();
}

export function pushOverlay(overlay: Overlay) {
  const fromPlayer = typeof window !== 'undefined' && Boolean(window.history.state?.ytPlayer);
  const storedOverlay = { ...overlay, fromPlayer } as Overlay;
  snapshot = { ...snapshot, stack: [...snapshot.stack, storedOverlay] };
  if (typeof window !== 'undefined') {
    window.history.pushState({
      ytNavigation: true,
      overlayDepth: snapshot.stack.length,
      fromPlayer,
      ...(overlay.type === 'search' ? { searchStage: 'landing' } : {}),
    }, '');
  }
  emit();
}

export function popOverlay() {
  if (snapshot.stack.length === 0) return false;
  if (typeof window !== 'undefined') {
    window.history.back();
    return true;
  }
  snapshot = { ...snapshot, stack: snapshot.stack.slice(0, -1) };
  emit();
  return true;
}

export function replaceOverlayStack(stack: Overlay[]) {
  snapshot = { ...snapshot, stack: [...stack] };
  emit();
}

export function handleNavigationPopState(event: PopStateEvent, playerOpen = false) {
  if (!snapshot.stack.length) return false;
  const top = snapshot.stack[snapshot.stack.length - 1];
  // A push surface opened while Watch was on top sits above the player history entry.
  // Back returns to the player entry; pop the push surface but leave playback intact.
  if (event.state?.ytPlayer) {
    if (top?.fromPlayer) {
      snapshot = { ...snapshot, stack: snapshot.stack.slice(0, -1) };
      emit();
      return true;
    }
    return false;
  }
  // Back from Watch to the underlying root/overlay is handled by App.tsx. Do not pop the
  // root's push stack in the same history event.
  if (playerOpen) return false;
  if (top.type === 'search' && event.state?.ytNavigation && event.state?.searchStage === 'landing') {
    return true;
  }
  if (event.state?.ytNavigation || !event.state) {
    snapshot = { ...snapshot, stack: snapshot.stack.slice(0, -1) };
    emit();
    return true;
  }
  return false;
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

export function useNavigation() {
  return useSyncExternalStore(subscribeNavigation, getNavigationSnapshot, getNavigationSnapshot);
}
