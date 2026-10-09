/**
 * The single owner of YoungTube's application-level browser History API.
 * UI stores may mirror the transitions emitted here, but must not add their
 * own popstate listeners or call pushState/replaceState/back/go independently.
 */

export const HISTORY_STATE_KEY = 'youngtubeHistory';
export const HISTORY_SCHEMA_VERSION = 1;

const LEGACY_OWNED_KEYS = [
  'ytNavigation',
  'overlayDepth',
  'fromPlayer',
  'ytPlayer',
  'playerLevel',
  'fullscreen',
  'sheetOpen',
  'searchStage',
  'query',
  'ytMiniplayerSentinel',
];

export const HISTORY_ENTRY_KINDS = Object.freeze([
  'root',
  'anchor',
  'overlay',
  'search-results',
  'player',
  'player-fullscreen',
  'player-settings',
  'miniplayer-sentinel',
]);

const PLAYER_KINDS = new Set(['player', 'player-fullscreen', 'player-settings']);
const BASE_KINDS = new Set(['root', 'anchor', 'miniplayer-sentinel']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function defaultIdFactory() {
  let sequence = 0;
  return () => {
    sequence += 1;
    let randomPart = '';
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        randomPart = crypto.randomUUID();
      }
    } catch {
      // The deterministic-in-this-instance fallback below also works in WebViews
      // where crypto.randomUUID is not exposed.
    }
    if (!randomPart) randomPart = Math.random().toString(36).slice(2, 12);
    return `yt-${Date.now().toString(36)}-${sequence.toString(36)}-${randomPart}`;
  };
}

export function isValidHistoryMeta(meta) {
  return isRecord(meta)
    && meta.schemaVersion === HISTORY_SCHEMA_VERSION
    && typeof meta.entryId === 'string'
    && meta.entryId.length > 0
    && HISTORY_ENTRY_KINDS.includes(meta.entryKind)
    && (meta.parentEntryId === null || typeof meta.parentEntryId === 'string')
    && typeof meta.root === 'string'
    && Array.isArray(meta.overlayStack);
}

export function readHistoryMeta(state) {
  if (!isRecord(state)) return null;
  const meta = state[HISTORY_STATE_KEY];
  return isValidHistoryMeta(meta) ? cloneSerializable(meta) : null;
}

export function createHistoryMeta(fields, idFactory = defaultIdFactory()) {
  const entryKind = fields?.entryKind;
  if (!HISTORY_ENTRY_KINDS.includes(entryKind)) {
    throw new TypeError(`Unsupported YoungTube history entry kind: ${String(entryKind)}`);
  }

  const meta = {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    entryId: typeof fields.entryId === 'string' && fields.entryId ? fields.entryId : idFactory(),
    entryKind,
    parentEntryId: fields.parentEntryId ?? null,
    root: typeof fields.root === 'string' ? fields.root : 'home',
    overlayStack: cloneSerializable(Array.isArray(fields.overlayStack) ? fields.overlayStack : []) ?? [],
  };

  for (const key of ['fromPlayer', 'playerLevel', 'searchStage', 'query']) {
    if (fields[key] !== undefined) meta[key] = cloneSerializable(fields[key]);
  }

  if (meta.fromPlayer !== undefined) meta.fromPlayer = Boolean(meta.fromPlayer);
  if (meta.playerLevel !== undefined && ![1, 2, 3].includes(meta.playerLevel)) delete meta.playerLevel;
  if (meta.searchStage !== undefined && !['landing', 'results'].includes(meta.searchStage)) delete meta.searchStage;
  if (meta.query !== undefined && typeof meta.query !== 'string') delete meta.query;

  return meta;
}

function legacyFieldsFromMeta(meta) {
  const fields = {};
  if (meta.entryKind === 'overlay' || meta.entryKind === 'search-results') {
    fields.ytNavigation = true;
    fields.overlayDepth = meta.overlayStack.length;
    fields.fromPlayer = Boolean(meta.fromPlayer);
    if (meta.searchStage) fields.searchStage = meta.searchStage;
    if (meta.query !== undefined) fields.query = meta.query;
  } else if (PLAYER_KINDS.has(meta.entryKind)) {
    fields.ytPlayer = true;
    fields.playerLevel = meta.playerLevel ?? (meta.entryKind === 'player-fullscreen' ? 2 : meta.entryKind === 'player-settings' ? 3 : 1);
    fields.fullscreen = meta.entryKind === 'player-fullscreen';
    fields.sheetOpen = meta.entryKind === 'player-settings';
  } else if (meta.entryKind === 'miniplayer-sentinel') {
    fields.ytMiniplayerSentinel = true;
  }
  return fields;
}

