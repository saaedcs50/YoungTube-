export type HistoryEntryKind =
  | 'root'
  | 'anchor'
  | 'overlay'
  | 'search-results'
  | 'player'
  | 'player-fullscreen'
  | 'player-settings'
  | 'miniplayer-sentinel';

export interface YoungTubeHistoryMeta {
  schemaVersion: 1;
  entryId: string;
  entryKind: HistoryEntryKind;
  parentEntryId: string | null;
  root: string;
  overlayStack: Array<Record<string, unknown>>;
  fromPlayer?: boolean;
  playerLevel?: 1 | 2 | 3;
  searchStage?: 'landing' | 'results';
  query?: string;
}

export type HistoryDecision =
  | 'navigation'
  | 'player-minimize'
  | 'player-close'
  | 'player-fullscreen-exit'
  | 'player-settings-close'
  | 'handoff-complete'
  | 'handoff-aborted'
  | 'player-close-complete'
  | 'player-close-aborted'
  | 'miniplayer-sentinel-pushed'
  | 'blocked-duplicate-request';

export interface HistoryTransition {
  type: string;
  decision: HistoryDecision | string;
  reason: string;
  fromMeta: YoungTubeHistoryMeta | null;
  toMeta: YoungTubeHistoryMeta | null;
  degraded: boolean;
}

export interface HistoryOverlay {
  type?: string;
  fromPlayer?: boolean;
  [key: string]: unknown;
}

export function isValidHistoryMeta(meta: unknown): meta is YoungTubeHistoryMeta;
export function readHistoryMeta(state: unknown): YoungTubeHistoryMeta | null;
export function createHistoryMeta(fields: Record<string, unknown>, idFactory?: () => string): YoungTubeHistoryMeta;
export function mergeHistoryState(existingState: unknown, meta: YoungTubeHistoryMeta): Record<string, unknown>;
export function decideHistoryPop(fromMeta: YoungTubeHistoryMeta | null, toMeta: YoungTubeHistoryMeta | null): HistoryDecision;
export function createHistoryCoordinator(adapter: any, options?: { idFactory?: () => string }): {
  initialize(root?: string): YoungTubeHistoryMeta | null;
  getCurrentMeta(): YoungTubeHistoryMeta | null;
  getCurrentState(): unknown;
  isCurrentEntry(kind: HistoryEntryKind): boolean;
  isCurrentPlayerEntry(): boolean;
  pushOverlayEntry(stack: HistoryOverlay[], overlay: HistoryOverlay): { meta: YoungTubeHistoryMeta | null; overlayStack: HistoryOverlay[] };
  pushSearchResultsEntry(query: string, stack?: HistoryOverlay[]): YoungTubeHistoryMeta | null;
  replaceSearchQuery(query: string): YoungTubeHistoryMeta | null;
  pushPlayerEntry(level: 1 | 2 | 3, options?: Record<string, unknown>): YoungTubeHistoryMeta | null;
  requestBack(reason?: string): boolean;
  handoffOverlayToWatch(onComplete?: () => void, reason?: string): boolean;
  closePlayerHistory(onComplete?: () => void, reason?: string): boolean;
  replaceNavigationContext(root?: string, stack?: HistoryOverlay[]): YoungTubeHistoryMeta | null;
  subscribe(listener: (transition: HistoryTransition) => void): () => void;
  dispose(): void;
  _getPendingTraversal(): { kind: string; reason: string } | null;
  _getKnownEntries(): Map<string, YoungTubeHistoryMeta>;
};

export const HISTORY_STATE_KEY: string;
export const HISTORY_SCHEMA_VERSION: number;
export const HISTORY_ENTRY_KINDS: readonly HistoryEntryKind[];
export const navigationHistory: ReturnType<typeof createHistoryCoordinator>;
export function initializeNavigationHistory(root?: string): YoungTubeHistoryMeta | null;
export function getCurrentHistoryMeta(): YoungTubeHistoryMeta | null;
export function getCurrentHistoryState(): unknown;
export function isCurrentHistoryEntry(kind: HistoryEntryKind): boolean;
export function isCurrentPlayerHistoryEntry(): boolean;
export function pushOverlayHistoryEntry(stack: HistoryOverlay[], overlay: HistoryOverlay): { meta: YoungTubeHistoryMeta | null; overlayStack: HistoryOverlay[] };
export function pushSearchResultsHistoryEntry(query: string, stack?: HistoryOverlay[]): YoungTubeHistoryMeta | null;
export function replaceSearchHistoryQuery(query: string): YoungTubeHistoryMeta | null;
export function pushPlayerHistoryEntry(level: 1 | 2 | 3, options?: Record<string, unknown>): YoungTubeHistoryMeta | null;
export function requestHistoryBack(reason?: string): boolean;
export function handoffOverlayToWatch(onComplete?: () => void, reason?: string): boolean;
export function closePlayerHistory(onComplete?: () => void, reason?: string): boolean;
export function replaceNavigationHistoryContext(root?: string, stack?: HistoryOverlay[]): YoungTubeHistoryMeta | null;
export function subscribeHistoryTransitions(listener: (transition: HistoryTransition) => void): () => void;
