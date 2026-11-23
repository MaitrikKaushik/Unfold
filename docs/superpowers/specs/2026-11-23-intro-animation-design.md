# Intro Animation & Splash Redesign — Design

Date: 2026-11-23  
Scope: client launch overlay only. No routes, backend, auth, or product features change.

## Problem

The launch sequence should feel like a deliberate product reveal rather than a static logo card. The previous version used an uppercase letter stage and a separate splash treatment, which read as two unrelated screens and did not preserve the lowercase brand identity.

## Goals

- Lowercase `unfold` is the primary wordmark during the reveal.
- The actual app icon appears first, then the wordmark is written in one letter at a time.
- The completed mark holds and pushes toward the viewer, becoming the transition into the splash.
- The splash is an editorial product screen with clear hierarchy, not a generic loading panel.
- Keep `Community, Earned.` and `Connecting ideas. Building communities.`
- Preserve Skip Intro, Escape, reduced motion, responsive behavior, and the existing auth flow.
- Avoid flashes, layout jumps, duplicate splash renders, and unnecessary motion.

## Sequence

1. **Brand reveal**
   - Opaque forest-green field from the first frame.
   - Lime app icon scales and fades in.
   - `u n f o l d` reveal sequentially through a soft moving ink edge. Each glyph remains real text in the existing Manrope wordmark, so the finished logo keeps the exact brand typography.
   - Completed wordmark holds for a short beat.

2. **Camera push**
   - The same icon + wordmark lockup scales past the viewport.
   - The splash resolves underneath during the second half of the push.
   - The wordmark retires only after it is fully transparent, so the splash never restarts or appears twice.

3. **Splash**
   - Small icon + lowercase wordmark anchor at the top left.
   - Large two-line `Community, Earned.` statement.
   - Supporting line below the statement.
   - Minimal `Preparing your space` progress rail at the bottom.
   - Skip Intro stays available without overlapping the progress rail.

4. **Dashboard reveal**
   - Overlay fades out while the existing staggered app entrance plays underneath.

## Components

- `LaunchBrand.jsx`
  - Renders the real `UnfoldLogo` icon and six live text glyphs.
  - Accepts `zooming` to trigger the push-through animation.

- `WordmarkStage.jsx`
  - Hosts the reveal lockup.

- `SplashStage.jsx`
  - Renders the editorial splash composition and loading rail.

- `LaunchSequence.jsx`
  - Forward-only state machine: `brand → zoom → splash → exit`.
  - Mounts the splash during the zoom and keeps it mounted through the splash and exit, preventing duplicate entrances.
  - Keeps watchdog, Skip Intro, Escape, scroll lock, and `onExitStart` / `onComplete` contracts.

- `launch.css`
  - Opaque forest field with restrained ambient light.
  - Icon scale-in, per-letter ink reveal, zoom-through, splash reveal, and progress rail.
  - Responsive composition at mobile, tablet, desktop, and short viewports.
  - Reduced-motion fallback shows the completed brand and splash without camera movement.

## Constraints

- Palette stays `#23321D`, `#D9F36A`, and the existing off-white text values.
- No new dependencies, routes, backend calls, or icon libraries.
- No changes to application features, authentication, or data loading.
- The launch overlay only runs during the initial app startup.

## Testing

- `npm run build`.
- Browser checks: icon first, per-letter reveal, completed hold, zoom, single splash mount, skip at each act, Escape, responsive widths, no overflow, no console errors, and dashboard entrance.
