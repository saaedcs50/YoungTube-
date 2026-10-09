import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_STATE_KEY,
  createHistoryCoordinator,
  decideHistoryPop,
  isValidHistoryMeta,
  mergeHistoryState,
  readHistoryMeta,
} from '../src/shell/historyCoordinator.js';
import { getSearchRestorationState } from '../src/features/search/searchHistoryState.js';

class FakeHistory {
  constructor(initialState = { unrelated: { retained: true } }) {
    this.entries = [{ state: initialState }];
    this.index = 0;
    this.listener = null;
    this.backRequests = 0;
    this.queue = [];
    this.lastEvent = null;
  }
  getState() { return this.entries[this.index]?.state ?? null; }
  pushState(state) {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ state });
    this.index += 1;
  }
  replaceState(state) { this.entries[this.index] = { state }; }
  back() {
    this.backRequests += 1;
    if (this.index <= 0) return false;
    this.queue.push(() => {
      this.index -= 1;
      const event = { state: this.getState() };
      this.lastEvent = event;
      this.listener?.(event);
    });
    return true;
  }
  addPopStateListener(listener) { this.listener = listener; }
  removePopStateListener(listener) { if (this.listener === listener) this.listener = null; }
  flushOne() {
    const next = this.queue.shift();
    if (!next) return false;
    next();
    return true;
  }
}

function makeCoordinator() {
  const adapter = new FakeHistory();
  const coordinator = createHistoryCoordinator(adapter, {
    idFactory: (() => { let id = 0; return () => `test-${++id}`; })(),
  });
  coordinator.initialize('home');
  return { adapter, coordinator };
}

test('history state is namespaced and retains unrelated host fields', () => {
  const { coordinator, adapter } = makeCoordinator();
  const initial = adapter.getState();
  assert.equal(initial.unrelated.retained, true);
  assert.ok(isValidHistoryMeta(initial[HISTORY_STATE_KEY]));

  const next = mergeHistoryState({ foreign: 42, queryParam: 'stay', ytPlayer: true }, initial[HISTORY_STATE_KEY]);
  assert.equal(next.foreign, 42);
  assert.equal(next.queryParam, 'stay');
  assert.equal(next.ytPlayer, undefined);
  assert.equal(readHistoryMeta(next).entryId, initial[HISTORY_STATE_KEY].entryId);
  coordinator.dispose();
});

test('overlay and search-result entries record the actual parent and query metadata', () => {
  const { coordinator, adapter } = makeCoordinator();
  const root = coordinator.getCurrentMeta();
  const pushed = coordinator.pushOverlayEntry([{ type: 'search' }], { type: 'search' });
  assert.equal(pushed.meta.parentEntryId, root.entryId);
  assert.deepEqual(pushed.overlayStack, [{ type: 'search', fromPlayer: false }]);
  assert.equal(pushed.meta.searchStage, 'landing');

  const results = coordinator.pushSearchResultsEntry('Arabic science', pushed.overlayStack);
  assert.equal(results.parentEntryId, pushed.meta.entryId);
  assert.equal(results.searchStage, 'results');
  assert.equal(results.query, 'Arabic science');
  assert.deepEqual(results.overlayStack, pushed.overlayStack);
  assert.equal(adapter.getState().query, 'Arabic science');
  coordinator.dispose();
});

test('overlay-to-Watch handoff waits for each popstate acknowledgement and truncates stale forward overlays', () => {
  const { coordinator, adapter } = makeCoordinator();
  const root = coordinator.getCurrentMeta();
  const overlay = coordinator.pushOverlayEntry([{ type: 'channel', channelId: 'c1' }], { type: 'channel', channelId: 'c1' }).meta;
  coordinator.pushOverlayEntry([{ type: 'channel', channelId: 'c1' }, { type: 'playlist', playlistId: 'p1' }], { type: 'playlist', playlistId: 'p1' });
  let selected = false;

  assert.equal(coordinator.handoffOverlayToWatch(() => { selected = true; }, 'test-handoff'), true);
  assert.equal(selected, false, 'must not select before the first back acknowledgement');
  assert.equal(coordinator.handoffOverlayToWatch(() => {}, 'duplicate'), false, 'pending traversal blocks duplicate handoffs');

  assert.equal(adapter.flushOne(), true);
  assert.equal(selected, false, 'nested overlays must be consumed one event at a time');
  assert.equal(adapter.queue.length, 1);
  assert.equal(adapter.flushOne(), true);
  assert.equal(selected, true, 'the next acknowledged ancestor is the root base');
  const afterHandoff = coordinator.getCurrentMeta();
  assert.equal(afterHandoff.entryId, root.entryId);
  assert.equal(afterHandoff.entryKind, 'root');
  assert.deepEqual(afterHandoff.overlayStack, []);

  coordinator.pushPlayerEntry(1);
  assert.equal(adapter.index, adapter.entries.length - 1);
  assert.equal(adapter.entries.length, 2, 'new Watch push truncates the old overlay forward branch');
  coordinator.dispose();
});

