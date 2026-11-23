# Intro Animation & Splash Redesign — Design

Date: 2026-11-23  
Scope: client launch overlay only. No routes, backend, auth, or product features change.

## Problem

The current first intro stage uses oversized uppercase `UNFOLD` letter animation, while the second stage uses a different logo/wordmark treatment. This reads as two unrelated screens and conflicts with the lowercase brand identity.

## Goals

- Lowercase `unfold` is the primary wordmark on both intro screens.
- One centered lockup shared by both stages: actual app icon above the lowercase wordmark.
- Keep `Community, Earned.` and `Connecting ideas. Building communities.`
- Dark forest background with one subtle lime ambient glow.
- Refined loader with a small `Preparing your space` status label.
- Smooth staging into the real app with no flash or layout jump.

## Components

- `client/src/components/launch/LaunchBrand.jsx` (new)
  - Shared lockup: `UnfoldLogo size="xl" withText`.
  - Optional tagline/support/loader props so both stages use the same geometry.

- `WordmarkStage.jsx`
  - Replaces letter-split uppercase heading with `LaunchBrand` (icon + lowercase wordmark only).

- `SplashStage.jsx`
  - Uses `LaunchBrand` with tagline, support line, loader, and status.

- `LaunchSequence.jsx`
  - Keep timing, watchdog, skip, Escape, and overlay exit contract unchanged.
  - Update screen-reader status copy to lowercase brand wording.

- `launch.css`
  - Replace heavy gradients/blur with one restrained lime radial glow.
  - Add overlay fade-in and staggered icon/wordmark/tagline/loader animations.
  - Restyle loader as a slim indeterminate lime progress pill.
  - Keep Skip Intro accessible and minimal.
  - Preserve `.app-entering` dashboard entrance rules.
  - Preserve reduced-motion static presentation and responsive scaling.

## Constraints

- Palette stays `#23321D`, `#D9F36A`, and the existing off-white text values.
- No new dependencies, routes, or backend calls.
- Existing intro duration, auth verification in parallel, and skip behavior remain intact.

## Testing

- `npm run build`.
- Browser checks: both stages, Skip Intro, Escape, loader/status, reduced-motion, desktop/mobile, no console errors, and dashboard entrance without flash.
