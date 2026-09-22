/**
 * worker/lib/batch-runner.ts
 *
 * Shared mechanical runner shell for KV cursor-based batch operations.
 * Encapsulates cursor loading/saving, maintenance lock checking/acquisition/release,
 * bounded batch iteration, and structured result formatting.
 *
 * Tool Safety & Subrequest Budget Summary:
 * - backfill-all-batch:
 *     cursorKey: BACKFILL_ALL_CURSOR (_backfill_all_cursor)
 *     default batch size: 2 channels
 *     worst-case touched: 2 channels (~80 API subrequests max, rate limit handled)
 *     Cloudflare budget: 2 channels per batch stays strictly bounded.
 * - cleanup-dead-videos-batch:
 *     cursorKey: CLEANUP_DEAD_VIDEOS_CURSOR (_cleanup_dead_videos_cursor)
 *     default batch size: 15 channels / max 2000 videos
 *     worst-case touched: 15 channels, chunked by 50 videos per YouTube API call (~40 subrequests max)
 *     Cloudflare budget: 50 videos/chunk stays within Cloudflare 50 subrequests limit.
 * - scan-cleanup-batch:
 *     cursorKey: SCAN_CLEANUP_CURSOR (_scan_cleanup_cursor)
 *     default batch size: 1 channel / max 35 portrait thumbnail checks
 *     worst-case touched: 1 channel, duration API in 50s + max 35 image dimension fetches
 *     Cloudflare budget: 35 portrait checks cap total subrequests < 50.
 */

import {
  checkMaintenanceLock,
  acquireMaintenanceLock,
  releaseMaintenanceLock,
} from './helpers';
import { Env } from './types';

export interface BatchLockConflict {
  isLocked: true;
  lock: any;
}

export interface BatchRunnerOptions<TWorkItem, TProcessed, TFailed> {
  env: Env;
  cursorKey: string;
  lockBy: string;
  reset?: boolean;
  dryRun?: boolean;
  lockDurationMinutes?: number;
  manageLock?: boolean; // Default: true (checks lock, acquires lock, and releases in finally)
  totalItems: number;
  batchSize?: number;

  /**
   * Optional loader for work items based on cursorBefore and batchSize.
   * If not provided, items will be sliced from itemsArray starting at cursorBefore.
   */
  loadWorkItems?: (
    cursorBefore: number,
    batchSize: number
  ) =>
    | Promise<{ items: TWorkItem[]; advanceCount: number }>
    | { items: TWorkItem[]; advanceCount: number };

  /**
   * Optional item array (e.g. channelsSeed) if loadWorkItems is omitted.
   */
  itemsArray?: TWorkItem[];

  /**
   * Domain logic to process work items.
   */
  processWork: (
    items: TWorkItem[],
    cursorBefore: number,
    context: { dryRun: boolean }
  ) => Promise<{
    processed: TProcessed[];
    failed: TFailed[];
    advanceCountOverride?: number;
    deleteOffsetKey?: string;
    saveOffsetKey?: { key: string; offset: number };
    extraFields?: Record<string, any>;
  }>;
}

export interface BatchRunnerSuccessResult<TProcessed, TFailed> {
  isLocked?: false;
  processed: TProcessed[];
  failed: TFailed[];
  cursorBefore: number;
  cursorAfter: number;
  totalChannels: number;
  wrappedAround: boolean;
  [key: string]: any;
}

export type BatchRunnerResult<TProcessed, TFailed> =
  | BatchLockConflict
  | BatchRunnerSuccessResult<TProcessed, TFailed>;

/**
 * Runs a KV cursor-based batch job with automatic lock management,
 * cursor management, and structured error/result formatting.
 */
export async function runKvCursorBatch<TWorkItem, TProcessed, TFailed>(
  options: BatchRunnerOptions<TWorkItem, TProcessed, TFailed>
): Promise<BatchRunnerResult<TProcessed, TFailed>> {
  const {
    env,
    cursorKey,
    lockBy,
    reset = false,
    dryRun = false,
    lockDurationMinutes = 10,
    manageLock = true,
    totalItems,
    batchSize = 1,
    loadWorkItems,
    itemsArray,
    processWork,
  } = options;

  if (!env.CHANNELS_ARCHIVE) {
    throw new Error('CHANNELS_ARCHIVE KV is not bound');
  }

  // 1. Manage Maintenance Lock
  if (manageLock) {
    const activeLock = await checkMaintenanceLock(env);
    if (activeLock) {
      return { isLocked: true, lock: activeLock };
    }
    const acquired = await acquireMaintenanceLock(env, lockBy, lockDurationMinutes);
    if (!acquired) {
      const lock = await checkMaintenanceLock(env);
      return { isLocked: true, lock };
    }
  }

  try {
    // 2. Read Cursor from KV
    let cursor = 0;
    if (!reset) {
      try {
        const rawCursor = await env.CHANNELS_ARCHIVE.get(cursorKey);
        if (rawCursor) {
          const parsed = parseInt(rawCursor, 10);
          if (!isNaN(parsed) && parsed >= 0 && totalItems > 0) {
            cursor = parsed % totalItems;
          }
        }
      } catch {
        cursor = 0;
      }
    }
    const cursorBefore = cursor;

    // 3. Load Work Items
    let items: TWorkItem[] = [];
    let defaultAdvanceCount = batchSize;

    if (loadWorkItems) {
      const loaded = await loadWorkItems(cursorBefore, batchSize);
      items = loaded.items;
      defaultAdvanceCount = loaded.advanceCount;
    } else if (itemsArray && itemsArray.length > 0) {
      items = [];
      for (let i = 0; i < batchSize; i++) {
        const idx = (cursorBefore + i) % totalItems;
        items.push(itemsArray[idx]);
      }
      defaultAdvanceCount = batchSize;
    }

    // 4. Process Work Items
    const processRes = await processWork(items, cursorBefore, { dryRun });

    // 5. Compute Cursor After and Handle Offsets (skip KV writes if dryRun)
    const advanceCount =
      processRes.advanceCountOverride !== undefined
        ? processRes.advanceCountOverride
        : defaultAdvanceCount;

    let cursorAfter = cursorBefore;
    if (advanceCount > 0) {
      cursorAfter = totalItems > 0 ? (cursorBefore + advanceCount) % totalItems : 0;
      if (!dryRun) {
        await env.CHANNELS_ARCHIVE.put(cursorKey, cursorAfter.toString());
      }
    }

    if (!dryRun) {
      if (processRes.deleteOffsetKey) {
        try {
          await env.CHANNELS_ARCHIVE.delete(processRes.deleteOffsetKey);
        } catch {}
      } else if (processRes.saveOffsetKey) {
        try {
          await env.CHANNELS_ARCHIVE.put(
            processRes.saveOffsetKey.key,
            processRes.saveOffsetKey.offset.toString()
          );
        } catch {}
      }
    }

    const wrappedAround =
      advanceCount > 0 &&
      (cursorAfter < cursorBefore || cursorBefore + advanceCount >= totalItems);

    // 6. Return Structured Result
    return {
      isLocked: false,
      processed: processRes.processed,
      failed: processRes.failed,
      cursorBefore,
      cursorAfter,
      totalChannels: totalItems,
      wrappedAround,
      ...(processRes.extraFields || {}),
    };
  } finally {
    if (manageLock) {
      await releaseMaintenanceLock(env);
    }
  }
}
