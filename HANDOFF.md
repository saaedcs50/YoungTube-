# YoungTube — HANDOFF

## Current Baseline

- Repo: `saaedcs50/YoungTube-`
- Branch: `main`
- Current HEAD: `d38e6faae81b00660839d221f501f4c30f5a92c6`
- Current HEAD change: `fix: update MediaRouter callback implementation`
- Primary source root: repository root
- Worker source: `worker/`
- Android project: `android/`

## State at Handoff

The current GitHub codebase already contains the previously requested product additions/fixes around the child feed, playlists, casting, downloads, Support Pay UI, parent dashboard behavior, and feed filtering.

This handoff is based on the current GitHub `main` HEAD, not on the older local ZIPs used earlier in the conversation.

## Implemented Areas

### Child feed
- YouTube-mobile-style direction/hysteresis header collapse logic is present.
- Expanded/collapsed header states preserve child actions.
- Pull-to-refresh is present and wired to refresh/re-shuffle feed data.
- Child playlist management is present in Favorites.

### Child playlists
- create / rename / delete
- add from feed
- add from player
- remove from playlist
- browse playlists from Favorites
- safe playlist filtering

### Player / casting
- Cast button exists in the child player.
- Android native Cast plugin exists.
- Google Cast Framework integration exists.
- MediaRouter external-display fallback exists.
- Current code needs real-device verification across receiver types.

### Downloads
- Android-only native downloader.
- Progressive stream selection does not exceed 360p.
- Native file path is stored in Dexie.
- Local playback path exists in the player.

### Feed safety
- 120s duration filtering is family-key gated.
- Unknown duration is fail-closed when a family key is active.
- Shorts-like titles are filtered.
- Known portrait videos are filtered.
- Blacklist and global block rules are applied.
- Public compact feed is designed not to wipe valid local cache rows.

### Parent dashboard
- PIN lock state is reset on dashboard close.
- Analytics UI is handled by the separate admin application rather than a parent dashboard analytics tab.

### Support Pay
- Client reads `/api/support-pay`.
- Offline snapshot fallback exists.
- UI is styled as a panel/strip rather than plain cold text.
- HMAC signing exists server-side, but the client does not verify HMAC authenticity yet.

## Known / Open Items

### O-01 — Runtime verification
Status: OPEN / verification required.

Need real device/browser verification for:

- Pull-to-refresh gesture
- header scroll feel
- Cast receiver discovery and playback
- local offline video playback
- Android download quality and file integrity
- mobile responsive layout

### O-02 — Client Support Pay signature verification
Status: OPEN / architectural hardening.

Current public Worker can sign Support Pay payloads with HMAC-SHA256, but the browser cannot safely contain the HMAC secret. A future authenticity-verification design should use an asymmetric signing model with a public verification key in the client.

Do not put the HMAC secret into frontend code.

### O-03 — Build environment verification
Status: ENVIRONMENT-DEPENDENT.

`npm run lint`, `npm run build`, Android Gradle build, and `cap sync` must be run in an environment with dependencies available. A blocked network is not evidence of a source failure.

### O-04 — Generated Android assets
Status: CAUTION.

The repo contains prebuilt hashed web assets under `android/app/src/main/assets/public/`. Treat `src/` as source and regenerate Android web assets through the normal Capacitor build/sync pipeline rather than hand-editing hashed artifacts.

## Do Not Change Casually

- Worker URL and Worker identity
- Worker API contracts
- family YouTube key behavior
- 120-second rule
- 360p maximum download policy
- Support Pay source-of-truth model
- Bearer Admin authentication
- local/offline player separation
- playlist safety filtering

## Verification Labels

Use:

- PASS = actually tested
- SOURCE-OK = source-level verification only
- BLOCKED = test could not run because of environment/device/network
- FAIL = test ran and failed

Never upgrade SOURCE-OK or BLOCKED to PASS without evidence.

## Next Agent Should Do

1. Read `YoungTube_PROJECT_CONTEXT.md`.
2. Read this file.
3. Inspect the current working tree before editing.
4. Continue from the current code, not from an older ZIP.
5. After any modification, update this handoff with exact changed files and verification result.
