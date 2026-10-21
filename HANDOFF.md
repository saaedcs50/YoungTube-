# YoungTube — HANDOFF

## Current Baseline

- Repo: `saaedcs50/YoungTube-`
- Branch: `main`
- Base main HEAD before this PR: `b7c5e7b84ce4db730b9148c8ce0d3389346664ae`
- Proposed branch: `chore/deps-ci-20261021`
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

### Session 2026-10-06 (Download Integrity & Documentation Cleanup)

#### 1. Native Download Integrity Guard
- **File**: `android/app/src/main/java/app/youngtube/app/YoungTubeDownloaderPlugin.java`
- **What**: Added strict file validation after write: checks `bytesDownloaded > 0`, `destinationFile.exists()`, and `destinationFile.length() > 0`. If invalid or empty, cleans up the file and returns `{ ok: false, code: "EMPTY_FILE", message: "..." }`. On success, includes `bytesDownloaded: destinationFile.length()`.
- **Why**: Prevents reporting partial, corrupted, or 0-byte downloads as `done`.
- **Verification**: `SOURCE-OK` (syntax and structure verified; Android Gradle build `BLOCKED` due to lack of Java/Android SDK in web container).

#### 2. TypeScript Downloader Plugin Result Contract
- **File**: `src/plugins/youngtubeDownloader.ts`
- **What**: Added `'EMPTY_FILE'` to `DownloadResult` error code union.
- **Why**: Keeps client TypeScript definitions in exact sync with native plugin responses.
- **Verification**: `PASS` (`tsc --noEmit` and Vite build succeeded).

#### 3. Download Manager Local Path Integrity & Storage Validation
- **File**: `src/services/downloadManager.ts`
- **What**: Added path sanity check requiring non-empty trimmed string `cleanPath = result.path.trim()`. If `result.ok === true` but path is missing or empty, records download as `status: 'failed'` with code `'NATIVE_ERROR'` and returns structured failure. Handled `'EMPTY_FILE'` failure code cleanly.
- **Why**: Ensures Dexie never stores an invalid or blank path for completed downloads.
- **Verification**: `PASS` (`tsc --noEmit` and Vite build succeeded).

#### 4. Project Cleanup & Redundant Documentation Removal
- **Files**: Deleted `YoungTube_PROJECT_CONTEXT.md`, `YoungTube_CLOUDFLARE_WORKER_CONTEXT.md`, `YoungTube_HANDOFF.md`, `IMPLEMENTED_CHANGES.md`, `fix.py`, `server.ts`.
- **What**: Cleaned obsolete scripts and redundant prefixed markdown files, preserving only the canonical set: `PROJECT_CONTEXT.md`, `HANDOFF.md`, `WORKER_CLOUDFLARE.md`, `AI_REVIEW_INSTRUCTIONS.md`, `AGENTS.md`, `ARCHITECTURE.md`, `CHANNELS_MASTER.md`. Verified HEAD commit updated to `29fe861ad8456c7b59b4a7f3354027a3b8b4bdad`.
- **Verification**: `PASS` (filesystem verification, zero missing canonical files, preserved all CSVs and assets).

### Session 2026-10-06 (Canonical Local-First Playlist Architecture & Playback Integration)

