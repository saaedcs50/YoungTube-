# Parent Inbox — Worker runbook

The parent inbox is mounted on the existing `youngtube-worker`. It uses a dedicated SQLite-backed Durable Object (`ParentInboxStore`) and does not use the channel archive KV key or the telemetry aggregator for message storage.

## Added API routes

- `POST /api/parent-inbox` — create a message; requires `capabilityToken` (a 256-bit random per-install secret) and allows at most 5 messages per device in a rolling 24-hour window.
- `GET /api/parent-inbox?deviceId=...` — list only messages created with the matching `X-Parent-Inbox-Capability` header. The token is never placed in the URL or returned in a response; only its SHA-256 hash is stored. The public projection never returns `adminNote`, `deviceId`, or the capability.
- `GET /api/admin/parent-inbox?search=...` — admin list and unread counter; requires `Authorization: Bearer <ADMIN_KEY>`.
- `POST /api/admin/parent-inbox/:id` — admin actions (`mark_read`, `reply`, `close`, `reopen`, `pin`, `note`, `archive`); requires the existing Bearer key.

The server retains the latest 500 messages. Archiving is a visibility field separate from status; it is not permanent retention. The public `deviceId` is only a locator, never an authenticator. The separate random capability is a bearer secret: it prevents access by someone who only knows the device ID, but it is still held by same-origin app code and is not a substitute for an authenticated user account or XSS protection. The Durable Object stores only its SHA-256 hash.

Existing rows from before this security update have no capability hash. They are not deleted or assigned a guessed credential; they remain available in the authenticated admin inbox but are not returned by public device reads. This is intentional because those older installations never proved possession of a separate secret. Updated apps generate and persist a fresh capability for future messages. Keep submitted content free of sensitive personal/child-viewing data.

## Existing Worker configuration

The migration history is preserved: `v1` continues to define `TelemetryAggregator`, and `v2` adds `ParentInboxStore`. Deployments must apply the new `v2` migration to the existing Worker; do not remove, rename, or recreate the existing KV namespace, Durable Object, or migration.

## Optional Telegram alert

Telegram is disabled unless both Cloudflare Worker secrets are configured. To enable, set them as secrets on the **existing** Worker using the Cloudflare Wrangler workflow:

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Do not place either value in source code, `.env.example`, a Vite `VITE_*` variable, or the delivered archive. If either value is absent, message creation still works without Telegram. The notification includes message ID, type, app version, and platform only; it deliberately excludes message text, contact details, and device ID.

## Validation

The local route/store contract suite lives at `tests/parent-inbox-routes.test.mjs` in the YoungTube root. It uses Node 22's built-in SQLite for isolated storage tests and a mocked Durable Object namespace for route/auth contract tests. A passing local suite does not replace `wrangler deploy --dry-run`, deployment, or real mobile end-to-end testing.
