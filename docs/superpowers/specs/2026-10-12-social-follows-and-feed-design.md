# Follows and the feed

Design, 2026-10-12. Step 2 of the social feature. Drafted overnight without the
owner. Decisions marked **(decided overnight)** are proposals; the rest follows
from choices the owner already made (a follow model with private by default,
Supabase, summary-and-caption posts).

## Where this sits

Step 1 shipped:
- accounts and profiles (private by default);
- posts from the finish sheet, readable only by their author;
- deleting an account.

This step lets people find each other, follow, and see each other's workouts.

## Goal

A Social tab that does four things:
- shows a feed of workouts from people you follow, newest first, with likes;
- lets you find people by username and follow them, which for a private account
  is a request they approve;
- lets you approve or decline requests;
- lets you report a post or block a person.

## Non-goals

- **Comments.** **(decided overnight)** Likes now, comments in step 2b. Comments
  are the largest moderation surface; shipping the feed without them gets
  following tested first.
- **Push notifications.** Requests and likes show in the app, on the Social tab.
- **Food on posts.** Step 3.
- **Suggested athletes / discovery.** Search by username only. Suggestions
  need ranking and are where strangers and spam come from.
- **Photos.** Later.

## Data

One new migration, `supabase/migrations/2026MMDDhhmmss_follows_and_feed.sql`, plus
the hardening migration under *Harden posts first*. Both are tested with the
existing PGlite harness before they are pushed to `main`, which applies them live.

### `follows`

| column        | type        | rule                                                |
| ------------- | ----------- | --------------------------------------------------- |
| `follower_id` | uuid        | references `profiles(id)` on delete cascade         |
| `followee_id` | uuid        | references `profiles(id)` on delete cascade         |
| `status`      | text        | `pending` or `accepted`                             |
| `created_at`  | timestamptz | default now()                                       |

- The primary key is `(follower_id, followee_id)`, and you can't follow yourself.
- A trigger on insert sets `status`. It is `accepted` when the followee is
  public, and `pending` when they're private. The client never chooses it, so it
  can't skip a private account's approval.
- Turning an account public accepts its pending requests (trigger on
  `profiles.is_private`). Turning it private leaves existing followers in place.

### `likes`

- Columns: `post_id` (on delete cascade), `user_id` (on delete cascade) and
  `created_at`.
- The primary key is `(post_id, user_id)`.

### `blocks`

- Columns: `blocker_id`, `blocked_id` and `created_at`, both ids on delete
  cascade.
- The primary key is `(blocker_id, blocked_id)`.
- A trigger on insert deletes follows in both directions between the two people.

### `reports`

- Columns: `id`, `reporter_id`, `post_id` (nullable), `profile_id` (nullable),
  `reason` (`spam`, `abuse`, `nudity` or `other`), `note` (≤ 300 characters) and
  `created_at`.
- At least one of `post_id` and `profile_id` is set.

### Who can see what (row-level security)

- **posts select** replaces step 1's author-only rule. A post is readable when:
  - it is your own post;
  - you have an `accepted` follow to its author;
  - or its author is public.

  In every case nobody involved has blocked the other. This is the rule that
  must be exactly right. It is written once as a `security definer` function
  `can_see(author uuid)` and used by the posts and likes policies, so the logic
  doesn't drift between tables.
- **profiles select** stays readable when signed in, except to people you have
  blocked or who have blocked you. Search must not reveal a blocker.
- **follows:**
  - Insert: as yourself, and not toward someone in a block with you.
  - Select: rows you are in.
  - Delete: rows you are in. That covers unfollowing, removing a follower, and
    declining a request.
  - Update to `accepted`: only by the followee, only from `pending`.
- **likes:** insert and delete as yourself, on posts you `can_see`. Select:
  likes on posts you can see.
- **blocks:** insert, delete and select as the blocker only. Nobody can list
  who has blocked them.
- **reports:** insert as yourself, with no select for users. Only the owner reads
  them, in the dashboard.
- **Known limit, accepted:** choosing a username that is taken says so, even when
  the account that holds it has blocked you and is hidden from you. Someone who
  remembers a blocker's exact username can learn the account still exists. Every
  username system has to say a name is taken, so this is accepted rather than
  closed.

### Harden posts first

