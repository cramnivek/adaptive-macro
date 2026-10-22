# Storage recovery after account switching

The phone reported `sqlite3_open_v2` after signing back in. The photo changes
did not change database names, migrations, or authentication. Inspection found
a reproducible web-storage failure in the installed Expo SQLite worker.

Its OPFS access-handle pool starts with six file slots. Closing a database
releases its connection but keeps its files associated with those slots.
Ascend's separate account databases can exhaust the pool; opening another
database then fails with SQLite code 14, `unable to open database file`.

`tools/patch-expo-sqlite-web.mjs` reserves room for a database and its journal
before a persistent database opens. The root postinstall applies it after
dependency installation, including CI. It does not rename, overwrite, remove,
or migrate an existing database and does not change native SQLite. The patch
fails explicitly if an SDK update changes the expected opening statement.

## Verification

- Reproduced the failure in a browser using the exported SDK worker and WASM:
  opening, writing, and closing distinct databases eventually returned code 14.
- Rebuilt with the patch and used the same browser origin and storage. A row
  written before the failure remained readable, and nine further databases
  opened, accepted writes, and closed successfully.
- Running postinstall twice left the worker hash unchanged on the second run.
- All 1,686 tests and all three workspace typechecks passed. Web export passed.

This reproduces and repairs a matching failure in the browser. Recovery on
the owner's phone remains to be confirmed. Do not clear site or app storage
as a recovery step: the local log lives there.
