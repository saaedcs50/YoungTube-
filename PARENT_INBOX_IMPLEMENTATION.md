# Parent Inbox implementation

The parent inbox feature is implemented in `src/components/dashboard/ParentInboxSection.tsx`, `src/services/parentInbox.ts`, and the existing parent dashboard navigation. It is exposed only when `viewMode === 'dashboard'` and `isDashboardUnlocked` is true; development mode does not expose the inbox tab.

The Worker API, SQLite Durable Object, new `v2` migration, optional Telegram notice, and deployment notes are in `worker/`. See [`worker/PARENT_INBOX.md`](worker/PARENT_INBOX.md) for route details and operational requirements.

The admin view is added to the original `admin-youngtube` React source under `src/components/ParentInboxView.tsx` and uses the existing API helper and stored Bearer admin key. It does not embed `ADMIN_KEY` into the bundle.

`tests/parent-inbox-routes.test.mjs` exercises route authorization/projection and SQLite-backed rate-limit/retention/status behavior. The full Vite/Capacitor build and Cloudflare deploy still need to be run in an environment able to install the project's npm dependencies.


## Parent Inbox access protection

Each installation now maintains a cryptographically random 256-bit capability separately from its public device locator. The app sends that capability in the X-Parent-Inbox-Capability header for reads and in the message-create payload for writes. The Worker passes it only to the ParentInboxStore Durable Object, which stores a SHA-256 hash and verifies the hash for device-scoped reads. The capability is never included in a URL or returned to the client.

Rows created before this protection have no capability hash. They are intentionally preserved and remain available in the authenticated admin inbox, but cannot be returned to a newly updated client because the old client never possessed a separate secret. This avoids silently assigning old messages to an unverified device. The capability raises the bar against guessed or disclosed device IDs, but it is still accessible to same-origin JavaScript; it is not a replacement for account authentication or XSS prevention.
