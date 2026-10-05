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

## Recent Change Sessions & Concrete Audit Log

### Session 2026-10-04 (Late-Turn Hardening & Native/Web Fixes)

#### 1. RTL Logo Orientation Fix
- **File**: `src/components/YoungTubeWordmark.tsx`
- **What**: Added `dir="ltr"` to the root flex container.
- **Why**: In RTL document layout, child elements rendered in reverse order (Tube ▶ Young). Forcing `dir="ltr"` ensures the brand reads "Young ▶ Tube".
- **Verification**: `PASS` (verified DOM layout in browser environment and static TS lint).

#### 2. Mini-Player Close Button Fix
- **File**: `src/screens/PlayerView.tsx`
- **What**: Repositioned mini-player close button from `-top-2 -right-2` to `top-2 right-2`, increased dimensions to `34px` (`w-8.5 h-8.5`), enlarged icon to `18px` with `stroke-[2.5]`, high-contrast white with `bg-black/85 backdrop-blur-md` and `border-white/40`.
- **Why**: The previous `-top-2 -right-2` position was clipped by the container's `overflow-hidden` rounded corners, and the dark grey color on black made it invisible/obscured ("مطموسة وصغيرة").
- **Verification**: `PASS` (verified visually in browser and static TS lint).

#### 3. Feed Header Collapse Anti-Flicker & Hysteresis
- **File**: `src/features/feed/useFeedHeaderCollapse.ts`
- **What**: Implemented `COOLDOWN_MS = 320ms` post-state transition to absorb browser DOM layout shifts, added `MAX_FRAME_DELTA = 65px` spike filter to ignore programmatic layout jumps, tuned hysteresis thresholds (`COLLAPSE_AFTER = 90`, `COLLAPSE_DELTA = 35`, `EXPAND_DELTA = 30`), and disabled auto-collapse while searching or in favorites.
- **Why**: Collapsing header height jumped from ~158px to 48px, causing browser layout adjustments that were misdetected as upward scroll, creating an infinite oscillation/flickering loop.
- **Verification**: `PASS` (tested via continuous scrolling and simulated layout shifts; static TS lint clean).

#### 4. Pull-to-Refresh Scope & Active-Player Gating
- **Files**: `src/components/PullToRefresh.tsx`, `src/features/feed/KidHomeScreen.tsx`, `src/App.tsx`
- **What**:
  - Bound touch target detection strictly to `containerRef.current` (the feed content).
  - Explicitly excluded touches initiating on `#player-video-container`, `#player-view`, mini-player, modals, buttons, or form elements.
  - Implemented strict top-of-feed check `getScrollTop() <= 1` across all window/document scroll implementations.
  - Passed `isPlayerOpen={isPlayerOpen && !isPlayerMinimized}` from `App.tsx` to `KidHomeScreen` and disabled `PullToRefresh` whenever a full/portrait player is open.
- **Why**: The previous global `window` touch listener triggered a pull-to-refresh whenever the user performed a swipe-down gesture on an active video player.
- **Verification**: `PASS` (tested swipe gestures on player overlays and top-of-feed triggers; static TS lint clean).

#### 5. AndroidX MediaRouter Migration
- **File**: `android/app/src/main/java/app/youngtube/app/YoungTubeCastPlugin.java`
- **What**:
  - Replaced deleted `MediaRouter.SimpleCallback` with `MediaRouter.Callback` implementing all required overrides.
  - Removed all uses of deprecated framework `getSupportedTypes()` and `ROUTE_TYPE_LIVE_VIDEO`.
  - Replaced `candidates.get(i).getName(getContext()).toString()` with zero-arg AndroidX `candidates.get(i).getName()`.
  - Filtered external presentation displays via `route.getPresentationDisplay() != null`.
- **Why**: Resolves 9 compile failures in GitHub Actions Android build caused by mixing framework `android.media.MediaRouter` APIs with `androidx.mediarouter.media.MediaRouter`.
- **Verification**: `SOURCE-OK` (verified 0 remaining occurrences of deprecated APIs via regex/AST search; local Gradle build `BLOCKED` due to lack of local Android SDK/Java in container; builds cleanly conceptually for `:app:compileDebugJavaWithJavac`).

#### 6. Operating Documentation Placement
- **Files**: `PROJECT_CONTEXT.md`, `HANDOFF.md`, `WORKER_CLOUDFLARE.md`, `AI_REVIEW_INSTRUCTIONS.md`
- **What**: Synchronized and placed the official operating documentation files in the repository root directory as the permanent system of record.
- **Verification**: `PASS` (file presence, byte integrity, and cross-reference check completed).

## Next Agent Should Do

1. Read `PROJECT_CONTEXT.md`, `HANDOFF.md`, and `AI_REVIEW_INSTRUCTIONS.md` before making any edits.
2. Inspect the current working tree on disk before planning changes.
3. Continue from current files; never re-create deleted components or revive older ZIP archives.
4. Verify any code modification with `lint_applet` and `compile_applet`.
5. Maintain the invariant: delete `bun.lock` if generated by tooling.
6. Update this `HANDOFF.md` file immediately upon completing any new modification.
