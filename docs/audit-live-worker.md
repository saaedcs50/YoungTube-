# Live Worker audit (read-only)

`scripts/audit-live-worker.mjs` checks, without changing anything, whether
the live Cloudflare Worker matches the repo's `main` branch and its
`wrangler.toml`. It is GET-only by construction: every HTTP call goes
through a single helper that throws on any method other than GET, and it
never touches D1, KV, queues, or any admin path.

## Run

```bash
npm run audit:worker:live
```

The tool prints a JSON report to stdout and exits non-zero unless the
overall result is PASS (see below). Run it from the repo root so it can
read `./wrangler.toml` as the bindings reference.

## Required environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Yes, for the Cloudflare checks | Account that owns `youngtube-worker`. Never printed. |
| `CLOUDFLARE_API_TOKEN` | Yes, for the Cloudflare checks | Read-only API token. Never printed. |
| `GITHUB_REPOSITORY` | No (default `saaedcs50/YoungTube-`) | Repo whose ref is resolved. |
| `GITHUB_REF` | No (default `main`) | Ref whose SHA is the linkage target. |
| `WORKER_BASE_URL` | No (default `https://youngtube-worker.saaedbelal.workers.dev`) | Public Worker origin for the health/categories probes. |
| `WORKER_NAME` | No (default `youngtube-worker`) | Cloudflare script name. |

If either `CLOUDFLARE_*` variable is absent, all Cloudflare checks report
BLOCKED naming the missing variable(s), no Cloudflare call is attempted,
and the exit code is non-zero. The GitHub and public-endpoint checks still
run.

## Minimum Cloudflare token permission

**Workers Scripts:Read** on the account. This is the documented accepted
permission for reading Worker deployments (Cloudflare Workers API
documentation, "List Worker Deployments" page, which lists Workers Scripts
Read among its accepted permissions). The settings read is the same
script-settings family; its permission was not separately confirmed on its
own documentation page, so if a token with Workers Scripts:Read ever gets
a 403 on the settings endpoint only, that is the first place to look.

## What it checks

1. **github_sha** — `GET /repos/{repo}/commits/{ref}` resolves to a full
   40-hex SHA (public, unauthenticated).
2. **cloudflare_deployment** — latest deployment of `youngtube-worker`
   (`GET .../workers/scripts/{script}/deployments`; the first entry in
   the list is the latest actively serving deployment).
3. **traffic** — the latest deployment's `versions[]` (`{ percentage,
   version_id }`). A single version at 100% passes this check only;
   traffic alone never proves a SHA linkage.
4. **sha_linkage** — the deployment record's annotation string fields
   (`annotations."workers/message"`, `annotations."workers/triggered_by"`)
   are searched for the GitHub SHA. A full match passes; a hex token of
   7+ characters that is an actual case-sensitive prefix of the SHA
   passes with the prefix length and field path as evidence.
5. **bindings** — live script settings bindings (`GET
   .../workers/scripts/{script}/settings`, with a single GET retry against
   `.../script-settings` on 404) compared by name AND type against
   `./wrangler.toml` (`d1_databases` → `d1`, `kv_namespaces` →
   `kv_namespace`, `queues.producers` → `queue`) plus the four baseline
   bindings `CATALOG_DB`, `CHANNELS_ARCHIVE`, `CATALOG_DISCOVERY_QUEUE`,
   `CATALOG_PROCESSING_QUEUE`. A settings binding whose name differs from
   the wrangler name is reported as missing, never silently equated.
6. **live_health** — `GET {base}/api/health` must be 200 with JSON
   `{ status: "ok", service: "youngtube-worker", timestamp: string }`
   (the contract proven by `worker/routes/public-read.ts`).
7. **live_categories** — `GET {base}/api/categories` must be 200 with a
   non-empty JSON array whose items all have a non-empty string `id` and
   a string `label` (the contract proven by `worker/routes/catalog-v2.ts`,
   whose handler runs before the public-read handler). Only HTTP status,
   item count, and item keys are recorded — never item values, which may
   come from KV.

## Report shape

```json
{
  "generatedAt": "…",
  "inputs": { "repository": "…", "ref": "…", "worker": "…", "baseUrl": "…" },
  "github": { "sha": "…", "ref": "…" },
  "cloudflare": {
    "deploymentId": "…",
    "versionId": "…",
    "traffic": [{ "versionId": "…", "percentage": 100 }],
    "annotationField": "annotations.workers/message",
    "annotationValue": "…"
  },
  "checks": [{ "id": "…", "name": "…", "status": "PASS|FAIL|UNKNOWN|BLOCKED", "evidence": {}, "detail": "…" }],
  "summary": { "counts": { "PASS": 0, "FAIL": 0, "UNKNOWN": 0, "BLOCKED": 0 }, "overall": "…" }
}
```

The report never contains a token, an `Authorization` header, an account
id, payment data, response bodies, or KV content. `annotationValue` is
set only when the annotation is exactly the SHA or a prefix of it; a
non-SHA note is reported only as "a note exists at this field path".

## Status meanings and the overall rule

- **PASS** — the check's contract held, with the evidence shown.
- **FAIL** — the check ran and its contract did not hold (traffic split,
  missing/type-mismatched binding, SHA mismatch, endpoint contract
  violation). Evidence names the failing item.
- **UNKNOWN** — the check ran but the evidence needed for a verdict is
  absent (for example, the deployment carries no annotation field that
  could hold a SHA, or the settings response has no bindings array).
  UNKNOWN is never presented as PASS.
- **BLOCKED** — the check could not run (missing credentials, timeout,
  HTTP/API error, unreadable `wrangler.toml`). Only the error class
  (for example `timeout`, `http_500`) is recorded — never raw error
  bodies and never URLs containing the account id.

**Overall rule:** overall is PASS only if every check is PASS. Any FAIL
makes overall FAIL. Otherwise any BLOCKED makes overall BLOCKED.
Otherwise overall is UNKNOWN. The exit code is 0 only when overall is
PASS, and 1 otherwise.

## Tests

```bash
node --test tests/audit-live-worker.test.mjs
```

All fetch calls are faked (dependency injection); tests use no secrets
and no real network. Coverage includes: full SHA match, valid
short-prefix match, SHA mismatch, missing annotation, traffic split,
missing binding, type-mismatched binding, Cloudflare API error, fetch
timeout, health pass/fail (non-200, bad JSON, wrong shape), invalid
categories responses, missing credentials → BLOCKED, non-GET rejection,
and secret/token redaction.
