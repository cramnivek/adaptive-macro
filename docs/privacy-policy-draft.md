# Ascend — privacy policy (draft)

> **Draft for the owner to review, written 2026-10-12.** It describes what the code
> does as of commit `1448f0d` on `overnight/2026-10-12`. It is not legal advice.
> Before publishing:
> - Fill in the bracketed items.
> - Check the Google Gemini tier question below.
> - Have someone qualified read it if the app is offered beyond friends.
>
> The App Store and Google Play both require a privacy policy at a public URL. One
> option is serving this as a page from the existing web app (`/privacy`).

**Last updated:** [date of publishing]

Ascend is a nutrition and training log made by [owner's name or trading name]. This
policy explains what information the app handles, where it goes, and what you can
do about it.

## The short version

- Your log stays on your device: food, weight, workouts, routines and settings.
  There is no copy of it on our servers.
- An account is optional, and only needed to post workouts. If you make one, we
  keep your email, profile and posts.
- Some features send what you give them to outside services: photos and
  descriptions to an AI model, and barcodes and food names to food databases.
  That happens only when you use the feature.
- No ads, no analytics, no tracking, and nothing is sold.

## What stays on your device

Your food diary, body-weight entries, workouts, routines, exercise library and
settings are kept in a database on your device. In the web app it lives in your
browser's storage for this site. We can't see it. Backups are files you export
yourself, and they go wherever you save them.

Deleting the app, or clearing this site's data in your browser, deletes this
information. If you haven't exported a backup, it can't be recovered.

## If you make an account

An account is only needed to post workouts. When you sign in we keep:

- **Your email address,** to send you sign-in codes.
- **Your profile:** username, display name, an optional Instagram handle, and
  whether your account is private or public.
- **Your posts:** the summary of each workout you choose to post (date,
  duration, number of sets, total weight lifted, each exercise's best set, any
  new best) and your caption.

**Who can see your posts.** Today, only you. When following arrives, a private
account's posts are visible only to people you approve, and a public account's to
anyone signed in. Your username, name and Instagram handle can be found by other
signed-in users either way.

**Where it's stored.** Accounts and posts are stored by Supabase, our database
provider, on servers in [region — check Supabase → Project Settings → General; the
design recommended Singapore]. Sign-in emails are sent through Google's Gmail
service.

**Deleting it.** Settings → Account → Delete account removes your account, profile
and every post straight away. You can also delete single posts at any time. Your
log on the device is not affected.

## Features that send information to other services

These only run when you use them.

| Feature | What is sent | Sent to |
| --- | --- | --- |
| Describe a meal, photograph a meal | The text you type, or the photo | Google's Gemini AI, through our server |
| Look up a food or exercise with AI | The name you typed | Google's Gemini AI, through our server |
| Build a routine, import a programme (PDF or screenshot) | Your choices (focus, equipment, level) or the document | Google's Gemini AI, through our server |
| Scan a barcode, search for a food | The barcode number or search words | Open Food Facts and the USDA FoodData Central database (from the web app, through our server) |
| Optional: Claude as the meal estimator | The text or photo | Anthropic, directly, using an API key you provide |
| Optional: Ollama as the meal estimator | The text | A model running on your own computer; nothing leaves it |

Our server ("the proxy") passes these requests on and doesn't store their
contents. It keeps short-lived counts of requests to stop abuse. It runs on
Google Cloud in Singapore.

> **Owner to check:** Google's terms differ between the free and paid tiers of the
> Gemini API. On the free tier, Google may use what is sent to improve its products.
> On the paid tier it doesn't. Confirm which tier the project's key is on, and say so
> here. Telling people their meal photos might be used by Google matters.

Each of these services handles the information under its own privacy policy:
[links to Google Gemini API terms, Open Food Facts, USDA FoodData Central, Anthropic,
Supabase].

## Permissions the app asks for

- **Camera:** to scan barcodes, and to photograph a meal or a printed programme.
- **Photos:** to choose a meal photo or a programme screenshot.

The app asks when you first use the feature, and works without either
permission.

## Children

Ascend is not meant for children under [13 / 16 — choose per the countries you
offer it in] and does not knowingly collect their information.

## Changes

If this policy changes, the new version will be posted here with a new date. A
change to what is shared with others will be shown in the app.

## Contact

Questions or requests: [contact email — consider a dedicated address rather than a
personal one, since it will be public].
