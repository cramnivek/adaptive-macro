// Node's ESM loader does not append extensions to relative specifiers.
// mobile/src/ai/geminiDescribe.ts imports '../api/gemini' with none, which
// Metro (the app's real bundler) resolves fine but plain node does not -
// and mobile/ is out of scope for this eval to edit. This hook retries a
// failed relative resolution with a .ts suffix before giving up, so the eval
// can import the app's real Gemini entry point unmodified.
//
// Only engages on ERR_MODULE_NOT_FOUND for a relative specifier that has no
// extension of its own, so it cannot mask an unrelated resolution failure.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(specifier) && !/\.[a-zA-Z]+$/.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    throw err;
  }
}
