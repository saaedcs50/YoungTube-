# Parent Inbox implementation

The parent inbox feature is implemented in `src/components/dashboard/ParentInboxSection.tsx`, `src/services/parentInbox.ts`, and the existing parent dashboard navigation. It is exposed only when `viewMode === 'dashboard'` and `isDashboardUnlocked` is true; development mode does not expose the inbox tab.

The Worker API, SQLite Durable Object, new `v2` migration, optional Telegram notice, and deployment notes are in `worker/`. See [`worker/PARENT_INBOX.md`](worker/PARENT_INBOX.md) for route details and operational requirements.

The admin view is added to the original `admin-youngtube` React source under `src/components/ParentInboxView.tsx` and uses the existing API helper and stored Bearer admin key. It does not embed `ADMIN_KEY` into the bundle.

`tests/parent-inbox-routes.test.mjs` exercises route authorization/projection and SQLite-backed rate-limit/retention/status behavior. The full Vite/Capacitor build and Cloudflare deploy still need to be run in an environment able to install the project's npm dependencies.
