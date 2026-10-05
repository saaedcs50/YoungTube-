# YoungTube — PROJECT_CONTEXT

## 0. Purpose

YoungTube is a child-focused YouTube filtering application. It provides a controlled child feed backed by an approved channel/content archive, local Dexie storage, optional family-owned YouTube Data API quota for duration filtering, Android-native downloads, offline playback, a parent dashboard, telemetry, support-pay display, and child playlists.

This file is generated from direct inspection of the current GitHub `main` branch and the current project source tree. It is NOT based on old ZIP snapshots.

## 1. Current Source-of-Truth Baseline

- Repository: `saaedcs50/YoungTube-`
- Branch: `main`
- Current HEAD: `d38e6faae81b00660839d221f501f4c30f5a92c6`
- HEAD commit message: `fix: update MediaRouter callback implementation`
- Previous commit: `7e48617b962094cc5950b3ae233a7cdd2e0e2c51`
- Primary app root: repository root
- Frontend entry: `src/main.tsx`
- Main React shell: `src/App.tsx`
- Android/native project: `android/`
- Worker source: `worker/`
- Worker entry: `worker/index.ts`
- Worker config: `wrangler.toml`

## 2. Stack

- React 19
- TypeScript 5.8.x
- Vite 6.x
- Tailwind CSS 4.x
- Capacitor 8.5.2
- Dexie 4.x / IndexedDB
- react-youtube
- lucide-react
- Motion
- PWA via `vite-plugin-pwa`
- Android native integrations in Java
- Cloudflare Worker + KV + Durable Objects

## 3. Build Scripts

`package.json` currently exposes:

- `npm run dev` → Vite dev server on port 3000
- `npm run build` → `vite build`
- `npm run cap:sync` → build then `npx cap sync android`
- `npm run preview` → Vite preview
- `npm run clean` → remove `dist`
- `npm run lint` → `tsc --noEmit`

## 4. Main Runtime Architecture

### React application

`src/App.tsx` is the global state/router shell. It owns:

- onboarding/welcome state
- parent PIN/dashboard lock state
- kid vs dashboard vs dev view mode
- player open/fullscreen/minimized/settings-sheet state
- browser history handling for player layers
- session timer integration
- announcements loading
- worker/storage health checks
- lazy loading of heavy dashboard/player surfaces

### Kid feed

Main feature area:

- `src/features/feed/KidHomeScreen.tsx`
- `src/features/feed/KidHeader.tsx`
- `src/features/feed/useFeedHeaderCollapse.ts`
- `src/features/feed/useKidFeed.ts`
- `src/features/feed/CategoryChips.tsx`
- `src/features/feed/FeedVideoGrid.tsx`
- `src/features/feed/FavoritesView.tsx`
- `src/components/PullToRefresh.tsx`

### Player

- `src/screens/PlayerView.tsx`
- `src/components/PlayerSeekBar.tsx`
- `src/components/PlayerSettingsSheet.tsx`
- `src/services/castService.ts`

Player supports YouTube playback and local downloaded-file playback.

### Parent dashboard

- `src/components/dashboard/DashboardShell.tsx`
- `src/components/dashboard/DashboardNav.tsx`
- `src/components/dashboard/TimerSection.tsx`
- Child profile/settings/filtering/taste-shift/channel/admin-support surfaces

The current parent dashboard navigation does NOT expose a dedicated analytics tab. Analytics/telemetry UI is in the separate admin application.

### Local storage

`src/db.ts` uses Dexie database `KidsYouTubeDB`.

Current schema is version 7.

Stores include:

- `settings`
- `channels`
- `usage`
- `feedCache`
- `interactions`
- `downloads`
- `dailySummaries`
- `customCategories`
- `tasteShiftEvents`
- `childPlaylists`

## 5. Critical Product Rules

### Family YouTube API key

`src/services/youtubeApiKey.ts`:

- reads `settings.familyYoutubeApiKey`
- sends it only as `X-Family-Youtube-Key`
- does NOT fall back to the server's `YOUTUBE_API_KEY`
- server/admin key is not exposed through this client service

### Duration policy

`src/filtering.ts`:

- minimum duration constant: 120 seconds
- duration filtering is OPT-IN when the family key exists
- without family key, unknown duration can remain allowed
- with family key, unresolved duration is fail-closed during ingestion
- unknown duration lookups are capped per channel
- failed duration API handling avoids unsafe pruning

The current cache read path in `src/features/feed/useKidFeed.ts` and queue filtering in `src/screens/PlayerView.tsx` check the family-key state before excluding cached rows under 120 seconds.

### Shorts

The filtering layer rejects Shorts-like titles using token/hashtag rules without treating ordinary phrases such as `short story` as Shorts automatically.

### Portrait / vertical videos

Known `isPortrait === true` rows are excluded.

Portrait detection is performed from YouTube thumbnail/frame information in the filtering layer. Errors/timeouts do not fabricate a positive portrait classification.

### Blacklist / hidden / block rules

Feed filtering combines:

- manual hidden video state
- title blacklist words
- known portrait state
- global blocked channel/playlist IDs
- enabled/disabled channel state
- family-duration rule when enabled
- music preference logic
- category selection
- taste-shift logic

### Feed archive / compact public data

The Worker public `channels-latest` path serves a compact recent window while preserving a separate `videoCount` value. The client must not infer total archive length only from the compact `videos` array.

`feedCache` pruning is intentionally conservative so a compact public response does not wipe valid local rows.

## 6. Child Feed Header

Current implementation:

- `KidHeader.tsx` has expanded and collapsed states.
- `useFeedHeaderCollapse.ts` implements scroll-direction and hysteresis logic.
- Near the top, the header expands.
- Deliberate downward scroll collapses it.
- Deliberate upward scroll expands it again.
- Small scroll jitter is ignored.
- Large programmatic/layout jumps are filtered.
- A cooldown absorbs layout-shift feedback after a transition.

The header keeps child actions such as search, favorites, downloads and parent-dashboard entry.

## 7. Pull-to-Refresh

`src/components/PullToRefresh.tsx` is integrated around the child feed.

Current behavior:

- starts only at top of page
- requires single-touch
- ignores buttons/forms/player/modal interactions
- has a threshold before refresh fires
- invokes `loadVideos(false)` from the kid feed
- refresh intentionally re-shuffles the approved local feed pool

This feature exists in source; physical device behavior still requires real-device verification.

## 8. Child Playlists

Implemented through:

- Dexie `childPlaylists` store (schema version 7)
- `src/components/PlaylistManager.tsx`
- `src/features/feed/FavoritesView.tsx`
- `src/components/VideoCard.tsx`
- `src/screens/PlayerView.tsx`

Supported actions:

- create playlist
- rename playlist
- delete playlist
- add current feed video to playlist
- add current player video to playlist
- remove video from playlist
- browse playlists inside Favorites
- filter playlist content using safety/feed rules

Playlist data is local to the device/app database. There is no server playlist sync in the current architecture.

## 9. Favorites

Favorites and child playlists share the Favorites surface.

The current Favorites surface can:

- display liked videos
- search visible favorites
- show playlists
- manage playlists
- open a playlist and show its safe cached videos
- add videos to playlists

## 10. Downloads

Java native implementation:

- `android/app/src/main/java/app/youngtube/app/YoungTubeDownloaderPlugin.java`
- `android/app/src/main/java/app/youngtube/app/OkHttpDownloader.java`

JS bridge:

- `src/plugins/youngtubeDownloader.ts`
- `src/services/downloadManager.ts`

Current quality rule:

- progressive stream selection is capped at 360p
- exact 360p is preferred
- best stream under 360p is fallback
- streams above 360p are rejected
- if no eligible progressive stream exists, download fails clearly

Download records contain status/path/progress metadata in Dexie.

