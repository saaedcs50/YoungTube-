# YoungTube — Cloudflare Worker Context

## 1. Worker Identity

- Worker name: `youngtube-worker`
- Public base URL: `https://youngtube-worker.saaedbelal.workers.dev`
- Account ID: `6a206beb03d008aba77ff945ea6a68da`
- Source repo: `saaedcs50/YoungTube-`
- Source branch: `main`
- Current GitHub main HEAD checked during this context build: `d38e6faae81b00660839d221f501f4c30f5a92c6`

Cloudflare production metadata does not expose a reliable Git commit SHA for the currently serving version, so never claim that a production version equals a specific Git SHA unless Cloudflare metadata explicitly proves it.

## 2. Source Configuration

Current `wrangler.toml` says:

```toml
name = "youngtube-worker"
main = "worker/index.ts"
compatibility_date = "2024-01-01"

[triggers]
crons = ["0 */6 * * *"]

[[kv_namespaces]]
binding = "CHANNELS_ARCHIVE"
id = "b933debea57649fc921e173185619ffb"

[durable_objects]
bindings = [
  { name = "TELEMETRY_DO", class_name = "TelemetryAggregator" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TelemetryAggregator"]
```

## 3. Production Cloudflare State Observed

Direct Cloudflare control-plane inspection showed:

- current serving Worker version: `180`
- current serving version ID: `12789e7c-fb64-4fd7-bf43-e4b6061d8e54`
- current serving deployment ID: `75ea0132-72aa-4748-bbb2-8b537737a1a3`
- traffic: `100%` to the current version
- current version creation timestamp: `2026-10-04T19:30:48.73177Z`
- deployment creation timestamp: `2026-10-04T19:30:49.355434Z`
- source in Cloudflare metadata: `wrangler`

The immediately previous production versions are visible in the Cloudflare versions/deployments history. Do not assume their source commit unless a deployment pipeline records it explicitly.

## 4. Production Bindings

Current Worker settings report these bindings:

### Secret bindings

- `ADMIN_KEY` — `secret_text`
- `SUPPORT_PAY_SIGNING_KEY` — `secret_text`
- `YOUTUBE_API_KEY` — `secret_text`

Only the existence/type of these secrets is documented here. Values are intentionally omitted.

### KV

- binding: `CHANNELS_ARCHIVE`
- namespace ID: `b933debea57649fc921e173185619ffb`

### Durable Object

- binding: `TELEMETRY_DO`
- namespace ID: `d13e827945db40139af50ea4028666ed`
- class: `TelemetryAggregator`

### Compatibility/runtime

- compatibility date: `2024-01-01`
- compatibility flags: none reported
- usage model: `standard`
- Logpush: disabled
- tail consumers: none reported

## 5. Cron

Production schedule currently reports:

```text
0 */6 * * *
```

That means the scheduled Worker refresh path is expected every six hours.

The `scheduled()` handler in `worker/index.ts` performs:

1. channel refresh via `refreshChannelsBatch(env)`
2. telemetry sweep via `TelemetryAggregator`

## 6. Worker Routing Architecture

`worker/index.ts` is the HTTP entry point.

Request handling order:

1. OPTIONS CORS preflight
2. public GET rate limiting for configured public endpoints
3. telemetry POST rate limiting
4. `handlePublicReadRoutes`
5. `handleAdminChannelsRoutes`
6. `handleAdminBatchRoutes`
7. `handleAdminContentRoutes`
8. `handleAdminTelemetryRoutes`
9. 404 fallback

## 7. Public Routes in Current Source

`worker/routes/public-read.ts` currently exposes these public/read-oriented paths:

- `/`
- `/api/health`
- `/api/test-worker`
- `/api/rss`
- `/api/channels-latest`
- `/api/channel-archive`
- `/api/channel-videos-page`
- `/api/channel-search`
- `/api/search-archive`
- `/api/video-lookup`
- `/api/playlist-lookup`
- `/api/videos-views`
- `/api/videos-durations`
- `/api/global-blocks`
- `/api/announcements`
- `/api/admin/announcements` (admin-protected path handled inside public-read routing)
- `/api/categories`
- `/api/admin/categories` (admin-protected path)
- `/api/resolve-channel`
- `/api/support-pay`

## 8. Admin / Content Routes in Current Source

`worker/routes/admin-channels.ts`:

- `/api/admin/backfill-channel`
- `/api/admin/trigger-refresh`
- `/api/admin/channels`
- `/api/admin/channel-video-delete`

`worker/routes/admin-batch.ts`:

- `/api/admin/backfill-all-batch`
- `/api/admin/cleanup-dead-videos-batch`
- `/api/admin/scan-cleanup-batch`
- `/api/admin/maintenance-status`
- `/api/admin/maintenance-run`

`worker/routes/admin-content.ts` includes content/config management plus:

- `/api/admin/blocks`
- `/api/admin/announcements`
- `/api/admin/categories`
- `/api/admin/status`
- `/api/admin/support-pay`

`worker/routes/admin-telemetry.ts` includes:

- `/api/telemetry/parent-session-start`
- `/api/telemetry/parent-session-end`
- `/api/telemetry/child-session-end`
- `/api/telemetry/funnel-event`
- `/api/admin/telemetry`

