import { WORKER_URL } from '../config';

const INSTALL_ID_KEY = 'yt_install_id';

function generateRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback if crypto.randomUUID fails
    }
  }
  return 'id_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function getInstallId(): string {
  if (typeof window === 'undefined') {
    return 'server_install_id';
  }
  try {
    let installId = localStorage.getItem(INSTALL_ID_KEY);
    if (!installId) {
      installId = generateRandomId();
      localStorage.setItem(INSTALL_ID_KEY, installId);
    }
    return installId;
  } catch {
    return 'fallback_install_id';
  }
}

export function createSessionId(): string {
  return generateRandomId();
}

export async function postTelemetry(path: string, body: object): Promise<void> {
  try {
    const url = `${WORKER_URL}${path}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Fail-open fire-and-forget: ignore network errors
  }
}

export function startParentSession(): string {
  const sessionId = createSessionId();
  void postTelemetry('/api/telemetry/parent-session-start', {
    installId: getInstallId(),
    sessionId,
  });
  return sessionId;
}

export function endParentSession(sessionId: string, startedAtMs: number): void {
  if (!sessionId) return;
  const rawDuration = Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
  const durationSec = Math.min(rawDuration, 7200);
  void postTelemetry('/api/telemetry/parent-session-end', {
    installId: getInstallId(),
    sessionId,
    durationSec,
  });
}
