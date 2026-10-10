import { checkAdminAuth, corsHeaders } from '../lib/cors';
import type { Env } from '../lib/types';

const HEADERS = { ...corsHeaders, 'Cache-Control': 'no-store' };
const ALLOWED_TYPES = new Set(['bug', 'suggestion', 'thanks', 'question']);
const ALLOWED_PUBLIC_FIELDS = new Set(['deviceId', 'type', 'body', 'contact', 'appVersion', 'platform']);

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}
function errorResponse(error: string, status: number): Response {
  return response({ ok: false, error }, status);
}
function cleanText(value: string): string {
  return value.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C-\u001F\u007F]/g, '').trim();
}
async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) return null;
  const raw = await request.text();
  if (!raw || raw.length > 16_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function storeRequest(env: Env, path: string, init?: RequestInit): Promise<Response> {
  if (!env.PARENT_INBOX_DO) return errorResponse('inbox_unavailable', 503);
  try {
    const id = env.PARENT_INBOX_DO.idFromName('parent-inbox-v1');
    const stub = env.PARENT_INBOX_DO.get(id);
    const stored = await stub.fetch(`https://parent-inbox.internal${path}`, init);
    return new Response(await stored.text(), { status: stored.status, headers: HEADERS });
  } catch {
    return errorResponse('inbox_unavailable', 503);
  }
}

function publicMessage(message: Record<string, unknown>): Record<string, unknown> {
  return {
    id: message.id, createdAt: message.createdAt, updatedAt: message.updatedAt,
    type: message.type, body: message.body, contact: message.contact,
    appVersion: message.appVersion, platform: message.platform, status: message.status,
    readAt: message.readAt, reply: message.reply, repliedAt: message.repliedAt,
  };
}

async function createMessage(request: Request, env: Env): Promise<Response> {
  const input = await readObject(request);
  if (!input || Object.keys(input).some((key) => !ALLOWED_PUBLIC_FIELDS.has(key))) return errorResponse('invalid', 400);
  const deviceId = typeof input.deviceId === 'string' ? cleanText(input.deviceId) : '';
  const body = typeof input.body === 'string' ? cleanText(input.body) : '';
  const contact = typeof input.contact === 'string' ? cleanText(input.contact) : '';
  const appVersion = typeof input.appVersion === 'string' ? cleanText(input.appVersion) : '';
  const platform = typeof input.platform === 'string' ? cleanText(input.platform) : 'unknown';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(deviceId) || !ALLOWED_TYPES.has(String(input.type))
    || body.length < 5 || body.length > 1000 || contact.length > 120 || appVersion.length > 60
    || !['android', 'ios', 'web', 'unknown'].includes(platform)) return errorResponse('invalid', 400);

  const stored = await storeRequest(env, '/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, type: input.type, body, contact, appVersion, platform }),
  });
  if (stored.status !== 201) return new Response(await stored.text(), { status: stored.status, headers: HEADERS });

  let payload: { message?: Record<string, unknown> };
  try { payload = await stored.json() as { message?: Record<string, unknown> }; }
  catch { return errorResponse('inbox_unavailable', 503); }

  // Optional Telegram notice. Configure both secrets to enable; no parent text/contact/device ID is sent.
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const message = payload.message || {};
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: `YoungTube: رسالة أهل جديدة\nID: ${String(message.id || '')}\nالنوع: ${String(message.type || '')}\nالإصدار: ${String(message.appVersion || 'غير معروف')}\nالمنصة: ${String(message.platform || 'غير معروف')}`,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(2500),
      });
    } catch {
      // Notification failures must not undo a stored message; do not log contents or secrets.
    }
  }
  return response({ ok: true, message: payload.message ? publicMessage(payload.message) : undefined }, 201);
}

async function listDeviceMessages(url: URL, env: Env): Promise<Response> {
  const deviceId = cleanText(url.searchParams.get('deviceId') || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(deviceId)) return errorResponse('invalid', 400);
  const stored = await storeRequest(env, `/device?deviceId=${encodeURIComponent(deviceId)}`);
  if (!stored.ok) return errorResponse('inbox_unavailable', 503);
  try {
    const payload = await stored.json() as { messages?: Array<Record<string, unknown>> };
    return response({ ok: true, messages: (payload.messages || []).map(publicMessage) });
  } catch {
    return errorResponse('inbox_unavailable', 503);
  }
}

export async function handleParentInboxRoutes(request: Request, env: Env, url: URL): Promise<Response | null> {
  const method = request.method.toUpperCase();
  if (url.pathname === '/api/parent-inbox') {
    if (method === 'POST') return createMessage(request, env);
    if (method === 'GET') return listDeviceMessages(url, env);
    return errorResponse('method_not_allowed', 405);
  }

  if (url.pathname === '/api/admin/parent-inbox' || /^\/api\/admin\/parent-inbox\/[^/]+$/.test(url.pathname)) {
    if (!checkAdminAuth(request, env)) return errorResponse('unauthorized', 401);
    if (url.pathname === '/api/admin/parent-inbox') {
      if (method !== 'GET') return errorResponse('method_not_allowed', 405);
      const search = cleanText(url.searchParams.get('search') || '').slice(0, 100);
      const stored = await storeRequest(env, `/admin?search=${encodeURIComponent(search)}`);
      if (!stored.ok) return errorResponse('inbox_unavailable', 503);
      return new Response(await stored.text(), { status: 200, headers: HEADERS });
    }
    if (method !== 'POST') return errorResponse('method_not_allowed', 405);
    const id = url.pathname.slice('/api/admin/parent-inbox/'.length);
    if (!/^m_[A-Za-z0-9_-]{8,80}$/.test(id)) return errorResponse('invalid', 400);
    const input = await readObject(request);
    if (!input || Object.keys(input).some((key) => !['action', 'reply', 'note', 'pinned', 'archived'].includes(key))) return errorResponse('invalid', 400);
    const stored = await storeRequest(env, '/admin-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, id }),
    });
    return new Response(await stored.text(), { status: stored.status, headers: HEADERS });
  }
  return null;
}