## 9. Authentication Contract

`worker/lib/cors.ts` defines admin authentication via:

```text
Authorization: Bearer ADMIN_KEY
```

Current source does not use the old `X-Admin-Key` mechanism and does not use a `?key=` admin query parameter.

Never put `ADMIN_KEY` in frontend source or URLs.

## 10. Family YouTube API Key Isolation

Two different resolver functions exist intentionally:

### Admin/server resolver

`resolveYouTubeApiKey(request, env)` may use:

- request `X-Family-Youtube-Key`
- otherwise server `YOUTUBE_API_KEY`

### Public resolver

`resolveFamilyYouTubeApiKey(request)` reads ONLY:

- request `X-Family-Youtube-Key`

No public unauthenticated fallback to the server `YOUTUBE_API_KEY` is intended.

This separation prevents ordinary public clients from spending the server's private YouTube quota implicitly.

## 11. Rate Limiting

Current public GET rate-limited set includes:

- `/api/categories`
- `/api/channels-latest`
- `/api/announcements`
- `/api/global-blocks`
- `/api/rss`
- `/api/resolve-channel`
- `/api/channel-archive`
- `/api/channel-search`
- `/api/search-archive`
- `/api/video-lookup`
- `/api/playlist-lookup`
- `/api/videos-views`
- `/api/videos-durations`
- `/api/support-pay`

Default values in `worker/lib/cors.ts`:

- window: 60 seconds
- maximum: 60 requests

The implementation uses a Durable Object rate-limit bucket when available and an in-memory fallback when it is not.

Telemetry POSTs use a separate rate-limit bucket with a lower limit.

## 12. Channel Archive / Public Compact Feed

`GET /api/channels-latest`:

- reads `CHANNELS_ARCHIVE`
- when public, compacts each channel to roughly the recent 10-video window
- exposes a separate `videoCount` value
- admin Bearer requests can receive the full archive
- public cache headers are longer-lived than admin responses
- admin responses use `Vary: Authorization` where appropriate

The client should never use `videos.length` as the definitive total when `videoCount` is available.

## 13. Announcements Security

`GET /api/announcements`:

- public response filters inactive items (`active !== false`)

`GET /api/announcements?all=true`:

- treated as an admin/full-list request
- requires valid Admin Bearer authentication
- without valid auth, the route returns 401

This prevents the inactive/admin announcement list from leaking publicly.

## 14. Support Pay Storage Contract

Canonical KV key:

```text
support_pay
```

History prefix:

```text
support_pay_history:
```

Required rule:

- this task/context must NEVER overwrite, delete, reseed, or rotate these values unless the user explicitly requests a support-pay data operation.

Current control-plane observation:

- `support_pay` exists
- it contains an `instapay` object
- it contains a `vodafoneCash` object
- it contains `updatedAt`
- it contains a version field

No actual values are recorded in this file.

## 15. Support Pay API

Public:

```text
GET /api/support-pay
```

Expected public response shape is a signed envelope when signing is configured, with a payload and optional signature metadata.

Admin:

```text
GET  /api/admin/support-pay
POST /api/admin/support-pay
```

Both require:

```text
Authorization: Bearer ADMIN_KEY
```

## 16. Support Pay Write Validation

`validateSupportPayPayload(input, isAdminWrite = false)` currently supports stricter rules when `isAdminWrite=true`.

Required non-empty trimmed values for admin writes:

### InstaPay

- `instapay.phone`
- `instapay.ipa`
- `instapay.url`
- `instapay.name`

### Vodafone Cash

- `vodafoneCash.phone`
- `vodafoneCash.name`

`note` remains optional.

The URL validator currently enforces HTTPS and a maximum length; it is not a host allowlist.

## 17. Support Pay History

Before a successful admin Support Pay overwrite, the current payload is copied to a key using:

```text
support_pay_history:<timestamp>
```

Current code does not show retention cleanup for that history namespace.

## 18. Worker Safety Boundaries

Never:

- print secret values
- print payment data
- put payment data in source
- rotate secrets as part of ordinary deploys
- delete `support_pay`
- delete support-pay history
- add a delete endpoint for Support Pay
- replace Bearer auth with query parameters
- change family-key quota isolation casually
- change the 120-second product rule casually

## 19. Deployment Baseline

Current production Worker is serving 100% traffic on version 180 at the time this file was created.

The production control plane also shows the deployment/version history, but Cloudflare does not provide a trustworthy Git SHA binding in the standard version metadata used here.

Therefore future handoffs must record both:

- GitHub source SHA
- Cloudflare production version/deployment IDs

and must explicitly state whether the mapping is PROVEN or UNKNOWN.

## 20. Verification Protocol

For a future Worker change:

1. confirm GitHub `main` SHA
2. inspect relevant Worker source at that exact SHA
3. compare desired bindings with Cloudflare production bindings
4. deploy through the existing Worker identity
5. confirm 100% traffic on the intended version
6. run live HTTP probes with redacted bodies
7. confirm `support_pay` still exists
8. record results in handoff files

A source-level PASS is not equivalent to a live runtime PASS.
