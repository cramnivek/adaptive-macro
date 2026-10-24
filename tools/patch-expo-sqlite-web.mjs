import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Expo's web VFS has three sharp edges in OPFS:
// 1. It starts with six file slots and never grows them, which separate
//    account databases eventually exhaust.
// 2. AccessHandlePoolVFS.#acquireAccessHandles opens all pool files in
//    Promise.all without releasing already-opened handles when one file is
//    locked, leaking exclusive SyncAccessHandles inside the worker.
// 3. worker.ts maybeInitAsync assigns _sqlite3 before AccessHandlePoolVFS.create
//    finishes, so a transient OPFS lock on the first attempt leaves _sqlite3
//    set and _vfs null, causing every retry to throw "Invalid VFS state".
const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const expoSqliteDir = dirname(require.resolve('expo-sqlite/package.json'));

export function patchWorkerSource(source) {
  let next = source;

  const capacityMarker = '    // Ascend: keep room for a database and its journal in the OPFS pool.';
  if (!next.includes(capacityMarker)) {
    const opening = `    pointer = await sqlite3.open_v2(databasePath, flags, vfsName);`;
    if (next.split(opening).length !== 2) {
      throw new Error('expo-sqlite web opening changed; review the OPFS capacity patch.');
    }
    next = next.replace(
      opening,
      `${capacityMarker}
    if (vfsName === VFS_NAME_PERSISTENT) {
      const { vfs } = await maybeInitAsync();
      const missing = 2 - (vfs.getCapacity() - vfs.getSize());
      if (missing > 0) await vfs.addCapacity(missing);
    }
${opening}`,
    );
  }

  const initMarker = '// Ascend: atomic VFS init with lock handoff and retry reset.';
  if (!next.includes(initMarker)) {
    const originalInit = `async function maybeInitAsync(): Promise<{
  sqlite3: SQLiteAPI;
  vfs: AccessHandlePoolVFS;
  vfsMemory: MemoryVFS;
}> {
  if (!_sqlite3) {
    const module = await WaSQLiteFactory({
      locateFile: () => wasmModule,
    });
    _sqlite3 = SQLite.Factory(module) as SQLiteAPI;
    if (!_sqlite3) {
      throw new Error('Failed to initialize wa-sqlite');
    }

    if (_vfs == null) {
      _vfs = await AccessHandlePoolVFS.create(VFS_NAME_PERSISTENT, module);
      if (_vfs == null) {
        throw new Error('Failed to initialize AccessHandlePoolVFS');
      }
    }
    _sqlite3.vfs_register(_vfs, true);

    if (_vfsMemory == null) {
      _vfsMemory = await MemoryVFS.create(VFS_NAME_MEMORY, module);
      if (_vfsMemory == null) {
        throw new Error('Failed to initialize MemoryVFS');
      }
    }
    _sqlite3.vfs_register(_vfsMemory, false);
  }
  if (_vfs == null || _vfsMemory == null) {
    throw new Error('Invalid VFS state');
  }
  return { sqlite3: _sqlite3, vfs: _vfs, vfsMemory: _vfsMemory };
}`;
    if (next.split(originalInit).length !== 2) {
      throw new Error('expo-sqlite web maybeInitAsync changed; review the VFS init patch.');
    }
    const patchedInit = `${initMarker}
const _opfsChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ascend-expo-sqlite-opfs') : null;
let _initPromise: Promise<{
  sqlite3: SQLiteAPI;
  vfs: AccessHandlePoolVFS;
  vfsMemory: MemoryVFS;
}> | null = null;

async function releaseVfsAsync(): Promise<void> {
  const sqlite3 = _sqlite3;
  const vfs = _vfs;
  _sqlite3 = null;
  _vfs = null;
  _vfsMemory = null;
  _initPromise = null;
  for (const nativeDatabaseId of Array.from(databaseIdMap.keys())) {
    try {
      maybeFinalizeAllStatements(nativeDatabaseId);
    } catch {}
    const dbEntity = databaseIdMap.get(nativeDatabaseId);
    databaseIdMap.delete(nativeDatabaseId);
    if (dbEntity && sqlite3) {
      await sqlite3.close(dbEntity.pointer).catch(() => {});
    }
  }
  statementIdMap.clear();
  sessionIdMap.clear();
  if (vfs) {
    await vfs.close().catch(() => {});
  }
}

if (_opfsChannel) {
  _opfsChannel.onmessage = (event: MessageEvent) => {
    if (event.data === 'yield-opfs') {
      void releaseVfsAsync();
    }
  };
}

async function maybeInitAsync(): Promise<{
  sqlite3: SQLiteAPI;
  vfs: AccessHandlePoolVFS;
  vfsMemory: MemoryVFS;
}> {
  if (_sqlite3 && _vfs && _vfsMemory) {
    return { sqlite3: _sqlite3, vfs: _vfs, vfsMemory: _vfsMemory };
  }
  if (!_initPromise) {
    _initPromise = (async () => {
      try {
        const module = await WaSQLiteFactory({
          locateFile: () => wasmModule,
        });
        const sqlite3 = SQLite.Factory(module) as SQLiteAPI;
        if (!sqlite3) {
          throw new Error('Failed to initialize wa-sqlite');
        }

        const vfs = await AccessHandlePoolVFS.create(VFS_NAME_PERSISTENT, module);
        if (vfs == null) {
          throw new Error('Failed to initialize AccessHandlePoolVFS');
        }
        sqlite3.vfs_register(vfs, true);

        const vfsMemory = await MemoryVFS.create(VFS_NAME_MEMORY, module);
        if (vfsMemory == null) {
          await vfs.close().catch(() => {});
          throw new Error('Failed to initialize MemoryVFS');
        }
        sqlite3.vfs_register(vfsMemory, false);

        _sqlite3 = sqlite3;
        _vfs = vfs;
        _vfsMemory = vfsMemory;
        return { sqlite3, vfs, vfsMemory };
      } catch (error) {
        _sqlite3 = null;
        _vfs = null;
        _vfsMemory = null;
        _initPromise = null;
        _opfsChannel?.postMessage('yield-opfs');
        throw error;
      }
    })();
  }
  return _initPromise;
}`;
    next = next.replace(originalInit, patchedInit);
  }

  return next;
}

