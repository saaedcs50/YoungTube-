# Catalog Queue Failure Recovery

## Processing queues

- `youngtube-catalog-discovery` and `youngtube-catalog-processing` keep their existing five-retry policies.
- A message that exhausts its five retries is not acknowledged until a redacted terminal record is durably stored in `catalog_config`.
- An exhausted `AUTO_REVIEW_POLL_INTERACTION` message moves its unapproved videos to `NEEDS_REVIEW`, clears only their pending auto-review markers, and records a safe provider failure. It never approves a video.
- Unknown message types are not silently acknowledged as successful. They retry and are quarantined after the retry budget.

## Dead-letter queue

The `youngtube-catalog-dlq` queue now has a dedicated Worker consumer. It does not replay messages. It stores a redacted record keyed by a SHA-256 hash of the Queue message ID, then acknowledges the item only after the D1 write succeeds.

The record contains the queue/message type, retry count, timestamp, video count, diagnostic-only flag, and hashes for interaction/job identifiers. It deliberately excludes raw message bodies, video IDs, titles, interaction IDs, contact details, and model output.

If D1 cannot persist the record after the DLQ consumer's retries, Cloudflare sends the message to `youngtube-catalog-quarantine`. That queue has no automatic consumer. It is a hold area for operator inspection; do not bulk replay it.

## Replay policy

- Never replay an old `AUTO_REVIEW_POLL_INTERACTION` payload. Its interaction may be terminal, expired, or inaccessible.
- A provider retry must create a new interaction ID using the currently documented Interactions API version (`v1beta`).
- Reuse the same Shadow sample slots only after a fresh one-video diagnostic succeeds. Do not reset the reservation counter or retry counter by hand.
- For non-provider jobs, inspect the corresponding `ingest_jobs` row and the redacted `queue_failure:<sha256>` record before constructing a new idempotent job.
- A human/operator must confirm a new attempt from the authenticated admin workflow; the DLQ consumer itself never redrives content.

## Current baseline

As of the 6 November 2026 read-only Cloudflare check, the DLQ backlog was zero. This recovery path protects future failures; it does not claim that a previously expired/removed DLQ item was recovered.
