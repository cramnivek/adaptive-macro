/**
 * Stops waiting even when native fetch or a session lock ignores cancellation.
 *
 * Aborting the transport is still useful, but it does not guarantee that its
 * promise settles on Android. The caller's deadline must end the wait too.
 */
export const withAbort = <T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const cancelled = () => {
      const error = new Error('The request was cancelled.');
      error.name = 'AbortError';
      return error;
    };
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(cancelled());
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw cancelled();
        return operation();
      })
      .then(
        (value) => {
          signal.removeEventListener('abort', abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
  });
