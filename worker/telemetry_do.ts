/**
 * Durable Object for sequential, atomic aggregation of telemetry events.
 * Prevents race conditions and lost updates under concurrent load.
 */

export interface TelemetryDailyData {
  date: string; // YYYY-MM-DD UTC
  parentSessionsByCountry: Record<string, number>;
  parentDurationSecByCountry: Record<string, number>;
  childSessionsByCountry: Record<string, number>;
  childDurationSecByCountry: Record<string, number>;
  uniqueByCountry: Record<string, number>;
  parentSessionsTotal: number;
  parentDurationSecTotal: number;
  childSessionsTotal: number;
  childDurationSecTotal: number;
  uniqueInstallsTotal: number;
  updatedAt: number;
}

function getTodayDateUtc(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class TelemetryAggregator {
  state: any;
  ctx: any;

  constructor(state: any, _env?: any) {
    this.state = state;
    this.ctx = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'POST') {
      let body: any = {};
      try {
        body = await request.json();
      } catch {}

      const country = (body.country && String(body.country).trim().toUpperCase()) || 'XX';
      const installId = body.installId && typeof body.installId === 'string' ? body.installId.trim() : undefined;
      const durationSec = Number(body.durationSec) || 0;
      const date = getTodayDateUtc();

      if (url.pathname === '/parent_start') {
        await this.handleParentStart(date, country, installId);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/parent_end') {
        await this.handleParentEnd(date, country, installId, durationSec);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.pathname === '/child_end') {
        await this.handleChildEnd(date, country, installId, durationSec);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (method === 'GET' && url.pathname === '/summary') {
      const daysParam = parseInt(url.searchParams.get('days') || '30', 10);
      const maxDays = Math.min(Math.max(isNaN(daysParam) ? 30 : daysParam, 1), 90);
      const summary = await this.getSummary(maxDays);
      return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  private async getStorage(): Promise<any> {
    return this.ctx?.storage || this.state?.storage;
  }

  private async getDayData(date: string): Promise<TelemetryDailyData> {
    const storage = await this.getStorage();
    const stored = await storage.get(`daily:${date}`);
    if (stored) {
      return stored as TelemetryDailyData;
    }
    return {
      date,
      parentSessionsByCountry: {},
      parentDurationSecByCountry: {},
      parentSessionsTotal: 0,
      parentDurationSecTotal: 0,
      childSessionsByCountry: {},
      childDurationSecByCountry: {},
      childSessionsTotal: 0,
      childDurationSecTotal: 0,
      uniqueByCountry: {},
      uniqueInstallsTotal: 0,
      updatedAt: Date.now(),
    };
  }

  private async saveDayData(date: string, data: TelemetryDailyData): Promise<void> {
    const storage = await this.getStorage();
    data.updatedAt = Date.now();
    await storage.put(`daily:${date}`, data);
    await this.recordDateIndex(date);
  }

  private async recordDateIndex(date: string): Promise<void> {
    const storage = await this.getStorage();
    let dates: string[] = (await storage.get('dates_index')) || [];
    if (!dates.includes(date)) {
      dates.unshift(date);
      dates = Array.from(new Set(dates)).sort().reverse().slice(0, 90);
      await storage.put('dates_index', dates);
    }
  }

  private async updateUniques(date: string, country: string, installId?: string): Promise<{ uniqueByCountry: Record<string, number>; uniqueInstallsTotal: number } | null> {
    if (!installId) return null;
    const storage = await this.getStorage();
    const key = `uniques:${date}`;
    let uniques: Record<string, string[]> = (await storage.get(key)) || {};

    if (!uniques[country]) {
      uniques[country] = [];
    }

    if (!uniques[country].includes(installId)) {
      uniques[country].push(installId);
      await storage.put(key, uniques);
    }

    const uniqueByCountry: Record<string, number> = {};
    const allSet = new Set<string>();
    for (const [c, ids] of Object.entries(uniques)) {
      uniqueByCountry[c] = ids.length;
      for (const id of ids) allSet.add(id);
    }

    return {
      uniqueByCountry,
      uniqueInstallsTotal: allSet.size,
    };
  }

  private async handleParentStart(date: string, country: string, installId?: string): Promise<void> {
    const day = await this.getDayData(date);
    if (installId) {
      const uniquesResult = await this.updateUniques(date, country, installId);
      if (uniquesResult) {
        day.uniqueByCountry = uniquesResult.uniqueByCountry;
        day.uniqueInstallsTotal = uniquesResult.uniqueInstallsTotal;
      }
    }
    await this.saveDayData(date, day);
  }

  private async handleParentEnd(date: string, country: string, installId?: string, durationSec: number = 0): Promise<void> {
    const day = await this.getDayData(date);
    if (installId) {
      const uniquesResult = await this.updateUniques(date, country, installId);
      if (uniquesResult) {
        day.uniqueByCountry = uniquesResult.uniqueByCountry;
        day.uniqueInstallsTotal = uniquesResult.uniqueInstallsTotal;
      }
    }

    const cleanDuration = Math.max(0, Math.floor(durationSec));
    const cappedDuration = Math.min(cleanDuration, 7200); // 2 hours clamp

    day.parentSessionsByCountry = day.parentSessionsByCountry || {};
    day.parentDurationSecByCountry = day.parentDurationSecByCountry || {};

    day.parentSessionsByCountry[country] = (day.parentSessionsByCountry[country] || 0) + 1;
    day.parentDurationSecByCountry[country] = (day.parentDurationSecByCountry[country] || 0) + cappedDuration;
    day.parentSessionsTotal = (day.parentSessionsTotal || 0) + 1;
    day.parentDurationSecTotal = (day.parentDurationSecTotal || 0) + cappedDuration;

    await this.saveDayData(date, day);
  }

  private async handleChildEnd(date: string, country: string, installId?: string, durationSec: number = 0): Promise<void> {
    const day = await this.getDayData(date);
    if (installId) {
      const uniquesResult = await this.updateUniques(date, country, installId);
      if (uniquesResult) {
        day.uniqueByCountry = uniquesResult.uniqueByCountry;
        day.uniqueInstallsTotal = uniquesResult.uniqueInstallsTotal;
      }
    }

    const cleanDuration = Math.max(0, Math.floor(durationSec));
    const cappedDuration = Math.min(cleanDuration, 14400); // 4 hours clamp

    day.childSessionsByCountry = day.childSessionsByCountry || {};
    day.childDurationSecByCountry = day.childDurationSecByCountry || {};

    day.childSessionsByCountry[country] = (day.childSessionsByCountry[country] || 0) + 1;
    day.childDurationSecByCountry[country] = (day.childDurationSecByCountry[country] || 0) + cappedDuration;
    day.childSessionsTotal = (day.childSessionsTotal || 0) + 1;
    day.childDurationSecTotal = (day.childDurationSecTotal || 0) + cappedDuration;

    await this.saveDayData(date, day);
  }

  private async getSummary(maxDays: number): Promise<any> {
    const storage = await this.getStorage();
    let dates: string[] = (await storage.get('dates_index')) || [];
    const todayStr = getTodayDateUtc();
    if (!dates.includes(todayStr)) {
      dates.unshift(todayStr);
    }
    const targetDates = Array.from(new Set(dates))
      .sort()
      .reverse()
      .slice(0, maxDays);

    const daysData: TelemetryDailyData[] = [];
    const allUniqueByCountryMap: Record<string, Set<string>> = {};
    const totalUniqueSet = new Set<string>();

    for (const d of targetDates) {
      const dayData = await this.getDayData(d);
      daysData.push(dayData);

      const rawUniques: Record<string, string[]> | undefined = await storage.get(`uniques:${d}`);
      if (rawUniques) {
        for (const [c, ids] of Object.entries(rawUniques)) {
          if (!allUniqueByCountryMap[c]) allUniqueByCountryMap[c] = new Set();
          for (const id of ids) {
            allUniqueByCountryMap[c].add(id);
            totalUniqueSet.add(id);
          }
        }
      }
    }

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

    return {
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
    };
  }
}
