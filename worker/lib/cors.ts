import { Env } from './types';

export const corsHeaders: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Admin-Key, Authorization, X-Family-Youtube-Key, x-family-youtube-key',
};

/**
 * Resolves the YouTube API key from request headers or environment variable.
 * Priority: X-Family-Youtube-Key header > env.YOUTUBE_API_KEY.
 * Never logs key value.
 */
export function resolveYouTubeApiKey(request: Request, env: Env): string {
  const headerKey =
    request.headers.get('X-Family-Youtube-Key') ||
    request.headers.get('x-family-youtube-key') ||
    '';
  const trimmedHeader = headerKey.trim();
  if (trimmedHeader) {
    return trimmedHeader;
  }
  return (env.YOUTUBE_API_KEY || '').trim();
}

/**
 * Validates admin requests using Authorization: Bearer ADMIN_KEY (or legacy X-Admin-Key).
 */
export function checkAdminAuth(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) return false;
  const authHeader =
    request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === env.ADMIN_KEY) return true;
  }
  const xKey = request.headers.get('X-Admin-Key') || request.headers.get('x-admin-key') || '';
  if (xKey === env.ADMIN_KEY) return true;
  return false;
}

/**
 * Rate Limiting Constants for Targeted Public GET Endpoints (Phase P3.2)
 */
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 60;
export const RATE_LIMITED_ROUTES = new Set([
  '/api/categories',
  '/api/channels-latest',
  '/api/announcements',
  '/api/global-blocks',
  '/api/rss',
]);

// In-memory fallback map for worker isolates when Durable Objects are unavailable or during tests
const fallbackRateLimitMap = new Map<string, { count: number; resetAt: number }>();
let lastFallbackSweep = Date.now();

function checkFallbackRateLimit(ip: string): boolean {
  const now = Date.now();
  if (now - lastFallbackSweep > 60000) {
    lastFallbackSweep = now;
    for (const [key, entry] of fallbackRateLimitMap.entries()) {
      if (now > entry.resetAt) {
        fallbackRateLimitMap.delete(key);
      }
    }
  }

  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;
  let entry = fallbackRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    fallbackRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  return true;
}

/**
 * Checks rate limit for public GET requests via Durable Object (Approach A)
 * or gracefully falls back to worker isolate in-memory state.
 */
export async function checkPublicRateLimit(request: Request, env: Env): Promise<boolean> {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1';

  if (env.TELEMETRY_DO) {
    try {
      const id = env.TELEMETRY_DO.idFromName('rate-limiter-v1');
      const stub = env.TELEMETRY_DO.get(id);
      const res = await stub.fetch('http://do/rate_limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          limit: RATE_LIMIT_MAX_REQUESTS,
          windowSec: RATE_LIMIT_WINDOW_SECONDS,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        return data.allowed !== false;
      }
    } catch (err) {
      console.warn('DO rate limit check failed, using in-memory fallback:', err);
    }
  }

  return checkFallbackRateLimit(ip);
}
