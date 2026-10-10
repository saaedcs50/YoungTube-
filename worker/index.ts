import {
  corsHeaders,
  checkPublicRateLimit,
  RATE_LIMITED_ROUTES,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_SECONDS,
} from './lib/cors';
import { refreshChannelsBatch } from './lib/helpers';
import { Env } from './lib/types';
import { handleAdminBatchRoutes } from './routes/admin-batch';
import { handleAdminChannelsRoutes } from './routes/admin-channels';
import { handleAdminContentRoutes } from './routes/admin-content';
import { handleAdminTelemetryRoutes } from './routes/admin-telemetry';
import { handlePublicReadRoutes } from './routes/public-read';
import { handleParentInboxRoutes } from './routes/parent-inbox';

export { TelemetryAggregator } from './telemetry_do';
export { ParentInboxStore } from './parent_inbox_do';
export type { Env } from './lib/types';

export default {
  /**
   * Main HTTP entrypoint for the Worker
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle OPTIONS CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Apply Rate Limiting to specific public GET endpoints
    const isTelemetryPost =
      request.method === 'POST' &&
      (url.pathname === '/api/telemetry/parent-session-start' ||
        url.pathname === '/api/telemetry/parent-session-end' ||
        url.pathname === '/api/telemetry/child-session-end' ||
        url.pathname === '/api/telemetry/funnel-event');

    if (request.method === 'GET' && RATE_LIMITED_ROUTES.has(url.pathname)) {
      const allowed = await checkPublicRateLimit(request, env, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS, 'public');
      if (!allowed) {
        const isParentInboxRead = url.pathname === '/api/parent-inbox';
        return new Response(
          JSON.stringify(isParentInboxRead
            ? { ok: false, error: 'rate_limited' }
            : { error: 'Too many requests. Please slow down.' }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              ...(isParentInboxRead ? { 'Cache-Control': 'no-store' } : {}),
              'Retry-After': '60',
            },
          }
        );
      }
    }

    const isParentInboxPost = request.method === 'POST' && url.pathname === '/api/parent-inbox';
    if (isParentInboxPost) {
      const allowed = await checkPublicRateLimit(request, env, 20, 60, 'parent-inbox');
      if (!allowed) {
        return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
          status: 429, headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'Retry-After': '60' },
        });
      }
    }

    if (isTelemetryPost) {
      const allowed = await checkPublicRateLimit(request, env, 30, 60, 'telemetry');
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: 'Too many telemetry requests. Please slow down.' }),
          { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }
        );
      }
    }

    // Delegate to route handlers in sequence
    const parentInboxRes = await handleParentInboxRoutes(request, env, url);
    if (parentInboxRes) return parentInboxRes;

    const publicRes = await handlePublicReadRoutes(request, env, url);
    if (publicRes) return publicRes;

    const channelsRes = await handleAdminChannelsRoutes(request, env, url);
    if (channelsRes) return channelsRes;

    const batchRes = await handleAdminBatchRoutes(request, env, url);
    if (batchRes) return batchRes;

    const contentRes = await handleAdminContentRoutes(request, env, url);
    if (contentRes) return contentRes;

    const telemetryRes = await handleAdminTelemetryRoutes(request, env, url);
    if (telemetryRes) return telemetryRes;

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },

  /**
   * Cron Trigger handler:
   * - Respects Cloudflare Workers free plan limit (at most 50 subrequests per invocation).
   * - Refreshes live RSS feeds for channels batch.
   * - Sweeps pending DO telemetry aggregates.
   */
  async scheduled(controller: any, env: Env): Promise<void> {
    try {
      await refreshChannelsBatch(env);
    } catch (err) {
      console.error('Scheduled cron refresh error:', err);
    }

    if (env.TELEMETRY_DO) {
      try {
        const id = env.TELEMETRY_DO.idFromName('telemetry-v1');
        const stub = env.TELEMETRY_DO.get(id);
        await stub.fetch('https://do/sweep_pending', { method: 'POST' });
      } catch (err) {
        console.error('Telemetry sweep failed:', err);
      }
    }
  },
};