Deletion removes the native file and corresponding DB record.

## 11. Offline Playback

`PlayerView.tsx` uses the native/local downloaded path when available and converts it through Capacitor for HTML5 video playback.

The local-video path is distinct from the YouTube component path. A local playback error is surfaced rather than silently pretending the download is playing.

Offline completion still needs real-device runtime testing.

## 12. Casting

Current implementation spans:

- `src/services/castService.ts`
- `src/screens/PlayerView.tsx`
- `android/app/src/main/java/app/youngtube/app/YoungTubeCastPlugin.java`
- `android/app/src/main/java/app/youngtube/app/CastOptionsProvider.java`
- `android/app/src/main/java/app/youngtube/app/MainActivity.java`

Android dependencies include:

- AndroidX MediaRouter
- Google Play Services Cast Framework 22.3.1
- NewPipe Extractor 0.26.5
- OkHttp 4.12.0

Current cast design has two paths:

1. Google Cast Framework / Default Media Receiver flow.
2. Android MediaRouter external-display fallback using a Presentation.

The code resolves a YouTube stream natively for casting. Browser-side Cast code can detect Google Cast APIs when the environment provides them.

Important limitation:

A generic promise of “every TV/laptop/car screen” is not implementable as one universal protocol. Actual support depends on the receiving device/protocol. Current code explicitly targets Google Cast-compatible receivers and Android external displays. Real-device matrix testing remains required.

## 13. Support Pay

Public client:

- `src/services/supportPay.ts`
- endpoint: `/api/support-pay`
- uses `cache: 'no-store'`
- falls back to a local snapshot when network access fails
- stores the returned payload in `localStorage` under the support snapshot key

Current client code does NOT verify the returned HMAC signature. The signing secret is correctly not embedded in the client. This remains an architecture/security limitation if client-side authenticity verification is required.

UI:

- `SupportPayStrip.tsx`
- `SupportPayPanel.tsx`
- Onboarding also includes the support-pay panel.

## 14. Parent Dashboard Lock

`App.tsx` keeps an explicit `isDashboardUnlocked` state.

The current dashboard close path calls `handleLockDashboard`, preventing reopening the parent dashboard without re-entering the PIN.

## 15. Security / Privacy Source Checks

Current source search did not find:

- `dangerouslySetInnerHTML`
- `X-Admin-Key`
- `key=ADMIN_KEY`
- old `lowestAbove360` downloader fallback
- `allowBackup="true"`

Admin authentication is Bearer based on the Worker contract.

Do not add secrets, payment data, or real personal values to source code, tests, README, sample env files, or constants.

## 16. Generated / Bundled Android Web Assets

The repository contains prebuilt web assets under:

`android/app/src/main/assets/public/`

There are duplicated hashed JS asset variants for several components. Treat the `src/` application source as authoritative; bundled assets are generated artifacts that should normally be regenerated by the build/sync pipeline rather than manually edited.

## 17. Existing Documentation Files

Current repository also has:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `IMPLEMENTED_CHANGES.md`
- `README.md`
- `CHANNELS_MASTER.md`

Those files can help orientation, but current code and this context file remain the primary handoff reference.

## 18. Current Verification State

Static/source verification is strong for the rules listed above.

The following require runtime/device verification before being marked PASS:

- actual Vite production build
- Android Gradle build in a fully provisioned environment
- real Android download at 360p or lower
- completed downloaded file playback offline
- Google Cast real-device flow
- MediaRouter external-display flow
- Pull-to-refresh gesture on Android WebView
- all browser/viewport responsive behavior
- live Worker HTTP probes from an environment with working DNS/network

Do not mark these PASS just because the source compiles conceptually.

## 19. Change Discipline

Before modifying this project, read:

1. `PROJECT_CONTEXT.md`
2. `HANDOFF.md`
3. `CHANGELOG.md` if present

After every meaningful change, update the handoff/context records with the exact files touched, what changed, what was tested, and what remains uncertain.
