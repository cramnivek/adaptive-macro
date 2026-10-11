# Accounts and workout posts

Design, 2026-10-11. Step 1 of the social feature.

## Problem

People want to see each other's training, Hevy-style: a feed of finished workouts,
follows, likes. The app has nothing to build that on. Every byte lives on the device
(SQLite in OPFS on the web, SQLite on Android); the only server is the Gemini proxy,
which knows nobody. A feed needs people who can sign in and a place their posts live
that other people can be allowed — or refused — to read.

## The whole feature, and where this step sits

1. **Accounts and posting** — this design.
2. **Social tab** — follow requests, the feed, likes and comments, report and block,
   username search, the public/private switch taking effect.
3. **Food on posts** — opt-in per post: the day's meals or only its totals.
4. **Native Instagram Stories button, photos on posts.**

Decided for the whole feature, so this step does not paint it into a corner:

- **One model: follows.** An account is private (the default) or public. Following a
  private account is a request its owner approves; following a public one is
  immediate. Two people who follow each other are, in effect, friends. One set of
  rules, not a friends system beside a follow system.
- **Backend: Supabase.** Postgres, sign-in, and row-level security. A follow feed is
  one join, which Firestore cannot do without fanning every post out to every
  follower.
- **Instagram is a share target, not a login.** Meta closed the API for personal
  accounts in December 2024, publishing needs a Business or Creator account, and no
  endpoint gives an app someone's followers. What works is sending a picture to
  Stories — the share card already does — and showing a handle on the profile.

## Goal

Someone can sign in, pick a username, post a finished workout with a caption, see
the posts they have made, delete any of them, and delete their account.

## Non-goals

- **Followers, the feed, likes, comments, search, report, block.** Step 2. Until
  then a post is readable by its author only.
- **Photos.** No storage bucket, no image moderation. A later step.
- **Food.** Step 3.
- **Syncing or backing up the log.** A post is a snapshot of one workout, not the
  workout. The diary, sessions and settings stay on the device exactly as now.
  Whether to sync them is its own decision.
- **Requiring an account.** Everything that works signed out today keeps working.
- **Replacing the proxy token with the user's sign-in.** It would fix the first App
  Store blocker (one shared token, one shared daily ceiling) and becomes possible
  once accounts exist, but it is a change to the proxy and is not this step.
- **Sign in with Apple.** Required by Apple in an iOS app that offers Google
  sign-in — it lands with the App Store build, not the PWA.
- **A background queue for posts made offline.** See *When posting fails*.

## What the user sees

### Account

A new row in Settings. Signed out it reads "Sign in to post workouts".

- **Sign-in** offers an email code — type the address, type the 6-digit code mailed
  to it — or Google.
- **First sign-in** asks for:
  - a **username**: 3–20 of `a–z 0–9 _ .`, stored lower-case, unique;
  - a **display name**: 1–40 characters;
  - an optional **Instagram handle**: up to 30 of `A–Z a–z 0–9 _ .`, stored without
    the `@`.
- **Private by default.** The switch exists from day one so that when step 2 opens
  posts to followers, no one has become visible without choosing to.
- **Account screen** shows the profile fields (editable), the private switch, "Your
  posts", Sign out, and Delete account.
- **Delete account** asks once, then removes the account, the profile and every post
  from the server. Nothing on the device is touched. Apple requires in-app deletion
  for any app that lets people create an account.

### Posting

On the finish sheet, beside SHARE:

- **POST**, with an optional **caption** of up to 500 characters.
- Signed out, POST goes to sign-in (and profile setup if new) and comes back to the
  sheet with the caption still in it.
- **The sheet remembers.** `settings.postWorkouts` is set true when someone posts
  and false when they tap DONE without posting. When true, the caption field is open
  and POST is the primary (red) button; when false, POST is the secondary one and the
  caption appears on tapping it.
- After posting, the button reads POSTED and is disabled; DONE leaves as now.

### Your posts

`app/my-posts.tsx`: the posts newest first, each showing what step 2's feed will
show — title, date, time, volume, the new best, the first three lifts with their
best set and "+ N more", the caption — and a delete action that asks once.

### When posting fails

Offline, timed out, or refused: the sheet says what happened in one line and POST
stays available. Every post carries the workout's local session id, unique per
author, so a retry that reaches the server twice still makes one post — the second
insert is answered as "already posted" and treated as success. A workout not posted
before the sheet closes is simply not posted; there is no queue to drain later. A
queue is what people expect of a sync feature, which this is not.

## Data

SQL migrations in `supabase/migrations/`, in git, applied with the Supabase CLI.
Nothing in them depends on Supabase beyond `auth.users` and `auth.uid()`, which is
what lets the tests run them outside Supabase.

### `profiles`

| column         | type        | rule                                                  |
| -------------- | ----------- | ----------------------------------------------------- |
| `id`           | uuid, PK    | references `auth.users(id)` on delete cascade         |
| `username`     | text unique | `^[a-z0-9_.]{3,20}$`                                  |
| `display_name` | text        | 1–40 characters                                       |
| `instagram`    | text null   | `^[A-Za-z0-9_.]{1,30}$`                               |
| `is_private`   | boolean     | default true                                          |
| `created_at`   | timestamptz | default now()                                         |

### `posts`

