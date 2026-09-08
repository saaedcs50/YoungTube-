# Project Rules & Agent Guidelines

## 1. Single Source of Truth (حقيقة الملفات الحالية كمرجع وحيد)
- **Filesystem is Truth**: The workspace filesystem as it currently exists is the absolute single source of truth.
- **Never Revive Outdated Code**: Never rely on historical chat context or previous conversation turns to assume file content. Always inspect files via `view_file` before editing.
- **Do Not Recreate Deleted Files**: If a file, component, hook, or script was deleted by the user or removed via GitHub, **STRICTLY FORBIDDEN** from re-creating it or re-importing it unless explicitly requested by the user.

## 2. Respect User & GitHub Changes (حماية تعديلات المستخدم و GitHub)
- The user frequently syncs or pulls changes from their GitHub repository.
- Always preserve user modifications, custom component structures, and code cleanups.
- Before modifying any file, verify what exists on disk. Do not overwrite user-authored sections, styling adjustments, or custom logic.
- Prefer minimal, targeted, and surgical code edits (`edit_file` / targeted line replacements) over full-file rewrites.

## 3. Architecture & Cloudflare Worker Invariants (ثوابت المعمارية)
- **Subrequest Limits**: Respect the Cloudflare Worker 50 subrequests limit on the free tier.
- **/api/channels-latest**: Must read directly and instantly from `env.CHANNELS_ARCHIVE` (`_channels_latest_merged`). It must **NEVER** perform live RSS fetches for all channels in a single request. If key is missing, return `[]`.
- **Scheduled Cron Batches**: The worker uses `scheduled()` and `refreshChannelsBatch` with a cursor (`_rss_refresh_cursor`) to update 40 channels every 15 minutes (`*/15 * * * *` in `wrangler.toml`). Do not revert or dismantle this pattern.
- **Channels Seed**: `channels_seed.json` contains the curated list of 196 channels. Do not replace it with mock data or older truncated lists.