Step 1 trusted the author's own client, because only the author read their
posts. Once others read them, a hand-made request could post rows that crash a
reader's `postView`. So before the feed opens, a migration adds:

- a `valid_exercises(jsonb)` immutable function, used in a check: each element
  is an object with `name` (text, 1–80 characters), `sets` (integer 0–100),
  `best_kg` (number 0–1000 or null) and `best_reps` (integer 0–1000);
- `highlight` is null or an object whose `kind` is `load`, `volume` or
  `sessions`, with a numeric `value`;
- `char_length(session_id) <= 64` and `pg_column_size(exercises) <= 8192`.

The reader hardens too: `postView` treats any unexpected shape as "no lifts"
rather than throwing, and `PostCard` keys are index-based (done overnight).

## Screens

**(decided overnight)** A **Social tab** replaces **Settings** in the tab bar,
which stays at five tabs. Settings moves behind a gear icon on the Social tab's
header and on Today. Six tabs at phone width leave about 65 px a label, and
Settings is the least-visited tab. The alternative, if you'd rather keep
Settings in the bar, is Social as a sixth tab.

- **Social tab: Feed.**
  - Posts from people you follow and your own, as `PostCard`, newest first, 20
    at a time with "Load more".
  - Each card has a like button and count, the author's name and @username, and
    a ⋯ menu with Report post and Block @user.
  - Empty state: "Follow people to see their workouts here", with a Find people
    button.
- **Social tab: header.**
  - Your @username, which opens your profile.
  - A people icon, which opens Find people.
  - A badge counting pending requests.
- **Find people.** Search by username prefix (at least 2 characters), with
  Follow / Requested / Following on each result.
- **Profile (yours or theirs).**
  - Name, @username and Instagram handle (tap to open Instagram).
  - Follower and following counts.
  - Posts, when you can see them. A private account you don't follow shows
    "This account is private" and a Request button.
- **Requests.** Pending follow requests, each with Approve and Decline.
- **Report.** Pick a reason, add an optional note, then send. "Thanks — we'll
  look at it" closes the sheet, and the post is hidden for you straight away.
- **Blocked people,** in Settings → Account, with Unblock.

The share card and POST stay as they are. "Your posts" becomes your profile.

## Moderation (what Apple requires)

Apple's rules for user-generated content need four things:
- a way to filter objectionable material;
- a way to report it;
- a way to block abusive users;
- timely action on reports.

**(decided overnight)**
- **Filter:** captions, usernames and display names are checked against a short
  word list on the phone, so the problem is explained before sending, and again by
  a database trigger, so a hand-made request can't skip it. The list lives in a
  table so it can grow without an app release.
- **Report and block:** as above.
- **Hidden by reports:** a post reported by three different people is hidden from
  everyone but its author until reviewed, using a `hidden` column set by a
  trigger.
- **Timely action:** the owner reviews `reports` in the Supabase dashboard. An
  optional follow-up is a daily summary email via a scheduled Edge Function.
  The owner has to accept that this is ongoing work once the app is public.

## Testing

- **PGlite, extending `rls.test.ts`**, with users A, B and C:
  - A private: B's follow is pending, and B can't read A's posts until A
    accepts.
  - A public: B's follow is accepted at once.
  - Blocks: a block either way hides posts, profiles and likes, and removes
    follows.
  - Only the followee can accept a request, and a pending request can't be
    self-accepted.
  - Likes count once per person.
  - Reports can be written but not read by users.
  - The hardening checks reject malformed exercises, a highlight of the wrong
    shape, and oversized rows.
  - The word filter trigger rejects a listed word.
- **Pure tests:**
  - `postView` given a malformed row returns no lifts;
  - feed pagination cursor helpers.
- **Browser:** two accounts. Sign up the second with a `+test` alias of the
  owner's address, which Gmail delivers to the same inbox. Then check the
  request, approve, the feed shows the post, like, report hides the post, and
  block removes everything.

## Order of work

1. The hardening migration and the reader hardening, so posts are safe to show
   other people.
2. `follows` and `blocks` with RLS and tests, then the Find people, Profile and
   Requests screens.
3. The new posts read policy, `likes`, and the feed.
4. `reports`, the word filter, and the auto-hide.
5. The tab bar change.

Each step is a separate commit and review, and step 3 is the one that makes
anything visible to other people.
