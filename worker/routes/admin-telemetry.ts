import { corsHeaders, checkAdminAuth } from '../lib/cors';
import { recordTelemetryEvent, recordFunnelEvent, getTodayDateUtc } from '../lib/helpers';
import { TELEMETRY_INDEX, telemetryDailyKey, telemetryUniquesKey } from '../lib/kv-keys';
import { Env, ACCEPTED_FUNNEL_EVENTS, TelemetryDaily } from '../lib/types';

export async function handleAdminTelemetryRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  // 1. Telemetry Event Ingestion:
  // - POST /api/telemetry/parent-session-start
  // - POST /api/telemetry/parent-session-end
  // - POST /api/telemetry/child-session-end
  if (
    request.method === 'POST' &&
    (url.pathname === '/api/telemetry/parent-session-start' ||
      url.pathname === '/api/telemetry/parent-session-end' ||
      url.pathname === '/api/telemetry/child-session-end')
  ) {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const country =
      request.headers.get('CF-IPCountry') ||
      request.headers.get('cf-ipcountry') ||
      'XX';

    const installId = body.installId ? String(body.installId).trim() : undefined;
    const durationSec = Number(body.durationSec) || 0;
    const sessionId = body.sessionId ? String(body.sessionId).trim() : undefined;

    try {
      if (env.TELEMETRY_DO) {
        const id = env.TELEMETRY_DO.idFromName('telemetry-v1');
        const stub = env.TELEMETRY_DO.get(id);

        let doPath = '/parent_start';
        if (url.pathname === '/api/telemetry/parent-session-end') {
          doPath = '/parent_end';
        } else if (url.pathname === '/api/telemetry/child-session-end') {
          doPath = '/child_end';
        }

        await stub.fetch(`https://do${doPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country, installId, durationSec, sessionId }),
        });
      } else {
        if (url.pathname === '/api/telemetry/parent-session-start') {
          await recordTelemetryEvent(env, 'parent_start', country, installId, 0);
        } else if (url.pathname === '/api/telemetry/parent-session-end') {
          await recordTelemetryEvent(env, 'parent_end', country, installId, durationSec);
        } else if (url.pathname === '/api/telemetry/child-session-end') {
          await recordTelemetryEvent(env, 'child_end', country, installId, durationSec);
        }
      }
    } catch (err) {
      console.error('Telemetry record error:', err);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 2. Funnel Event Ingestion: POST /api/telemetry/funnel-event
  if (request.method === 'POST' && url.pathname === '/api/telemetry/funnel-event') {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const event = typeof body?.event === 'string' ? body.event.trim() : '';
    if (!ACCEPTED_FUNNEL_EVENTS.includes(event as any)) {
      return new Response(
        JSON.stringify({
          error: 'Unknown or invalid funnel event',
          acceptedEvents: ACCEPTED_FUNNEL_EVENTS,
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const country =
      request.headers.get('CF-IPCountry') ||
      request.headers.get('cf-ipcountry') ||
      'XX';

    const installId =
      body.installId && typeof body.installId === 'string' && body.installId.trim()
        ? body.installId.trim()
        : undefined;

    try {
      await recordFunnelEvent(env, event as any, country, installId);
    } catch (err) {
      console.error('Funnel event record error:', err);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 3. GET /api/admin/telemetry (Protected with Bearer ADMIN_KEY)
  if (url.pathname === '/api/admin/telemetry' && request.method === 'GET') {
    if (!checkAdminAuth(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const daysParam = parseInt(url.searchParams.get('days') || '30', 10);
    const maxDays = Math.min(Math.max(isNaN(daysParam) ? 30 : daysParam, 1), 90);

    if (env.TELEMETRY_DO) {
      try {
        const id = env.TELEMETRY_DO.idFromName('telemetry-v1');
        const stub = env.TELEMETRY_DO.get(id);
        const doRes = await stub.fetch(`https://do/summary?days=${maxDays}`);
        if (doRes.ok) {
          const summaryData = await doRes.json();
          return new Response(JSON.stringify(summaryData), {
            status: 200,
            headers: corsHeaders,
          });
        }
      } catch (err) {
        console.error('Telemetry DO summary error, attempting KV fallback:', err);
      }
    }

    if (!env.CHANNELS_ARCHIVE) {
      return new Response(
        JSON.stringify({
          days: [],
          parentSessionsByCountry: {},
          parentDurationSecByCountry: {},
          childSessionsByCountry: {},
          childDurationSecByCountry: {},
          uniqueByCountry: {},
          parentSessionsTotal: 0,
          parentDurationSecTotal: 0,
          childSessionsTotal: 0,
          childDurationSecTotal: 0,
          totalUniqueInstalls: 0,
          generatedAt: Date.now(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    let indexDates: string[] = [];
    try {
      const rawIndex = await env.CHANNELS_ARCHIVE.get(TELEMETRY_INDEX);
      if (rawIndex) {
        indexDates = JSON.parse(rawIndex);
      }
    } catch {}

    const todayStr = getTodayDateUtc();
    if (!indexDates.includes(todayStr)) {
      indexDates.unshift(todayStr);
    }

    const targetDates = Array.from(new Set(indexDates))
      .sort()
      .reverse()
      .slice(0, maxDays);

    const daysData: TelemetryDaily[] = [];
    const allUniqueByCountryMap: Record<string, Set<string>> = {};
    const totalUniqueSet = new Set<string>();

    await Promise.all(
      targetDates.map(async (d) => {
        try {
          const [dailyRaw, uniquesRaw] = await Promise.all([
            env.CHANNELS_ARCHIVE!.get(telemetryDailyKey(d)),
            env.CHANNELS_ARCHIVE!.get(telemetryUniquesKey(d)),
          ]);

          if (dailyRaw) {
            const parsedDaily: TelemetryDaily = JSON.parse(dailyRaw);
            daysData.push(parsedDaily);
          }

          if (uniquesRaw) {
            const parsedUniques: Record<string, string[]> = JSON.parse(uniquesRaw);
            for (const [c, ids] of Object.entries(parsedUniques)) {
              if (!allUniqueByCountryMap[c]) allUniqueByCountryMap[c] = new Set();
              for (const id of ids) {
                allUniqueByCountryMap[c].add(id);
                totalUniqueSet.add(id);
              }
            }
          }
        } catch {}
      })
    );

    daysData.sort((a, b) => b.date.localeCompare(a.date));

    const parentSessionsByCountry: Record<string, number> = {};
    const parentDurationSecByCountry: Record<string, number> = {};
    const childSessionsByCountry: Record<string, number> = {};
    const childDurationSecByCountry: Record<string, number> = {};
    let parentSessionsTotal = 0;
    let parentDurationSecTotal = 0;
    let childSessionsTotal = 0;
    let childDurationSecTotal = 0;

    for (const day of daysData) {
      for (const [c, val] of Object.entries(day.parentSessionsByCountry || {})) {
        parentSessionsByCountry[c] = (parentSessionsByCountry[c] || 0) + val;
        parentSessionsTotal += val;
      }
      for (const [c, val] of Object.entries(day.parentDurationSecByCountry || {})) {
        parentDurationSecByCountry[c] = (parentDurationSecByCountry[c] || 0) + val;
        parentDurationSecTotal += val;
      }
      for (const [c, val] of Object.entries(day.childSessionsByCountry || {})) {
        childSessionsByCountry[c] = (childSessionsByCountry[c] || 0) + val;
        childSessionsTotal += val;
      }
      for (const [c, val] of Object.entries(day.childDurationSecByCountry || {})) {
        childDurationSecByCountry[c] = (childDurationSecByCountry[c] || 0) + val;
        childDurationSecTotal += val;
      }
    }

    const uniqueByCountry: Record<string, number> = {};
    for (const [c, setIds] of Object.entries(allUniqueByCountryMap)) {
      uniqueByCountry[c] = setIds.size;
    }

    return new Response(
      JSON.stringify({
        days: daysData,
        parentSessionsByCountry,
        parentDurationSecByCountry,
        childSessionsByCountry,
        childDurationSecByCountry,
        uniqueByCountry,
        parentSessionsTotal,
        parentDurationSecTotal,
        childSessionsTotal,
        childDurationSecTotal,
        totalUniqueInstalls: totalUniqueSet.size,
        generatedAt: Date.now(),
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  return null;
}
