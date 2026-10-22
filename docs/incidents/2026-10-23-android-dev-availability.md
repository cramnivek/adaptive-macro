# Android development availability incident — 23 October 2026

## Conclusion

The installed Android development client depends on a JavaScript development
server on the owner's Windows PC. That makes app loading and Expo DOM rendering
depend on the PC being awake, Metro running and the phone reaching the PC over
the LAN. This was the wrong availability boundary for everyday use. Restarting
Metro restores access but does not remove that dependency.

Windows confirms a sleep interval from 01:11 to 07:11 Singapore time. Metro was
absent when checked after wake. The precise reason its old process terminated
is not established: there is no captured exit code or Metro crash trace. Sleep
explains host unavailability, but does not by itself prove process termination.
Do not report the process disappearance as a confirmed Node crash, memory leak,
Codex cleanup, or Windows reboot.

## Evidence and timeline

All incident times below are Asia/Singapore on 23 October 2026.

| Time | Observation | Evidence |
| --- | --- | --- |
| 00:56:17 | Last write to the previous Metro stdout log. This is not its exit timestamp. | `.superpowers/metro-20261022-190440.out.log`; stderr file is empty. |
| 01:11:13–15 | Windows Winlogon requested sleep; Windows entered sleep. | System log, Kernel-Power events 187 and 42. Event 187's ApiCallerName is Windows System32 winlogon.exe. The initiating user action is not established. |
| 07:11:07–08 | Windows resumed from the low-power interval. | Power-Troubleshooter event 1, with explicit sleep and wake timestamps. |
| 07:11:43 | The current Codex process was created. | Win32_Process CreationDate. The older desktop log ends just before sleep, without an explicit Metro exit event. |
| Before 07:13 | HTTP connection to localhost:8081 was refused; no listener was present. | Local HTTP and Get-NetTCPConnection checks. |
| 07:13:27 | Metro restarted as PID 38880, port 8081. | `.superpowers/metro-20261023-071327.*`; subsequent status body is `packager-status:running`. |
| RCA check | Windows had not rebooted during the incident. | LastBootUpTime is 19 October, 23:05. |
| RCA check | Cloud Run serves the expected healthy revision. | `/_health` body is exactly `ok`; service Ready, ConfigurationsReady and RoutesReady are True; revision `gemini-proxy-00168-9fz` receives 100% of traffic. |

No matching Node application crash or resource-exhaustion event was found in
the queried event window. That is absence of evidence, not a guarantee that no
crash occurred. Process-termination auditing could not be queried without an
additional Windows privilege, so the old process's exit cause remains unknown.

Cloud Run request logs between 00:30 and 08:00 contain 42 recorded requests:
11 returned 200, one returned 302 and 30 returned 404. No request returned 5xx,
and a separate query found no ERROR-or-higher entries in that window. These
records support separating this incident from a backend outage; they are not
a continuous uptime measurement. A fresh health check returned the body `ok`.

## Separate failures

- The earlier PR failed typechecking because a web CSS touchAction property was
  placed in native ViewStyle. That was fixed; CI at `bfda341` passes install,
  workspace typechecks and all 1,756 tests. A skipped PR deployment is expected.
- Sticker props could clear a completed preview while their DOM child skipped
  drawing identical data; the finish sheet also called a web-only renderer on
  native. These defects were fixed and tested separately. They do not prove a
  Metro crash or explain the sleeping host.
- A development build successfully compiling is not evidence of a phone's
  startup, offline availability, native sharing, or production performance.

## Corrective action

Make the existing preview profile explicitly non-development and generate an
internal Android APK. It embeds the JavaScript and DOM resources so opening the
app and reading/logging local data no longer requires Metro, the PC or Codex.
The package remains `com.cramnivek.ascend`; EAS reused the existing default
keystore. Install as an update rather than uninstalling and losing local data.

Build requested: `05fc1f8f-f858-45ac-b56c-750df4a8ad0d`, profile preview:
https://expo.dev/accounts/zeldrich/projects/adaptive-macros/builds/05fc1f8f-f858-45ac-b56c-750df4a8ad0d

The build FINISHED successfully at 07:57:24. Its source archive includes the
explicit non-development preview profile; the source commit metadata is
`bfda341` because that profile edit was uncommitted at submission. The identical
profile is now committed as `fc70fe4`. Both this build and the earlier development
build report the same existing default keystore. No new signing identity was made.

The downloaded APK was inspected directly: package `com.cramnivek.ascend`,
version 0.1.0/code 1, no application debuggable flag, embedded
`assets/index.android.bundle`, both DOM renderer HTML files, three DOM JavaScript
files and 44 font files. The remote build log confirms
`createBundleReleaseJsAndAssets`. This verifies release embedding, not runtime
acceptance. The artifact is about 149 MB and contains multiple Android
architectures; its download size does not measure startup or memory usage.

APK: https://expo.dev/artifacts/eas/4s4H5iGDnivpdTx2Hd9sYW0wNr-4FtQMrgWc_6YBmqg.apk

EAS Simulator availability was checked read-only and is disabled on this account,
so no cloud-device validation was performed. GitHub CI at `b739cf7` passed
workspace typechecks and the full test suite after the preview profile change.

The APK is ready, but installation and device acceptance are still pending.
Do not call the installed app independent of Metro until those checks pass.
No production merge,
Supabase migration, Cloud Run configuration change, or Windows sleep-policy
change is part of this remedy.

AI estimation, online food lookup and social activity still require their online
services. The core SQLite log must remain usable without those services.

Use the standalone preview for everyday testing and the development client only
when actively iterating with Metro. Keep the existing development profile for
that purpose. Neither a keep-awake setting nor an automatic Metro restart would
remove the PC and LAN dependencies. This remedy needs no change to Windows
power settings. The preview embeds its code: later JavaScript fixes need a new
APK until a separate update mechanism is deliberately configured.

## Acceptance and performance checks

1. Install the preview over the existing app; confirm the existing log remains.
2. Make Metro unreachable from the phone, cold-launch the preview and navigate
   Today, Weight and Train. Airplane mode can establish this without disrupting
   a development server another session is using.
3. With the PC unavailable and phone offline, record a local meal and weigh-in,
   background/reopen, and confirm persistence. Check that online actions fail
   visibly without blocking access to the local log. Repeat with a previously
   signed-in account and cached data, including an expired session; bundling
   code alone does not prove that account restoration is independent of network.
4. Render a nutrition sticker and a finished-workout card with Metro stopped.
   Check Android sharing into a destination app. Health Connect should remain
   independently available with its granted permissions and source records.
5. Measure cold launch, warm launch and first/repeated card rendering on the
   release preview, recording device, build, sample count and p50/p95. Development
   timing and a single sample do not establish release performance.

Current diagnostics: one Cloud Run health probe took about 2 seconds end to end;
Metro cold Android bundling took 18.7 seconds and a later rebuild 1.26 seconds.
The actual Metro DOM bundle produced a 760×361 PNG with four loaded fonts through
a synthetic Expo native-bridge shim. None of these numbers measures the
release APK's launch time or Android WebView/share performance. Do not claim a
performance target was met until the device acceptance checks are recorded.
