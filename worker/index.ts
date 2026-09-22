import { corsHeaders, checkPublicRateLimit, RATE_LIMITED_ROUTES } from './lib/cors';
import { runScheduledMaintenance, refreshChannelsBatch } from './lib/helpers';
import { LAST_CRON_TASK } from './lib/kv-keys';
import { Env } from './lib/types';
import { handleAdminBatchRoutes } from './routes/admin-batch';
import { handleAdminChannelsRoutes } from './routes/admin-channels';
import { handleAdminContentRoutes } from './routes/admin-content';
import { handleAdminTelemetryRoutes } from './routes/admin-telemetry';
import { handlePublicReadRoutes } from './routes/public-read';

export { TelemetryAggregator } from './telemetry_do';
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
    if (request.method === 'GET' && RATE_LIMITED_ROUTES.has(url.pathname)) {
      const allowed = await checkPublicRateLimit(request, env);
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: 'Too many requests. Please slow down.' }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Retry-After': '60',
            },
          }
        );
      }
    }

    // Delegate to route handlers in sequence
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
   * - Executes at most ONE batch per run: either live RSS refresh (40 channels) OR
   *   server-scheduled archive maintenance batch (2 channels, max 40 subrequests) under maintenance_lock.
   * - Branches based on cron pattern (e.g. minute :30 for maintenance vs minute :00 for refresh)
   *   or alternates via KV (_last_cron_task) when triggered on a single schedule.
   * - Sweeps pending DO telemetry aggregates.
   */
  async scheduled(controller: any, env: Env): Promise<void> {
    const cronTrigger = controller && typeof controller.cron === 'string' ? controller.cron : '';
    let taskToRun: 'refresh' | 'maintenance' = 'refresh';

    if (cronTrigger.includes('30')) {
      taskToRun = 'maintenance';
    } else if (cronTrigger.includes('0')) {
      taskToRun = 'refresh';
    } else if (env.CHANNELS_ARCHIVE) {
      try {
        const lastTask = await env.CHANNELS_ARCHIVE.get(LAST_CRON_TASK);
        taskToRun = lastTask === 'refresh' ? 'maintenance' : 'refresh';
        await env.CHANNELS_ARCHIVE.put(LAST_CRON_TASK, taskToRun);
      } catch {
        taskToRun = 'maintenance';
      }
    }

    if (taskToRun === 'maintenance') {
      try {
        await runScheduledMaintenance(env);
      } catch (err) {
        console.error('Scheduled cron maintenance error:', err);
      }
    } else {
      try {
        await refreshChannelsBatch(env);
      } catch (err) {
        console.error('Scheduled cron refresh error:', err);
      }
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
