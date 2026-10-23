# iPhone web background-audio interruption — 23 October 2026

An iPhone user reported that using the web app interrupted background YouTube.
Inspection found workout ticks, rest alerts and finish effects using browser
media elements without an explicit mixable Audio Session. Rest and effect
sounds are enabled by default. The W3C Audio Session specification describes
playback as exclusive and ambient as mixable; the browser's automatic mode can
select playback for a media element. This is a code-backed likely mechanism,
not a physical reproduction of the reported phone interruption.

Source: https://www.w3.org/TR/audio-session/#audio-session-types

The web app now requests `navigator.audioSession.type = 'ambient'` before
rendering the app and before creating/playing alert media or Web Audio. Calls
also configure cached audio elements. Missing or partially implemented browser
APIs are tolerated. Native audio behavior and the existing muted priming/race
guards are unchanged. Exercise videos and barcode camera previews were already
muted; no microphone or media permissions were added.

## Verification and deployment

- Four HTML audio regressions failed with `auto` before the change and pass with
  `ambient` before media construction/play. Chime/effect priming and playback
  are covered separately.
- Four further cases cover Web Audio construction/resume and absent, missing or
  throwing Audio Session implementations. Existing eight waveform tests pass.
- The isolated hotfix branch passes all 1,694 tests and workspace typechecks;
  web export succeeds. Astra independently reviewed the patch with no important
  findings. The broader feature branch also passes all 1,769 tests with the fix.
- The deployment is based on the existing deployed photo/storage source at
  `4c43ded`, plus hotfix `80fe7ec`, keeping the feature branch's other changes out
  of this release. No Supabase migrations or main merge occurred.
- Cloud Run revision `gemini-proxy-00169-mth` serves 100% of traffic. The live
  entry is `entry-7a69df7c2edf7fa7010039a399137422.js`; its SHA-256 matches the
  tested export: `4af6ead379894ee9ebddc717b17e30cab47613488d2a06968eca4080ecf26ffe`.
- Health body is exactly `ok`; unknown API returns 404 and tokenless Gemini POST
  returns 401. All 69 checked assets/modules are reachable. The staging step
  retained 169 existing live JavaScript chunks for already-open pages.

## Limits and device acceptance

Requesting the mode proves app intent, not an operating system's actual mixing
behavior. Older browsers without this API retain their previous behavior.
Ambient alerts may obey iPhone silent-mode policy. Do not claim background
YouTube is confirmed fixed without physical device verification.

Acceptance should cover reopening the updated Safari/PWA page while YouTube is
already playing, ordinary navigation, first set tap, rest expiry and finish/PR
effects. Background playback should continue throughout; repeat with silent
mode enabled and confirm the app remains usable when alerts are inaudible.
No site data or local logs need to be cleared to load the update.