export function mergeHistoryState(existingState, meta) {
  const result = isRecord(existingState) ? { ...existingState } : {};
  for (const key of LEGACY_OWNED_KEYS) delete result[key];
  delete result[HISTORY_STATE_KEY];
  return {
    ...result,
    ...legacyFieldsFromMeta(meta),
    [HISTORY_STATE_KEY]: cloneSerializable(meta),
  };
}

function isPlayerEntry(meta) {
  return Boolean(meta && PLAYER_KINDS.has(meta.entryKind));
}

function isPlayerLevel(meta, level) {
  return isPlayerEntry(meta) && Number(meta.playerLevel) === level;
}

function isBaseEntry(meta) {
  return Boolean(meta && BASE_KINDS.has(meta.entryKind));
}

export function decideHistoryPop(fromMeta, toMeta) {
  if (!isValidHistoryMeta(fromMeta) || !isValidHistoryMeta(toMeta)) return 'navigation';

  if (fromMeta.entryKind === 'miniplayer-sentinel' && !isPlayerEntry(toMeta)) {
    return 'player-close';
  }

  if (fromMeta.entryKind === 'player-settings'
      && isPlayerEntry(toMeta)
      && Number(toMeta.playerLevel ?? 0) < Number(fromMeta.playerLevel ?? 3)) {
    return 'player-settings-close';
  }

  if (fromMeta.entryKind === 'player-fullscreen'
      && isPlayerLevel(toMeta, 1)) {
    return 'player-fullscreen-exit';
  }

  if (isPlayerLevel(fromMeta, 1) && !isPlayerEntry(toMeta)) {
    return 'player-minimize';
  }

  if (isPlayerEntry(fromMeta) && !isPlayerEntry(toMeta) && !isBaseEntry(toMeta)) {
    return 'player-minimize';
  }

  return 'navigation';
}

function browserAdapter() {
  return {
    getState() {
      return typeof window !== 'undefined' ? window.history.state : null;
    },
    pushState(state) {
      if (typeof window === 'undefined') return false;
      window.history.pushState(state, '');
      return true;
    },
    replaceState(state) {
      if (typeof window === 'undefined') return false;
      window.history.replaceState(state, '');
      return true;
    },
    back() {
      if (typeof window === 'undefined') return false;
      window.history.back();
      return true;
    },
    addPopStateListener(listener) {
      if (typeof window !== 'undefined') window.addEventListener('popstate', listener);
    },
    removePopStateListener(listener) {
      if (typeof window !== 'undefined') window.removeEventListener('popstate', listener);
    },
  };
}

/**
 * Creates a coordinator over a minimal history adapter. This seam is used by
 * dependency-free tests and allows delayed popstate acknowledgements to be
 * tested without pretending that history.back() is synchronous.
 */