test('handoff from an overlay above Watch converts Watch into a non-player anchor before opening new Watch', () => {
  const { coordinator, adapter } = makeCoordinator();
  const root = coordinator.getCurrentMeta();
  const player = coordinator.pushPlayerEntry(1);
  coordinator.pushOverlayEntry([{ type: 'channel', channelId: 'c1' }], { type: 'channel', channelId: 'c1' });
  let selected = false;
  coordinator.handoffOverlayToWatch(() => {
    selected = true;
    const current = coordinator.getCurrentMeta();
    assert.equal(current.entryKind, 'anchor');
    assert.equal(current.entryId, player.entryId);
    const replacementPlayer = coordinator.pushPlayerEntry(1);
    assert.equal(replacementPlayer.parentEntryId, current.entryId);
  }, 'watch-ancestor-handoff');

  adapter.flushOne();
  assert.equal(selected, true);
  assert.equal(coordinator.getCurrentMeta().entryKind, 'player');
  assert.equal(adapter.index, adapter.entries.length - 1);
  assert.equal(adapter.entries.length, 3, 'consumed overlay was dropped from the forward branch');
  assert.equal(root.entryKind, 'root');
  coordinator.dispose();
});

test('Back from Watch minimizes once and the miniplayer sentinel closes playback on the next Back', () => {
  const { coordinator, adapter } = makeCoordinator();
  const transitions = [];
  coordinator.subscribe((transition) => transitions.push(transition));
  coordinator.pushPlayerEntry(1);

  assert.equal(coordinator.requestBack('hardware-back'), true);
  assert.equal(coordinator.requestBack('double-tap'), false);
  adapter.flushOne();
  assert.equal(coordinator.getCurrentMeta().entryKind, 'miniplayer-sentinel');
  assert.equal(transitions.filter((event) => event.decision === 'player-minimize').length, 1);

  assert.equal(coordinator.requestBack('hardware-back-again'), true);
  adapter.flushOne();
  assert.equal(coordinator.getCurrentMeta().entryKind, 'root');
  assert.equal(transitions.filter((event) => event.decision === 'player-close').length, 1);
  coordinator.dispose();
});

test('history pop decisions preserve fullscreen and settings one layer at a time', () => {
  const { coordinator } = makeCoordinator();
  const player = coordinator.pushPlayerEntry(1);
  const fullscreen = coordinator.pushPlayerEntry(2);
  const sheet = coordinator.pushPlayerEntry(3);
  assert.equal(decideHistoryPop(sheet, fullscreen), 'player-settings-close');
  assert.equal(decideHistoryPop(fullscreen, player), 'player-fullscreen-exit');
  assert.equal(decideHistoryPop(player, { ...player, entryKind: 'root', playerLevel: undefined }), 'player-minimize');
  coordinator.dispose();
});


test('Back from an overlay opened above Watch returns to the exact prior Watch entry without minimizing it', () => {
  const { coordinator, adapter } = makeCoordinator();
  const player = coordinator.pushPlayerEntry(1);
  coordinator.pushOverlayEntry([{ type: 'search', fromPlayer: true }], { type: 'search' });
  const transitions = [];
  coordinator.subscribe((transition) => transitions.push(transition));

  assert.equal(coordinator.requestBack('dismiss-overlay'), true);
  adapter.flushOne();
  assert.equal(coordinator.getCurrentMeta().entryId, player.entryId);
  assert.equal(coordinator.getCurrentMeta().entryKind, 'player');
  assert.equal(transitions.at(-1).decision, 'navigation');
  assert.equal(adapter.entries.length, 3, 'dismissal does not manufacture a replacement Watch entry');
  coordinator.dispose();
});

test('malformed destination state is normalized without deleting unrelated state', () => {
  const { coordinator, adapter } = makeCoordinator();
  const rootBefore = coordinator.getCurrentMeta();
  coordinator.pushOverlayEntry([{ type: 'channel', channelId: 'x' }], { type: 'channel', channelId: 'x' });
  adapter.entries[0].state = { foreign: 'retain-me', ytNavigation: true, youngtubeHistory: { schemaVersion: 999 } };
  let transition = null;
  coordinator.subscribe((value) => { transition = value; });

  assert.equal(coordinator.requestBack('malformed-target'), true);
  adapter.flushOne();
  const normalizedState = adapter.getState();
  const normalizedMeta = readHistoryMeta(normalizedState);
  assert.ok(normalizedMeta);
  assert.equal(normalizedMeta.entryKind, 'root');
  assert.notEqual(normalizedMeta.entryId, rootBefore.entryId, 'malformed identity is replaced with a fresh known root identity');
  assert.equal(normalizedState.foreign, 'retain-me');
  assert.equal(normalizedState.ytNavigation, undefined);
  assert.equal(transition.toMeta.entryId, normalizedMeta.entryId);
  coordinator.dispose();
});

