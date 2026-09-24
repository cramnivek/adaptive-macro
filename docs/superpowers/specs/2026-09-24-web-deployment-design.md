# Web deployment and install durability

Design, 2026-09-24.

## Problem

Friends on iOS cannot use this app. The Android build is a sideloaded APK with
no iOS equivalent: Apple charges $99/year recurring, and without it a build
installed from a free Apple ID expires after seven days.

The app already builds for web. `react-native-web` and `react-dom` are
dependencies, `expo export --platform web` succeeds today, and a static export
deployed to HTTPS renders the full diary, computes targets, and creates its
SQLite database. A website is a deploy, not a port.

Two things block it, both measured rather than assumed.

**The proxy rejects cross-origin calls.** `services/gemini-proxy` sets no
`Access-Control-*` headers and has no `OPTIONS` handler. A fetch to
`/api/gemini` from a deployed web origin fails with `TypeError: Failed to
fetch` before reaching Google. Every lookup and every meal estimate is dead.

**iOS Safari deletes site data after seven days of non-use.** The policy covers
IndexedDB and the other script-writable stores that back `expo-sqlite` on web.
A friend who tries the app, doesn't open Safari for a week, and comes back
finds their diary gone. Web apps added to the home screen are exempt — they
keep their own usage counter — which makes the install instruction the
durability mechanism rather than a nicety.

## Goals

A URL a friend can open on iOS, install to the home screen, and keep using
without losing data.

## Non-goals

- **Accounts, a server database, or sync.** Data stays per-device. Isolation is
  physical rather than enforced by a `WHERE user_id = ?` that has to stay
  correct forever, and the author never becomes custodian of anyone else's
  weight and food logs.
- **Google Drive backup.** Approved, but it benefits the native app equally and
  is therefore its own project, not part of serving a website.
- **Barcode scanning parity.** See Degradations.
- **A public launch.** The URL is unlisted and shared with a handful of people.
  The shared proxy token is adequate at that scale and would not be if the link
  spread.

## Shape

The existing Cloud Run service serves **both** the static web build and
`/api/gemini`.

Same origin, so CORS never arises: no allowlist to configure, no preflight, and
the shared token never crosses an origin boundary. A misconfigured CORS
allowlist is a well-worn way to open something up by accident, and this avoids
having one at all.

`services/gemini-proxy/src/adapter.ts` gains real routing:

```
GET  /                → index.html
     /api/gemini      → handleGeminiProxy
     anything else    → a file from dist/, falling back to index.html
```

The SPA fallback matters because expo-router uses client-side paths: a friend
who opens `/scan` directly, or refreshes there, must get the app rather than a
404.

This is the finding the proxy's final review parked as a Minor — *"the adapter
routes nothing; every method and path except an exact `GET /` reaches the
handler."* It was correctly judged harmless then, because the token gate was
identical on every path. Serving files makes it load-bearing.

**The health probe branch stays.** Cloud Run probes `GET /` to decide the
container is live, and that must not become a file read that could fail.

## Durability

Three pieces, in order of how much they matter.

**Install to the home screen.** A PWA manifest and icons, so Add to Home Screen
produces something that looks like an app rather than a bookmark — and, on
iOS, so the seven-day eviction policy stops applying. An install prompt shown
on iOS Safari explains this in the app's own voice: it is the difference
between a diary that survives and one that is deleted, so it is stated as that
rather than as a suggestion.

**Request persistent storage.** `navigator.storage.persist()` is never called
today; `navigator.storage.persisted()` returns `false` on the deployed build.
The API is available and unused, so the diary is evictable even on Chrome. This
is a defect in the app as it stands, not only a web-deployment concern.

**Make the backup obvious.** Export already exists in Settings. On web it
should produce a downloaded file in one tap and say plainly that it is the only
copy, because "remember to export" is not a backup strategy for someone trying
a link a friend sent them.

## Degradations

**Barcode scanning may not work in Safari**, which lacks the Barcode Detection
API that Chrome provides. The scan screen already handles this correctly —
verified on the deployed build, it renders "Allow camera" alongside "Search by
name instead" and does not crash. The honest response is to let it degrade and
say so in the UI, not to ship a second scanner.

## What was measured

Against a real HTTPS deployment, in Chrome:

| Check | Result |
|---|---|
| Renders over HTTPS | full diary, targets computed |
| `isSecureContext` | `true` |
| OPFS available | `true`, `expo-sqlite` directory created |
| SQLite database | 53,248 bytes written |
| Survives a reload | probe file and database intact |
| `navigator.storage.persisted()` | **`false`** |
| Cross-origin call to the proxy | **`TypeError: Failed to fetch`** |
| Scan screen | degrades with a working fallback |

## Testing

Chrome is automatable end to end and covers routing, the SPA fallback, storage
persistence, and that `/api/gemini` still answers on the same origin.

**iOS Safari cannot be verified from this machine** and is the one thing that
decides whether the feature works at all. It needs a real device and a short
manual checklist: install to the home screen, log a weight, fully close the
app, reopen from the home screen, confirm the weight is still there. Until that
passes, nothing here should be described to anyone as ready.

## Limitations

**A friend who clears site data loses everything.** Hardening reduces eviction;
it does not create a backup. That is what project B exists for, and until it
ships the export file is the only recovery path.

**Everyone shares one proxy token and one quota.** The token is extractable
from a web bundle by anyone who opens devtools — more easily than from an APK.
Grounded lookups are capped at 50/day across all users, and the Prepay balance
bounds spend absolutely. Adequate for an unlisted link among friends; not
adequate for a public one.

**Friends' lookup queries pass through the author's billing account.** Their
diary stays on their device, but the text they search is sent to Google under
the author's key. The service logs nothing, but this should be said out loud
before the link is shared.
