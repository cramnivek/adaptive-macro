const loads = new Map<string, Promise<void>>();

/** A bridge update must not reload fonts or wait forever on an unavailable asset. */
export const domFontsReady = async (faces: readonly [string, string][]): Promise<void> => {
  await Promise.all(faces.map(([family, source]) => {
    const key = JSON.stringify([family, source]);
    const cached = loads.get(key);
    if (cached) return cached;
    const pending = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Font loading timed out: ${family}`)), 10000);
      new FontFace(family, `url(${source})`).load()
        .then((face) => { document.fonts.add(face); resolve(); }, reject)
        .finally(() => clearTimeout(timer));
    }).catch((error) => { loads.delete(key); throw error; });
    loads.set(key, pending);
    return pending;
  }));
};