export function patchVfsSource(source) {
  const vfsMarker = '    // Ascend: release any handles acquired before a lock error so retries can succeed.';
  if (source.includes(vfsMarker)) return source;

  const originalAcquire = `    // Open access handles in parallel, separating associated and unassociated.
    await Promise.all(
      files.map(async ([name, handle]) => {
        const accessHandle = await handle.createSyncAccessHandle();
        this.#mapAccessHandleToName.set(accessHandle, name);
        const path = this.#getAssociatedPath(accessHandle);
        if (path) {
          this.#mapPathToAccessHandle.set(path, accessHandle);
        } else {
          this.#availableAccessHandles.add(accessHandle);
        }
      })
    );`;

  if (source.split(originalAcquire).length !== 2) {
    throw new Error('expo-sqlite AccessHandlePoolVFS changed; review the handle release patch.');
  }

  return source.replace(
    originalAcquire,
    `${vfsMarker}
    try {
      for (const [name, handle] of files) {
        const accessHandle = await handle.createSyncAccessHandle();
        this.#mapAccessHandleToName.set(accessHandle, name);
        const path = this.#getAssociatedPath(accessHandle);
        if (path) {
          this.#mapPathToAccessHandle.set(path, accessHandle);
        } else {
          this.#availableAccessHandles.add(accessHandle);
        }
      }
    } catch (error) {
      this.#releaseAccessHandles();
      throw error;
    }`,
  );
}

const workerPath = join(expoSqliteDir, 'web/worker.ts');
const patchedWorker = patchWorkerSource(readFileSync(workerPath, 'utf8'));
writeFileSync(workerPath, patchedWorker);

const vfsPath = join(expoSqliteDir, 'web/wa-sqlite/AccessHandlePoolVFS.js');
const patchedVfs = patchVfsSource(readFileSync(vfsPath, 'utf8'));
writeFileSync(vfsPath, patchedVfs);