- **HEAD**: `7a00cb81ad3491a977ff6642e3b93d63b10461f1`
- **What**:
  - **Dexie Schema v8**: Introduced normalized `childPlaylistItems` table (with compound index `&[playlistId+videoId]`, `[playlistId+position]`) and `playlistPlaybackSessions` table. Automated backward-compatible migration in `db.version(8).upgrade(...)` converting legacy `childPlaylists.videoIds[]` to individual items.
  - **Playlist Domain Services (`src/services/playlists/*`)**:
    - `playlistTypes.ts`: Strong typing for `PlaylistKind`, `PlaylistPlaybackContext`, `ResolvedPlaylistQueue`, `PlaylistItem`.
    - `playlistRepository.ts`: CRUD, atomic transactions, duplicate membership guard, position reordering (`reorderPlaylistItem`), and cascade deletion (`deletePlaylist`).
    - `playlistSafety.ts`: Strict child context gating (`canPlayVideoInChildContext`) checking hidden status, blocked channels, disabled channels, portrait mode, 120s duration threshold (with family key), and offline availability.
    - `playlistSelectors.ts`: Resolves item views (`resolvePlaylistItemViews`) with playable badges, safety reasons, and thumbnails.
    - `playlistService.ts`: Public API for saving/creating playlists with last-used tracking.
    - `playlistPlayback.ts`: Builds and resolves ordered playback queues (`resolvePlaylistQueue`) with shuffle support and safety-filtering.
  - **Player Integration (`src/screens/PlayerView.tsx` & `src/App.tsx`)**:
    - Full `PlaylistPlaybackContext` support. When launched from a playlist, the player uses the playlist items as the primary queue instead of recommendations.
    - Supports `loopMode` ('off' | 'item' | 'playlist'), shuffle, prev/next within playlist bounds, and natural end-of-playlist termination.
    - Passed playlist context down from `App.tsx` and `KidHomeScreen.tsx` to `FavoritesView.tsx` and `PlayerView.tsx`.
  - **UI Updates (`PlaylistManager.tsx` & `FavoritesView.tsx`)**:
    - `FavoritesView.tsx` separates Favorites from Playlists, displays item reordering (up/down), reason labels for unavailable items, "Play All", and "Shuffle".
    - `PlaylistManager.tsx` provides clean create/edit/manage actions backed by the repository.
- **Verification**:
  - `npm run lint` (`tsc --noEmit`): `PASS` (0 errors).
  - `npm run build` (`vite build`): `PASS` (production build compiled cleanly).
  - `bun.lock` absence: `PASS` (enforced invariant).

### Session 2026-10-06 (Player Add-to-Playlist Control & Safe Modal Integration)

- **What**:
  - **Player Controls Button (`id="player-control-add-to-playlist"`)**: Added "إضافة إلى قائمة تشغيل" button with `ListPlus` icon to Portrait player controls in the secondary group (ordered: Repeat -> Add to Playlist -> Download -> Cast -> Settings -> Love).
  - **Responsive 6-Column Layout**: Adjusted secondary controls container from flex to `grid grid-cols-6 gap-1 px-1` with `items-start justify-items-center` so all 6 action buttons remain visible, unclipped, and legible on mobile screens without overflowing.
  - **Landscape Support (`id="landscape-add-to-playlist-btn"`)**: Added `onAddToPlaylist` prop to `LandscapeShellProps` and rendered an add-to-playlist button in landscape mode. When clicked from fullscreen, it gracefully exits fullscreen first via `pendingPlaylistManagerOpen` and immediately opens the modal in portrait.
  - **Safe Isolated Modal Overlay (`id="player-playlist-manager-modal"`)**: Mounted `PlaylistManager` in `mode="add"` at the root of `PlayerView` (outside `player-portrait-gesture-layer`, `z-[85]`), preventing any touch/gesture conflict with playback, seeking, or video controls.
  - **Dynamic Video Binding**: Binds directly to `currentVideo.videoId` and `currentVideo.title` at the time of click, ensuring accuracy when navigating playlists or autoplaying subsequent videos.
  - **Playback Continuity**: Adding a video or creating a playlist from the modal saves directly to Dexie via `PlaylistManager` / `playlistService` with duplicate prevention and does not pause, seek, or restart current video playback.
- **Files Modified**:
  - `src/screens/PlayerView.tsx`
  - `src/screens/LandscapeShell.tsx`
- **Verification**:
  - `npm run lint` (`tsc --noEmit`): `PASS` (0 errors).
  - `npm run build` (`vite build`): `PASS` (production build compiled cleanly).
  - `bun.lock` absence: `PASS` (enforced invariant).

### Session 2026-10-06 (Local Typo-Tolerant Ranked Kid Search with Autocomplete)

