import { WORKER_URL } from '../config';
import { getInstallId } from './telemetry';

export type FunnelEventType =
  | 'welcome_seen'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'first_play';

/**
 * Fire-and-forget telemetry beacon for tracking user onboarding and retention funnel stages.
 * - Never throws errors into the UI.
 * - Attaches stable local installId.
 * - Strictly avoids sending content metadata (titles, videoIds, PINs).
 */
export function trackFunnelEvent(event: FunnelEventType): void {
  try {
    const installId = getInstallId();
    const url = `${WORKER_URL}/api/telemetry/funnel-event`;

    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        installId,
      }),
      keepalive: true,
    }).catch(() => {
      // Silently fail-open: network errors must never affect user experience
    });
  } catch {
    // Silently ignore any unexpected runtime or storage issues
  }
}