| column         | type          | rule                                                      |
| -------------- | ------------- | --------------------------------------------------------- |
| `id`           | uuid, PK      | default gen_random_uuid()                                  |
| `author_id`    | uuid          | references `profiles(id)` on delete cascade                |
| `session_id`   | text          | unique together with `author_id`                          |
| `title`        | text          | 1–80 characters                                           |
| `performed_on` | date          |                                                           |
| `duration_min` | integer       | ≥ 1                                                       |
| `sets`         | integer       | ≥ 0                                                       |
| `volume_kg`    | numeric null  | null on a day with no loaded sets                         |
| `exercises`    | jsonb         | array of `{name, sets, best_kg, best_reps}`, at most 30   |
| `highlight`    | jsonb null    | the day's milestone as the engine produces it             |
| `caption`      | text null     | at most 500 characters                                    |
| `created_at`   | timestamptz   | default now()                                             |

**Numbers are stored in kilograms and formatted by the reader.** The share card
formats in the poster's units, which is right for a picture and wrong for a feed: a
pound user must see a kilogram user's 100 kg bench as 220.5 lb. `best_kg` is null for
a lift done with no added load, and the reader shows its reps instead, as the card
does. `highlight` keeps the engine's milestone object so the reader can phrase it
with `describeMilestone` in its own units.

### Row-level security

Enabled on both tables. Policies for the `authenticated` role; `anon` gets nothing.

- **profiles** — select: any signed-in user (step 2's search needs it; a profile is a
  name, not content). Insert, update: only the row whose `id = auth.uid()`. No delete
  policy: profiles go only with the account.
- **posts** — select: `author_id = auth.uid()`. Insert, update, delete: the same.
  Step 2 replaces the select policy with "the author, or an approved follower, or
  anyone if the author is public" — the one rule in this feature that must be
  exactly right.

### Deleting an account

A `delete_account()` function, `security definer`, deletes from `auth.users` the row
whose id is `auth.uid()`; the profile and posts follow by cascade. Called over RPC
from the Account screen.

## App

### Packages

`@supabase/supabase-js`; `@react-native-async-storage/async-storage` for the native
session (the web build uses `localStorage`, as supabase-js does by default);
`expo-web-browser` and `expo-auth-session` for Google on Android.

### Configuration

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. The
anon key is built to ship inside apps; row-level security is the guard, not the
key's secrecy. Without them the Account row says sign-in is not set up, and nothing
else changes.

### Google sign-in

- **Web:** `signInWithOAuth` redirects to Google and back to the app's origin.
- **Android:** the same flow opened with `expo-web-browser`, returning through the
  existing `adaptivemacros://` scheme.
- **Risk to check on a phone first:** an iOS home-screen web app keeps its storage
  apart from Safari. If the redirect comes back in Safari rather than in the
  installed app, the session lands in the wrong place. The email code never leaves
  the app and always works; if Google fails this check on iOS, the PWA offers email
  only there.

### Code

- `src/social/postPayload.ts` — pure, tested.
  - `postPayload(input)`: a finished workout (the same input `shareSummary` takes,
    plus the caption and session id) becomes a post row. Warm-ups left out and the
    heaviest set winning, by the same rules as the share card.
  - `postView(row, units)`: a post row becomes the strings a reader sees, in the
    reader's units.
- `src/social/client.ts` — the Supabase client; null when unconfigured.
- `src/social/api.ts` — `sendCode`, `verifyCode`, `signInWithGoogle`, `signOut`,
  `myProfile`, `saveProfile`, `createPost`, `myPosts`, `deletePost`,
  `deleteAccount`. Errors come back as one-line messages the screens show as they
  are.
- `src/social/session.tsx` — who is signed in, for the screens that care.
- Screens: `app/sign-in.tsx`, `app/profile-setup.tsx` (also the edit screen),
  `app/account.tsx`, `app/my-posts.tsx`; POST and caption in `FinishSheet.tsx`; the
  Account row in Settings.
- Setting: `postWorkouts: boolean`, default false.

## Testing

- **Pure code** — `postPayload` and `postView` under vitest: warm-ups excluded, kg
  stored, pounds shown to a pound reader, a bodyweight lift quoted in reps, the
  milestone phrased in the reader's units, a caption over 500 refused.
- **Row-level security** — under vitest with PGlite (Postgres compiled to
  WebAssembly; no Docker, which this machine does not have). A test setup creates a
  stand-in `auth` schema — `auth.users` and an `auth.uid()` that reads the current
  test user — and the `authenticated` role, then runs the real migration files. As
  user A and user B, the tests assert that B cannot read, change or delete A's posts;
  that no one can write a profile or post under another id; that `anon` reads
  nothing; and that `delete_account()` as A removes A's profile and posts and leaves
  B's. This is the existing pattern of running the app's real SQL against a real
  engine, applied to Postgres.
- **End to end** — in the browser against the real project: email code, profile
  setup, a post from the finish sheet, the post on "Your posts", deleting it, a retry
  making one post, deleting the account.

## What the owner sets up

Neither can be done for the owner: both mean creating accounts and accepting terms.

- **Supabase:** an account under the personal email, a project in Singapore
  (`ap-southeast-1`, beside the Cloud Run service in `asia-southeast1`), and the email
  template changed to include the 6-digit code (`{{ .Token }}`) — by default it sends
  only a link. The friend helping can be invited to the project.
- **Google:** an OAuth client in Google Cloud Console, its id and secret entered in
  Supabase's Google provider, and the app's web origin added as a redirect.

## Known limits

- **Supabase's built-in email is for testing.** It sends only a few emails an hour.
  Before more than a handful of testers, set up a custom SMTP provider.
- **Free projects pause after a week with no traffic** and must be resumed from the
  dashboard. Fine while testing; the Pro plan ($25 a month) does not pause.
- **A post does not change when the workout does.** Editing a finished session's
  sets afterwards leaves the post as it was; deleting and re-posting is the way to
  correct it.