- **What**:
  - **Shared Kid Search Service (`src/services/kidSearch.ts`)**:
    - Complete Arabic/English text normalization: stripping tashkeel/diacritics, unifying alef variants (`[أإآٱ] -> ا`), taa-marbuta (`ة -> ه`), yaa (`ى -> ي`), stripping tatweel, collapsing whitespace, while preserving Latin letters and numbers.
    - Tokenization & bounded Levenshtein typo tolerance (distance 1 for tokens 3-4 chars, distance 2 for tokens >= 5 chars; no false-positive fuzzy matches on < 3 chars).
    - Curated explicit alias map (`KID_SEARCH_ALIASES`) for approved kid topics/channels: Cosmic Kids Yoga (يوغا / yoga / يوجا), Numberblocks (نمبر / numberblocks / ارقام / حساب), Alphablocks (حروف / alphablocks / الفابلكس), Art for Kids Hub (رسم / تلوين / art for kids), Arabian Fairy Tales (حكاية / قصة / fairy / قصص), 5-Minute Crafts PLAY, Bluey, Blippi.
    - Single relevance ranking hierarchy: exact title (100) -> title prefix (90) -> title substring (75) -> channel prefix (65) -> channel substring (55) -> alias match (45) -> bounded fuzzy match (25-40), with +15 boost for saved/loved matches.
    - Ties broken deterministically by `videoId`.
    - Empty query preserves exact candidate feed order with zero shuffling or ranking overhead.
    - Local autocomplete suggestion engine (`getAutocompleteSuggestions`) operating strictly on local approved in-memory content (enabled channels, loaded feed videos, favorites, saved/loved), prioritizing strong channel matches and deduplicating by normalized text (max 7 items).
  - **Unified Feed Search Integration (`src/features/feed/useKidFeed.ts`)**:
    - Replaced fragmented `.toLowerCase().includes()` across in-feed search, saved/loved append, and `filteredFavorites` with `searchAndRankVideos`.
    - Preserved existing deep archive search (`/api/search-archive?q=...` fallback on `< 3` results) and category/suppression safety filters.
    - Exposed `searchSuggestions` from `useKidFeed`.
  - **Autocomplete Dropdown in Header (`src/features/feed/KidHeader.tsx`)**:
    - Implemented compact, RTL-friendly `#kid-search-autocomplete-dropdown` for both collapsed and expanded search views.
    - Bound to click-outside dismiss, Escape key handling, and immediate search execution upon suggestion selection.
    - Does not occlude favorites, downloads, or parent dashboard lock buttons.
  - **Home Screen Wiring (`src/features/feed/KidHomeScreen.tsx`)**:
    - Connected `searchSuggestions` and `onSelectSuggestion` callback to `KidHeader`.
- **Files Modified**:
  - `src/services/kidSearch.ts` (new)
  - `src/features/feed/useKidFeed.ts`
  - `src/features/feed/KidHeader.tsx`
  - `src/features/feed/KidHomeScreen.tsx`
- **Verification**:
  - `npm run lint` (`tsc --noEmit`): `PASS` (0 errors).
  - `npm run build` (`vite build`): `PASS` (production build compiled cleanly).
  - Focused test assertions via `tsx`: `PASS` (all normalization, Levenshtein, alias, ranking, and autocomplete assertions passed).
  - External search/suggest safety grep: `PASS` (zero external YouTube Search or Suggest endpoints introduced).
  - Worker unchanged: `PASS` (no edits to `worker/`).
  - `bun.lock` absence: `PASS` (enforced invariant).