export function createHistoryCoordinator(adapter, options = {}) {
  if (!adapter || typeof adapter.getState !== 'function' || typeof adapter.pushState !== 'function'
      || typeof adapter.replaceState !== 'function' || typeof adapter.back !== 'function') {
    throw new TypeError('History coordinator requires getState/pushState/replaceState/back adapter methods');
  }

  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory();
  const listeners = new Set();
  const knownEntries = new Map();
  const seenEvents = new WeakSet();
  let initialized = false;
  let currentMeta = null;
  let pendingTraversal = null;
  let rootFallback = 'home';
  let disposed = false;

  function makeMeta(entryKind, fields = {}) {
    return createHistoryMeta({
      entryKind,
      parentEntryId: fields.parentEntryId ?? null,
      root: fields.root ?? rootFallback,
      overlayStack: fields.overlayStack ?? [],
      ...fields,
    }, idFactory);
  }

  function remember(meta) {
    knownEntries.set(meta.entryId, cloneSerializable(meta));
    currentMeta = cloneSerializable(meta);
    return currentMeta;
  }

  function writeMeta(meta, method = 'replace') {
    const nextMeta = cloneSerializable(meta);
    const state = mergeHistoryState(adapter.getState(), nextMeta);
    if (method === 'push') adapter.pushState(state);
    else adapter.replaceState(state);
    return remember(nextMeta);
  }

  function dispatchTransition(transition) {
    const safeTransition = Object.freeze({
      type: transition.type ?? 'popstate',
      decision: transition.decision ?? 'navigation',
      reason: transition.reason ?? 'history-transition',
      fromMeta: cloneSerializable(transition.fromMeta ?? null),
      toMeta: cloneSerializable(transition.toMeta ?? currentMeta),
      degraded: Boolean(transition.degraded),
    });
    for (const listener of [...listeners]) {
      try {
        listener(safeTransition);
      } catch (error) {
        // A view-level observer must not break the coordinator or strand a
        // pending browser traversal. Runtime diagnostics stay local to console.
        console.error('YoungTube history transition subscriber failed:', error);
      }
    }
  }

  function normalizeDestination(state) {
    const existingMeta = readHistoryMeta(state);
    if (existingMeta) {
      rootFallback = existingMeta.root || rootFallback;
      knownEntries.set(existingMeta.entryId, cloneSerializable(existingMeta));
      return existingMeta;
    }

    // An older/malformed state is treated as a safe app root. mergeHistoryState
    // retains unrelated fields and removes only the app-owned legacy markers.
    const fallbackMeta = makeMeta('root', {
      parentEntryId: null,
      root: rootFallback,
      overlayStack: [],
    });
    adapter.replaceState(mergeHistoryState(state, fallbackMeta));
    knownEntries.set(fallbackMeta.entryId, cloneSerializable(fallbackMeta));
    return fallbackMeta;
  }

  function initialize(root = 'home') {
    if (disposed) return null;
    rootFallback = typeof root === 'string' ? root : 'home';
    if (initialized) return currentMeta;

    const initialState = adapter.getState();
    const rootMeta = makeMeta('root', {
      parentEntryId: null,
      root: rootFallback,
      overlayStack: [],
    });
    // On a fresh React application instance, reset only YoungTube's current
    // entry markers. Keep third-party/unrelated state fields intact.
    writeMeta(rootMeta, 'replace');
    if (typeof adapter.addPopStateListener === 'function') {
      adapter.addPopStateListener(onPopState);
    }
    initialized = true;
    return currentMeta;
  }

  function ensureInitialized() {
    if (!initialized) initialize(rootFallback);
    return initialized && !disposed;
  }

  function replaceCurrentMeta(patch) {
    if (!ensureInitialized()) return null;
    const existing = currentMeta ?? readHistoryMeta(adapter.getState());
    const base = existing ?? makeMeta('root', { root: rootFallback, overlayStack: [] });
    const next = makeMeta(base.entryKind, {
      ...base,
      ...patch,
      entryId: base.entryId,
      parentEntryId: patch.parentEntryId !== undefined ? patch.parentEntryId : base.parentEntryId,
      root: patch.root ?? base.root,
      overlayStack: patch.overlayStack ?? base.overlayStack,
    });
    return writeMeta(next, 'replace');
  }

  function pushEntry(entryKind, fields = {}) {
    if (!ensureInitialized()) return null;
    const parent = currentMeta ?? normalizeDestination(adapter.getState());
    const next = makeMeta(entryKind, {
      ...fields,
      parentEntryId: parent.entryId,
      root: fields.root ?? parent.root,
    });
    return writeMeta(next, 'push');
  }

  function pushOverlayEntry(overlayStack, overlay) {
    if (!ensureInitialized()) return { meta: null, overlayStack: Array.isArray(overlayStack) ? overlayStack : [] };
    const parent = currentMeta ?? normalizeDestination(adapter.getState());
    const fromPlayer = isPlayerEntry(parent)
      || Boolean(parent.fromPlayer)
      || Boolean(parent.overlayStack?.some((entry) => entry?.fromPlayer));
    const priorStack = Array.isArray(overlayStack) ? overlayStack.slice(0, -1) : [];
    const storedOverlay = { ...(overlay ?? {}), fromPlayer };
    const nextStack = [...priorStack, storedOverlay];
    const inheritedSearchStage = parent.searchStage;
    const inheritedQuery = parent.query;
    const meta = pushEntry('overlay', {
      root: parent.root,
      overlayStack: nextStack,
      fromPlayer,
      ...(storedOverlay.type === 'search'
        ? { searchStage: 'landing' }
        : inheritedSearchStage ? { searchStage: inheritedSearchStage } : {}),
      ...(storedOverlay.type === 'search'
        ? {}
        : inheritedQuery !== undefined ? { query: inheritedQuery } : {}),
    });
    return { meta, overlayStack: nextStack };
  }

  function pushSearchResultsEntry(query, overlayStack) {
    if (!ensureInitialized()) return null;
    const parent = currentMeta ?? normalizeDestination(adapter.getState());
    return pushEntry('search-results', {
      root: parent.root,
      overlayStack: Array.isArray(overlayStack) ? overlayStack : parent.overlayStack,
      fromPlayer: Boolean(parent.fromPlayer || parent.overlayStack?.some((overlay) => overlay?.fromPlayer)),
      searchStage: 'results',
      query: String(query ?? '').trim(),
    });
  }

  function replaceSearchQuery(query) {
    if (!ensureInitialized()) return null;
    const current = currentMeta ?? normalizeDestination(adapter.getState());
    if (current.entryKind !== 'search-results') return null;
    return replaceCurrentMeta({ searchStage: 'results', query: String(query ?? '').trim() });
  }

  function pushPlayerEntry(level, options = {}) {
    if (![1, 2, 3].includes(level)) throw new TypeError(`Unsupported player level: ${String(level)}`);
    const entryKind = level === 1 ? 'player' : level === 2 ? 'player-fullscreen' : 'player-settings';
    return pushEntry(entryKind, {
      root: currentMeta?.root ?? rootFallback,
      overlayStack: [],
      playerLevel: level,
      fromPlayer: false,
      ...options,
    });
  }

  function requestBack(reason = 'back-button') {
    if (!ensureInitialized() || pendingTraversal) return false;
    if (typeof adapter.back !== 'function') return false;
    pendingTraversal = {
      kind: 'single',
      reason,
      fromMeta: cloneSerializable(currentMeta),
    };
    const started = adapter.back();
    if (started === false) pendingTraversal = null;
    return started !== false;
  }

  function isHandoffBase(meta) {
    return isBaseEntry(meta) || isPlayerLevel(meta, 1);
  }

  function toAnchor(meta) {
    const anchor = cloneSerializable(meta);
    anchor.entryKind = 'anchor';
    anchor.overlayStack = [];
    delete anchor.fromPlayer;
    delete anchor.playerLevel;
    delete anchor.searchStage;
    delete anchor.query;
    return anchor;
  }

  function finishHandoff(targetMeta, pending) {
    let finalMeta = targetMeta;
    if (isPlayerLevel(targetMeta, 1) || targetMeta.entryKind === 'miniplayer-sentinel') {
      finalMeta = writeMeta(toAnchor(targetMeta), 'replace');
    } else {
      finalMeta = remember(targetMeta);
    }
    pendingTraversal = null;
    dispatchTransition({
      type: 'handoff-complete',
      decision: 'handoff-complete',
      reason: pending.reason,
      fromMeta: pending.fromMeta,
      toMeta: finalMeta,
    });
    // The caller selects the new video only after the destination is observed
    // and the visible overlay store has been told to clear its stack.
    pending.onComplete?.();
  }

  function finishPlayerClose(targetMeta, pending) {
    let finalMeta = targetMeta;
    if (targetMeta.entryKind === 'miniplayer-sentinel') {
      finalMeta = writeMeta(toAnchor(targetMeta), 'replace');
    } else {
      finalMeta = remember(targetMeta);
    }
    pendingTraversal = null;
    dispatchTransition({
      type: 'player-close-complete',
      decision: 'player-close-complete',
      reason: pending.reason,
      fromMeta: pending.fromMeta,
      toMeta: finalMeta,
    });
    pending.onComplete?.();
  }

  function stepPendingTraversal(fromMeta, toMeta, eventState) {
    const pending = pendingTraversal;
    if (!pending || !['handoff', 'close-player'].includes(pending.kind)) return false;

    const expectedParent = fromMeta?.parentEntryId;
    const parentMatches = typeof expectedParent === 'string' && toMeta.entryId === expectedParent;
    const isBase = pending.kind === 'handoff'
      ? isHandoffBase(toMeta)
      : isBaseEntry(toMeta);

    if (!parentMatches) {
      // Stop rather than walking through a history chain whose parentage is not
      // supported by the source metadata. The view mirrors the observed entry;
      // no selected video callback is invoked from an ambiguous handoff.
      pendingTraversal = null;
      remember(toMeta);
      dispatchTransition({
        type: 'traversal-aborted',
        decision: pending.kind === 'handoff' ? 'handoff-aborted' : 'player-close-aborted',
        reason: `${pending.reason}: destination did not match parentEntryId`,
        fromMeta: pending.fromMeta,
        toMeta,
        degraded: true,
      });
      return true;
    }

    if (isBase) {
      if (pending.kind === 'handoff') finishHandoff(toMeta, pending);
      else finishPlayerClose(toMeta, pending);
      return true;
    }

    remember(toMeta);
    const started = adapter.back();
    if (started === false) {
      pendingTraversal = null;
      dispatchTransition({
        type: 'traversal-aborted',
        decision: pending.kind === 'handoff' ? 'handoff-aborted' : 'player-close-aborted',
        reason: `${pending.reason}: no further history traversal is available`,
        fromMeta: pending.fromMeta,
        toMeta,
        degraded: true,
      });
    }
    return true;
  }

  function pushMiniplayerSentinel(baseMeta, reason) {
    // Pushing this entry after Back1 both makes Back2 observable inside the SPA
    // and truncates the forward branch containing consumed overlay entries.
    const sentinel = makeMeta('miniplayer-sentinel', {
      parentEntryId: baseMeta.entryId,
      root: baseMeta.root,
      overlayStack: [],
    });
    writeMeta(sentinel, 'push');
    if (reason) {
      dispatchTransition({
        type: 'history-write',
        decision: 'miniplayer-sentinel-pushed',
        reason,
        fromMeta: baseMeta,
        toMeta: sentinel,
      });
    }
  }

  function onPopState(event) {
    if (disposed) return;
    if (event && typeof event === 'object') {
      if (seenEvents.has(event)) return;
      seenEvents.add(event);
    }

    const fromMeta = cloneSerializable(currentMeta ?? readHistoryMeta(adapter.getState()));
    let toMeta = readHistoryMeta(event?.state);
    if (!toMeta) toMeta = normalizeDestination(event?.state);
    else knownEntries.set(toMeta.entryId, cloneSerializable(toMeta));

    const pending = pendingTraversal;
    if (pending && pending.kind === 'single') {
      pendingTraversal = null;
      remember(toMeta);
      const decision = decideHistoryPop(fromMeta, toMeta);
      dispatchTransition({
        type: 'popstate',
        decision,
        reason: pending.reason,
        fromMeta,
        toMeta,
      });
      if (decision === 'player-minimize' && toMeta.entryKind !== 'miniplayer-sentinel') {
        pushMiniplayerSentinel(toMeta, pending.reason);
      }
      return;
    }

    if (pending && ['handoff', 'close-player'].includes(pending.kind)) {
      stepPendingTraversal(fromMeta, toMeta, event?.state);
      return;
    }

    remember(toMeta);
    const decision = decideHistoryPop(fromMeta, toMeta);
    dispatchTransition({
      type: 'popstate',
      decision,
      reason: 'browser-or-system-back-forward',
      fromMeta,
      toMeta,
    });
    if (decision === 'player-minimize' && toMeta.entryKind !== 'miniplayer-sentinel') {
      pushMiniplayerSentinel(toMeta, 'player-minimize');
    }
  }

  function handoffOverlayToWatch(onComplete, reason = 'overlay-video-handoff') {
    if (!ensureInitialized()) return false;
    if (pendingTraversal) return false;
    const fromMeta = currentMeta ?? normalizeDestination(adapter.getState());
    if (!['overlay', 'search-results'].includes(fromMeta.entryKind)) {
      onComplete?.();
      return true;
    }

    pendingTraversal = {
      kind: 'handoff',
      reason,
      fromMeta: cloneSerializable(fromMeta),
      onComplete,
    };

    // Even the first step is asynchronous from the application's perspective:
    // completion waits for the popstate acknowledgement before another step.
    const started = adapter.back();
    if (started === false) {
      pendingTraversal = null;
      dispatchTransition({
        type: 'traversal-aborted',
        decision: 'handoff-aborted',
        reason: `${reason}: no history traversal is available`,
        fromMeta,
        toMeta: fromMeta,
        degraded: true,
      });
      return false;
    }
    return true;
  }

  function closePlayerHistory(onComplete, reason = 'close-player') {
    if (!ensureInitialized() || pendingTraversal) return false;
    const fromMeta = currentMeta ?? normalizeDestination(adapter.getState());
    // A minimized player is represented by the sentinel rather than a player entry.
    // Closing it must traverse to its parent instead of manufacturing a new Watch entry.
    if (!isPlayerEntry(fromMeta) && fromMeta.entryKind !== 'miniplayer-sentinel') {
      onComplete?.();
      return false;
    }
    pendingTraversal = {
      kind: 'close-player',
      reason,
      fromMeta: cloneSerializable(fromMeta),
      onComplete,
    };
    const started = adapter.back();
    if (started === false) {
      pendingTraversal = null;
      dispatchTransition({
        type: 'traversal-aborted',
        decision: 'player-close-aborted',
        reason: `${reason}: no history traversal is available`,
        fromMeta,
        toMeta: fromMeta,
        degraded: true,
      });
      return false;
    }
    return true;
  }

  function replaceNavigationContext(root, overlayStack) {
    if (!ensureInitialized()) return null;
    const current = currentMeta ?? normalizeDestination(adapter.getState());
    const stack = Array.isArray(overlayStack) ? overlayStack : current.overlayStack;
    const nextRoot = root ?? current.root;

    // A root switch may clear a visible overlay. Replace that current entry with
    // a root-shaped entry (same physical entry ID) rather than leaving an
    // overlay/search marker whose serialized stack has already been emptied.
    if (stack.length === 0 && ['overlay', 'search-results'].includes(current.entryKind)) {
      return writeMeta(makeMeta('root', {
        entryId: current.entryId,
        parentEntryId: current.parentEntryId,
        root: nextRoot,
        overlayStack: [],
      }), 'replace');
    }

    return replaceCurrentMeta({ root: nextRoot, overlayStack: stack });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getCurrentMeta() {
    if (!ensureInitialized()) return null;
    const actual = readHistoryMeta(adapter.getState());
    if (actual && (!currentMeta || actual.entryId !== currentMeta.entryId)) remember(actual);
    return cloneSerializable(currentMeta ?? actual);
  }

  function getCurrentState() {
    if (!ensureInitialized()) return null;
    return adapter.getState();
  }

  function isCurrentEntry(kind) {
    const meta = getCurrentMeta();
    return Boolean(meta && meta.entryKind === kind);
  }

  function isCurrentPlayerEntry() {
    return isPlayerEntry(getCurrentMeta());
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (typeof adapter.removePopStateListener === 'function') adapter.removePopStateListener(onPopState);
    listeners.clear();
    pendingTraversal = null;
  }

  return {
    initialize,
    getCurrentMeta,
    getCurrentState,
    isCurrentEntry,
    isCurrentPlayerEntry,
    pushOverlayEntry,
    pushSearchResultsEntry,
    replaceSearchQuery,
    pushPlayerEntry,
    requestBack,
    handoffOverlayToWatch,
    closePlayerHistory,
    replaceNavigationContext,
    subscribe,
    dispose,
    _getPendingTraversal: () => pendingTraversal ? { kind: pendingTraversal.kind, reason: pendingTraversal.reason } : null,
    _getKnownEntries: () => new Map(knownEntries),
  };
}

export const navigationHistory = createHistoryCoordinator(browserAdapter());

export const initializeNavigationHistory = (root = 'home') => navigationHistory.initialize(root);
export const getCurrentHistoryMeta = () => navigationHistory.getCurrentMeta();
export const getCurrentHistoryState = () => navigationHistory.getCurrentState();
export const isCurrentHistoryEntry = (kind) => navigationHistory.isCurrentEntry(kind);
export const isCurrentPlayerHistoryEntry = () => navigationHistory.isCurrentPlayerEntry();
export const pushOverlayHistoryEntry = (stack, overlay) => navigationHistory.pushOverlayEntry(stack, overlay);
export const pushSearchResultsHistoryEntry = (query, stack) => navigationHistory.pushSearchResultsEntry(query, stack);
export const replaceSearchHistoryQuery = (query) => navigationHistory.replaceSearchQuery(query);
export const pushPlayerHistoryEntry = (level, options) => navigationHistory.pushPlayerEntry(level, options);
export const requestHistoryBack = (reason) => navigationHistory.requestBack(reason);
export const handoffOverlayToWatch = (onComplete, reason) => navigationHistory.handoffOverlayToWatch(onComplete, reason);
export const closePlayerHistory = (onComplete, reason) => navigationHistory.closePlayerHistory(onComplete, reason);
export const replaceNavigationHistoryContext = (root, stack) => navigationHistory.replaceNavigationContext(root, stack);
export const subscribeHistoryTransitions = (listener) => navigationHistory.subscribe(listener);
