# Account Navigation Consolidation — Design

Date: 2026-11-23  
Scope: UNFOLD React client UI only. No backend, route, auth, or data-model changes.

## Problem

Account navigation is duplicated across four surfaces:

1. Top-right profile dropdown — `Profile & settings`, `Log out`
2. Bottom-left sidebar account card — same dropdown menu and actions
3. Sidebar `MORE` section — `Settings`, `Log out`
4. Right-rail contribution card — `Manage profile`; Settings view — `Log out of Unfold`

This creates visual noise, repeated actions, and unclear ownership. The app has only one real destination for account/profile editing: the existing `Settings & Profile` view (`activeView === "settings"`).

## Goals

- One consistent account identity presentation wherever the user appears.
- One clear entry point for Settings and Logout: sidebar `MORE`.
- Header profile dropdown focuses on account details and profile-related action only.
- No unsupported pages, routes, or backend calls.
- Menus behave correctly with mouse, keyboard, outside click, and at all breakpoints.

## Non-goals

- No new profile page or route.
- No changes to registration, login, JWT validation, session storage, profile API, logout logic, community data, posts, voting, comments, theme, or launch sequence.
- No new dependencies or icon library.

## Architecture

### Components

- `client/src/components/dashboard/AccountMenu.jsx`
  - Export a small shared `AccountIdentity` presentation used by both the header trigger and the sidebar footer.
  - Retain one dropdown implementation for the header only.
  - Remove Settings and Logout from the header dropdown.
  - Header menu contents:
    - account identity head (avatar, username, email/subtitle)
    - `Edit profile` action using `user`/`fileText` icon
  - Keep outside-click and Escape dismissal.
  - Keep `aria-expanded`, `aria-haspopup`, and `role="menu"` semantics on the real menu.

- `client/src/components/dashboard/TopNavigation.jsx`
  - Replace `onNavigateSettings` with `onEditProfile` for the profile menu.
  - Stop passing `onLogout` to the account menu.

- `client/src/components/dashboard/Sidebar.jsx`
  - Replace the footer `AccountMenu` dropdown with a static `AccountIdentity` card.
  - Remove the footer chevron and menu state.
  - Keep `MORE > Settings` and `MORE > Log out` unchanged as the only entry points.

- `client/src/components/dashboard/RightSidebar.jsx`
  - Remove the `Manage profile` button and its `onNavigateSettings` prop.

- `client/src/components/SettingsView.jsx`
  - Remove the `Log out of Unfold` button and `onLogout` prop.

- `client/src/App.jsx`
  - Pass `onEditProfile={navigateSettings}` to `TopNavigation`.
  - Stop passing `onLogout` to `TopNavigation` and `SettingsView`.
  - Stop passing `onNavigateSettings` to `RightSidebar`.
  - Keep `navigateSettings`, `logout`, profile save, and theme handlers unchanged.

### Data flow

- Clicking header avatar → `AccountMenu` toggles → `Edit profile` → `onEditProfile()` → `navigateSettings()` → `activeView = "settings"` → `SettingsView` renders.
- Clicking `MORE > Settings` uses the same `navigateSettings()` handler.
- Clicking `MORE > Log out` uses the same `logout()` handler.
- Profile save still calls `PATCH /auth/profile` through `SettingsView`; logout still clears the local session through `App`.

### Styling

- Reuse existing palette tokens and icon system.
- Replace footer menu-specific CSS with a static identity card: avatar, name, email, aligned left, no chevron.
- Remove unused `.user-menu--footer`, `.user-menu-wrap--footer`, and `.user-menu-trigger.is-footer` rules.
- Keep the header trigger compact; on narrow screens hide the header name/email as today, while the footer card remains readable.
- Preserve focus rings, hover states, dark theme rules, and reduced-motion behavior.

## Error handling

- No new error paths. Existing auth-expired and profile-save errors remain unchanged.
- If `user.email` is absent, the identity subtitle falls back to `@username` or `Community member` as currently implemented.

## Testing

- `npm run build` in `client`.
- Browser checks:
  - Header menu opens by click, closes by outside click and Escape.
  - Header menu contains account details and `Edit profile`, and contains no Settings/Logout.
  - `Edit profile` opens Settings & Profile.
  - Sidebar footer is static and has no menu/chevron.
  - Sidebar MORE contains the only Settings and Log out controls.
  - Settings save still updates the user.
  - Logout from MORE clears the session and returns to auth.
  - Desktop, tablet, and mobile layouts have no overflow; header and footer identity align correctly.
  - No console errors.
