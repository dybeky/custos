# Desktop Profile page + in-app avatar change — Design

_Date: 2026-06-24 · Repos: `custos` (Electron desktop), `custosweb` (Next.js backend)_

## Goal

Move the account surface out of the header dropdown and into a dedicated **Profile
page** reached from the left sidebar, and let users **change their profile picture
from inside the app** (crop/zoom before upload), not only on the website.

## Decisions (from brainstorming)

- Header avatar **stays top-right** but becomes a button that **navigates to
  `/profile`**. The header dropdown is **removed**.
- Account content lives on a **full Profile page** (`/profile`), reached from a new
  left-sidebar **person** icon or the header avatar.
- Changing the picture uses a **crop/zoom** step (`react-easy-crop`) before upload.
- **No UID** anywhere in the desktop app — the `#<uid>` only matters on the website.
- In-app upload needs a **new bearer-authed web endpoint**; the existing web
  `/api/profile/avatar` rejects desktop tokens by DAL scope-guard.

## Architecture

### custos (desktop)

- **Routing** (`App.tsx`): add `<Route path="/profile" element={<Profile />} />`.
- **Sidebar** (`components/layout/Sidebar.tsx`): add a Profile nav item (person
  icon) → `/profile`, following the existing `NavItem` pattern.
- **UserMenu** (`components/auth/UserMenu.tsx`): authed state becomes a single
  avatar **button** that navigates to `/profile` (via `useNavigate`). Remove the
  dropdown, the role/UID rows, and the outside-click handler. Anonymous state
  (Sign-in button + `LoginModal`) is unchanged.
- **Profile page** (`pages/Profile.tsx`): large `Avatar` + `RoleName` + role badge
  (**no UID**); **Change picture**, **Open profile on web**, **Sign out**. Reuses
  `roleInfo`, `Avatar`, `RoleName`, `window.electronAPI`.
- **Crop modal** (`components/auth/AvatarCropModal.tsx`): wraps the shared `Modal`;
  `react-easy-crop` square cropper (drag-pan + zoom slider). On confirm, draws the
  crop region to a canvas → `toBlob('image/webp')` (downscaled to ≤512²) →
  `ArrayBuffer` → IPC.
- **Token isolation preserved**: the renderer never sees the bearer. It sends the
  cropped bytes to **main** via a new IPC channel `auth:upload-avatar`; main
  attaches the bearer and uploads.
- **Main**: `AuthClient.uploadAvatar(bytes)` POSTs multipart to
  `${webBaseUrl}/api/desktop/profile/avatar` with `Authorization: Bearer`. On
  success, `AuthService` re-runs a session refresh (`getSession`) so
  `avatarVersion` bumps and the new state is emitted → avatar updates everywhere.
- **Preload**: expose `uploadAvatar(bytes): Promise<{ ok: boolean; error?: string }>`.

### custosweb (backend)

- **`POST /api/desktop/profile/avatar`**: gated by `isDesktopAuthEnabled()`;
  authenticates the **desktop bearer** via the DAL's desktop-allowed resolver
  (the same one get-session-style desktop routes use); rate-limited
  (`avatar:<id>`, reuse the web limit); validates size (≤4 MB) + decoded type via
  `sharp`; `resize(256,256, cover)` → webp(82); `putAvatar` + bump `avatarVersion`.
  A near-copy of `app/api/profile/avatar/route.ts`, bearer-authed instead of cookie.

## Data flow (change picture)

1. Renderer: `<input type=file accept=image/*>` → File → object URL.
2. Crop modal: user pans/zooms → confirm → canvas → webp Blob → ArrayBuffer.
3. IPC `auth:upload-avatar` → main.
4. Main: `AuthClient.uploadAvatar` POSTs multipart (bearer) → web endpoint.
5. Web: sharp resize → store → bump `avatarVersion`.
6. Main: refresh session → emit new `AuthState` → `Avatar` re-renders (version-keyed).

## Error handling

- Non-image / too-large / decode-fail → endpoint returns 4xx; surfaced in the modal.
- Upload offline / 401 → modal shows a friendly error; no state change.
- Rate-limited (429) → modal shows "try again later".

## Testing

- **custos**: Sidebar renders the Profile item; UserMenu (authed) navigates to
  `/profile` and shows no dropdown/UID; Profile page renders identity + 3 actions
  with no UID; crop helper produces a square blob; auth-store refreshes avatar after
  a successful upload (mock IPC).
- **custosweb**: new endpoint — 401 without bearer, 403 when kill-switch off,
  size/type validation, success bumps `avatarVersion`; rate-limit path.

## Out of scope / notes

- In-app upload is functional only once `custosweb` is **deployed** (or against a
  local `custosweb` dev server). The UI + endpoint code land regardless.
- No username/role editing in-app (web only) — this spec is avatar + navigation.