### Session 2026-10-10 (Android Update & Install Identity Fix)
- **Problem**: Installing updated APKs over existing installs resulted in Android `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, forcing users to uninstall and wipe local data (Dexie IndexedDB, offline downloads, preferences).
- **Root Causes**:
  1. Default Gradle build on GitHub Actions runner built `assembleDebug` with ephemeral CI debug keystores.
  2. `android/app/build.gradle` had no release `signingConfig` defined.
  3. `versionCode` was statically hardcoded to `1`.
- **Changes**:
  1. **Consistent Application ID**: Preserved stable `app.youngtube.app` across `capacitor.config.ts`, `android/app/build.gradle`, and `AndroidManifest.xml`.
  2. **Monotonic Versioning**: Added dynamic `-PversionCode=N` and `-PversionName=x.y.z` (or env vars) support with default `versionCode 2` and clear bump instructions.
  3. **Release Signing Config**: Added robust `signingConfigs.release` reading from `android/signing.properties` or `YOUNGTUBE_KEYSTORE_*` environment variables, falling back to debug with a loud warning for local development.
  4. **CI Workflow Update (`.github/workflows/build-apk.yml`)**: Configured secret keystore decoding (`YOUNGTUBE_KEYSTORE_BASE64`), auto-incrementing `versionCode` via `github.run_number`, and building + uploading release APK artifacts.
  5. **Keystore Protection**: Ignored `*.jks`, `*.keystore`, and `signing.properties` in root and `android/.gitignore`; provided `signing.properties.example`.
  6. **Documentation**: Documented exact data preservation rules, ADB update commands, and the one-time migration requirement in `README.md`.

### Session 2026-10-21 (Music Classification Regression Fix — Muse Qualification Phase 2)

- **Branch**: `fix/music-classification-phrases`, based on `main` HEAD `3db2c22701778bb1884940685ff79a16d022a1b1`. Opened as a Draft PR for owner review; NOT merged, NOT deployed.
- **Why**: The title-based music classification existed as two duplicated copies of a two-phrase substring check (`'no music'` / `'بدون موسيقى'`) — one in the client archive sync, one in the Worker search-archive path. Explicit no-music claims in other attested spellings (e.g. «بدون موسيقا», «بلا موسيقى», «من دون موسيقى», "without music") were missed, so those videos were stamped `hasMusic=true` and hidden by the parental hide-music filter.
- **Changes**:
  - `shared/musicClassification.ts` (NEW): pure, dependency-free helper — `normalizeTitleForMusicMatch` (lowercase; strips Arabic diacritics U+064B–U+065F + U+0670 and tatweel U+0640; unifies أ/إ/آ→ا and ى→ي) and `hasExplicitNoMusicClaim` (normalized substring match against the explicit-claim phrase list: "no music", "without music", and بدون/بلا/من دون + موسيقى/موسيقا).
  - `src/filtering.ts`: the inline two-phrase block in `filterAndCacheVideos` now calls the shared helper. Boolean contract and default unchanged: `hasMusic = !hasExplicitNoMusicClaim(title)` — default stays `hasMusic=true`.
  - `worker/routes/public-read.ts`: the duplicated inline block in the search-archive path now calls the same shared helper. No other route behavior changed.
  - `tests/music-classification.test.mjs` (NEW, 7 tests) + `test:music` script in `package.json`: supported claim variants, the regression cases, normalization cases, ordinary titles keeping the default, ambiguous claims excluded, and an integration contract asserting both call sites consume the shared helper and the hardcoded phrase pair is gone.
- **Policy boundary (deliberate)**: «بدون إيقاع» (no rhythm), "vocals only", and «بدون مؤثرات موسيقية» do NOT classify as no-music in this phase — none of them proves the absence of music. NOTE for the taxonomy plan: the plan's §15 keeps these as distinct internal claim types (NO_RHYTHM_CLAIM / RHYTHM_ONLY / NO_INSTRUMENTS_CLAIM) proposed for the same visible family track in Catalog v2; the boolean `hasMusic` contract cannot express that distinction, so they remain out here. Revisit only under the v2 tri-state design.
- **Pre-fix evidence**: the old logic, run verbatim against the title matrix, returned `hasMusic=true` for «أنشودة أطفال بدون موسيقا», «أغاني أطفال بلا موسيقى», «أناشيد من دون موسيقى», and "Songs for Kids Without Music" (all explicit claims, all missed); post-fix the new suite passes all of them as detected claims.
- **Verification** (Node 24.20.0, npm 10.9.4, this sandbox): `npm run test:music` PASS (7/7); `npm run test:navigation` PASS (13/13); `npm run test:parent-inbox` PASS (10/10); `npm run lint` PASS; `npm run typecheck:worker` PASS; `npm run build` PASS; `git diff --check` PASS.
- **Not tested / limitations**: No Android build (unchanged client logic only; web build verified). No production call, deployment, or data mutation occurred. A title claim is the publisher's statement, not audio analysis — this fix detects claims, it cannot verify the actual audio. Feed/portrait/duration/Shorts logic untouched.

## Next Agent Should Do

1. Read `PROJECT_CONTEXT.md`, `HANDOFF.md`, and `AI_REVIEW_INSTRUCTIONS.md` before making any edits.
2. Inspect the current working tree on disk before planning changes.
3. Continue from current files; never re-create deleted components or revive older ZIP archives.
4. Verify any code modification with `lint_applet` and `compile_applet`.
5. Maintain the invariant: delete `bun.lock` if generated by tooling.
6. Update this `HANDOFF.md` file immediately upon completing any new modification.

## Dependency and CI Hardening — 2026-10-21

- Raised the declared Vite range to ^6.4.4 and refreshed the npm lockfile for the security fix.
- The Android build workflow now blocks before build on navigation tests, parent-inbox contract tests, application TypeScript checking, and Worker TypeScript checking.
- Added Quality Checks on pull requests targeting main. It runs dependency installation, those checks, and the web build with contents: read and checkout credential persistence disabled.
- The pull-request workflow does not deploy, sign, upload artifacts, or access repository secrets.
- Validation (isolated sandbox, Node 24.21.0/npm 11.19.0): npm ci PASS; navigation tests 13/13; parent-inbox tests 10/10; application TypeScript check PASS; Worker TypeScript check PASS; web build PASS. Android Gradle/APK compilation was not run. npm audit still reports three moderate findings involving the existing @capacitor/cli -> xcode -> uuid chain; uuid@7.0.3 remains an acknowledged residual and is not overridden here.

### Session 2026-10-21 (Phase 2.1 — Unicode Phrase Boundaries)

- **Scope**: follow-up to the existing Draft PR #2 only. No change to main, feed visibility, portrait checks, duration filtering, Shorts detection, or Catalog v2.
- **Defect**: the shared helper's normalized substring matching could treat a phrase prefix as an explicit no-music claim (for example, `without music` inside `Without Musical Instruments`, or `بدون موسيقي` at the beginning of `بدون موسيقيين`).
- **Implementation**: `shared/musicClassification.ts` now compiles escaped configured phrases with Unicode-aware boundaries. Each phrase must start/end at the string edge or next to a character that is not a Unicode letter (`\p{L}`) or number (`\p{N}`). No `\b`, lookbehind, new dependency, or normalization-policy change. Existing Arabic diacritic/tatweel and spelling normalization is preserved.
- **Consumers**: both `src/filtering.ts` and `worker/routes/public-read.ts` still use `hasExplicitNoMusicClaim`; the shared helper remains the single phrase-classification source of truth.
- **Regression coverage**: the suite has 12 tests. Five new tests cover punctuation/end-of-string positives, English/Arabic prefix false positives, a test-only reproduction of the old substring bug, normalization separately from classification, and the `hasMusic` boolean contract. The test-only old matcher demonstrates all four required false positives before the fix; the shared helper rejects them. Existing ambiguous claims remain negative.
- **CI**: `.github/workflows/quality.yml` now runs `npm run test:music` after the parent-inbox test. The quality workflow remains PR checks only; no deploy step was added.
- **Verification evidence**: Muse's Phase 2.1 workspace report recorded `npm run test:music` 12/12, `test:navigation` 13/13, `test:parent-inbox` 10/10, `npm run lint`, `npm run typecheck:worker`, `npm run build`, `git diff --check`, and `actionlint` as passing on its local working tree. This API-side session could not access that checkout, so those local results are not represented as a fresh run against the newly updated remote head. A focused runtime matrix against the same boundary algorithm in this session produced 13/13 expected positive claims and 12/12 expected negative titles. Wait for the new-head GitHub Actions result before treating the remote branch as fully verified.
- **Cloudflare gate**: live control-plane inspection found Worker `youngtube-worker` production at 100% on version 201 before these branch updates. Workers Builds configuration for the Worker tag `c9815ee2eab1432e92be5fdad33a54b6` has a non-production trigger named `Deploy non-production branches`, excludes `main`, and uses `npx wrangler versions upload`; the separate `main` trigger uses `npx wrangler deploy`. The observed branch build for commit `405cdd16` was successful and upload-only. Uploading a version is not a production deployment.
- **Remote changes**: only the existing branch `fix/music-classification-phrases` was updated. No new PR was created. PR #2 is to remain open, Draft, and unmerged. Production deployments, production traffic, secrets, Cloudflare settings, and application data were not intentionally changed.
- **Remaining limitation**: title claims are publisher metadata, not audio verification. Confirm the PR status and CI runs for the final branch head after this update.
