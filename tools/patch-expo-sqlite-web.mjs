import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Expo's web VFS starts with six file slots and never grows them. Separate
// account databases eventually exhaust that pool, even after being closed.
// Reserve a main file and a journal before opening, without changing any
// existing file. Keep this patch until the SDK grows the pool itself.
const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const worker = join(dirname(require.resolve('expo-sqlite/package.json')), 'web/worker.ts');
const source = readFileSync(worker, 'utf8');
const marker = '    // Ascend: keep room for a database and its journal in the OPFS pool.';
if (!source.includes(marker)) {
  const opening = `    pointer = await sqlite3.open_v2(databasePath, flags, vfsName);`;
  if (source.split(opening).length !== 2) {
    throw new Error('expo-sqlite web opening changed; review the OPFS capacity patch.');
  }
  const patched = source.replace(opening, `${marker}
    if (vfsName === VFS_NAME_PERSISTENT) {
      const { vfs } = await maybeInitAsync();
      const missing = 2 - (vfs.getCapacity() - vfs.getSize());
      if (missing > 0) await vfs.addCapacity(missing);
    }
${opening}`);
  writeFileSync(worker, patched);
}