test('duplicate delivery of the same popstate event object is applied exactly once', () => {
  const { coordinator, adapter } = makeCoordinator();
  coordinator.pushPlayerEntry(1);
  const transitions = [];
  coordinator.subscribe((transition) => transitions.push(transition));

  coordinator.requestBack('duplicate-event-test');
  adapter.flushOne();
  const originalTransitionCount = transitions.length;
  const currentEntryId = coordinator.getCurrentMeta().entryId;
  adapter.listener(adapter.lastEvent);
  assert.equal(transitions.length, originalTransitionCount);
  assert.equal(coordinator.getCurrentMeta().entryId, currentEntryId);
  coordinator.dispose();
});

test('closing player with settings and fullscreen traverses one acknowledged parent at a time', () => {
  const { coordinator, adapter } = makeCoordinator();
  coordinator.pushPlayerEntry(1);
  coordinator.pushPlayerEntry(2);
  coordinator.pushPlayerEntry(3);
  let closed = false;

  assert.equal(coordinator.closePlayerHistory(() => { closed = true; }, 'close-deep-player'), true);
  assert.equal(closed, false);
  adapter.flushOne();
  assert.equal(closed, false);
  assert.equal(adapter.queue.length, 1);
  adapter.flushOne();
  assert.equal(closed, false);
  assert.equal(adapter.queue.length, 1);
  adapter.flushOne();
  assert.equal(closed, true);
  assert.equal(coordinator.getCurrentMeta().entryKind, 'root');
  assert.equal(adapter.queue.length, 0);
  coordinator.dispose();
});



test('closing the mini-player sentinel traverses to its parent without inserting a Watch entry', () => {
  const { coordinator, adapter } = makeCoordinator();
  const root = coordinator.getCurrentMeta();
  coordinator.pushPlayerEntry(1);
  assert.equal(coordinator.requestBack('mini-close-test-minimize'), true);
  adapter.flushOne();
  const sentinel = coordinator.getCurrentMeta();
  assert.equal(sentinel.entryKind, 'miniplayer-sentinel');
  assert.equal(sentinel.parentEntryId, root.entryId);

  const transitions = [];
  coordinator.subscribe((transition) => transitions.push(transition));
  assert.equal(coordinator.closePlayerHistory(undefined, 'mini-close-test'), true);
  assert.equal(adapter.queue.length, 1);
  adapter.flushOne();

  assert.equal(coordinator.getCurrentMeta().entryId, root.entryId);
  assert.equal(coordinator.getCurrentMeta().entryKind, 'root');
  assert.equal(adapter.index, 0, 'close returns to the sentinel parent');
  assert.equal(transitions.filter((transition) => transition.decision === 'player-close-complete').length, 1);
  assert.equal(adapter.entries.length, 2, 'closing does not insert another Watch entry');
  coordinator.dispose();
});

test('Search query edits replace the current results entry without changing entry identity or parent', () => {
  const { coordinator, adapter } = makeCoordinator();
  const search = coordinator.pushOverlayEntry([{ type: 'search' }], { type: 'search' });
  const resultA = coordinator.pushSearchResultsEntry('query A', search.overlayStack);
  const resultB = coordinator.replaceSearchQuery('query B');
  assert.equal(resultB.entryId, resultA.entryId);
  assert.equal(resultB.parentEntryId, search.meta.entryId);
  assert.equal(resultB.searchStage, 'results');
  assert.equal(resultB.query, 'query B');
  assert.equal(adapter.getState().query, 'query B');
  assert.equal(adapter.entries.length, 3, 'editing the query does not add another History entry');
  coordinator.dispose();
});


test('Search restores query state only from the exact Search Results entry', () => {
  assert.deepEqual(getSearchRestorationState({
    entryKind: 'search-results',
    searchStage: 'results',
    query: ' Arabic Science ',
  }), {
    searchStage: 'results',
    searchInput: ' Arabic Science ',
    debouncedSearch: 'arabic science',
  });

  assert.deepEqual(getSearchRestorationState({
    entryKind: 'overlay',
    searchStage: 'results',
    query: 'stale query',
  }), {
    searchStage: 'landing',
    searchInput: '',
    debouncedSearch: '',
  });

  assert.deepEqual(getSearchRestorationState({
    entryKind: 'overlay',
    searchStage: 'landing',
    query: 'stale query',
  }), {
    searchStage: 'landing',
    searchInput: '',
    debouncedSearch: '',
  });
});
