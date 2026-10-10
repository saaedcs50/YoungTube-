import { Capacitor } from '@capacitor/core';
import { WORKER_URL } from '../config';

export type ParentInboxType = 'bug' | 'suggestion' | 'thanks' | 'question';
export type ParentInboxStatus = 'new' | 'read' | 'replied' | 'closed';
export interface ParentInboxMessage {
  id: string; createdAt: string; updatedAt: string; type: ParentInboxType; body: string;
  contact?: string; appVersion?: string; platform?: string; status: ParentInboxStatus;
  readAt?: string | null; reply?: string | null; repliedAt?: string | null;
}
interface ParentInboxResponse { ok: boolean; error?: string; messages?: ParentInboxMessage[]; message?: ParentInboxMessage }
const DEVICE_ID_KEY = 'yt_parent_device_id';
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || '1.0.1';
let memoryDeviceId: string | null = null;

function createSecureId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  throw new Error('secure_id_unavailable');
}

export function getParentDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,80}$/.test(stored)) { memoryDeviceId = stored; return stored; }
  } catch { /* Storage can be unavailable in restricted WebViews. */ }
  let generated: string;
  try { generated = createSecureId(); }
  catch { throw new Error('تعذر إنشاء معرّف آمن للجهاز. أعد فتح التطبيق وحاول مرة أخرى.'); }
  memoryDeviceId = generated;
  try { localStorage.setItem(DEVICE_ID_KEY, generated); } catch { /* Use memory for this session. */ }
  return generated;
}

function currentPlatform(): string {
  try {
    const value = Capacitor.getPlatform();
    return value === 'android' || value === 'ios' || value === 'web' ? value : 'unknown';
  } catch { return 'unknown'; }
}
function userError(status?: number, code?: string, operation: 'send' | 'load' = 'send'): string {
  if (status === 429 || code === 'rate_limited') return operation === 'load' ? 'الطلبات كثيرة حاليًا. انتظر قليلًا ثم حدّث الرسائل.' : 'وصلت للحد المسموح: 5 رسائل خلال 24 ساعة من الجهاز ده.';
  if (status === 400 || code === 'invalid') return operation === 'load' ? 'تعذر قراءة الرسائل الحالية. أعد المحاولة.' : 'راجع نوع الرسالة وطول النص وبيانات التواصل وحاول تاني.';
  if (status === 503 || code === 'inbox_unavailable') return 'صندوق الرسائل غير متاح مؤقتًا. احتفظ بنصك وحاول مرة تانية.';
  return operation === 'load' ? 'تعذر تحميل الرسائل. راجع اتصال الإنترنت وحاول تاني.' : 'الرسالة ما اتبعتتش. راجع اتصال الإنترنت وحاول تاني.';
}
async function request<T>(path: string, init: RequestInit = {}, operation: 'send' | 'load' = 'send'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}${path}`, {
      ...init, cache: 'no-store',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch { throw new Error(userError(undefined, undefined, operation)); }
  let payload: ParentInboxResponse | null = null;
  try { payload = await response.json() as ParentInboxResponse; } catch { /* generic error below */ }
  if (!response.ok || !payload?.ok) throw new Error(userError(response.status, payload?.error, operation));
  return payload as T;
}

export async function fetchParentInbox(deviceId: string, signal?: AbortSignal): Promise<ParentInboxMessage[]> {
  const result = await request<ParentInboxResponse>(`/api/parent-inbox?deviceId=${encodeURIComponent(deviceId)}`, { signal }, 'load');
  return Array.isArray(result.messages) ? result.messages : [];
}
export async function createParentInboxMessage(input: { deviceId: string; type: ParentInboxType; body: string; contact: string }, signal?: AbortSignal): Promise<ParentInboxMessage> {
  const result = await request<ParentInboxResponse>('/api/parent-inbox', {
    method: 'POST', signal,
    body: JSON.stringify({ ...input, appVersion: APP_VERSION, platform: currentPlatform() }),
  });
  if (!result.message) throw new Error(userError());
  return result.message;
}
export function parentInboxTypeLabel(type: ParentInboxType): string {
  return ({ bug: 'مشكلة', suggestion: 'اقتراح', thanks: 'شكر', question: 'سؤال' })[type];
}
export function parentInboxStatusLabel(status: ParentInboxStatus): string {
  return ({ new: 'وصلت', read: 'اتقرت', replied: 'فيه رد', closed: 'اتقفلت' })[status];
}
