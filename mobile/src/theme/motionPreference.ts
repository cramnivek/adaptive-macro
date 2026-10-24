/** Share one platform observer across animated rows, and ignore stale reads. */
export const createMotionPreference = (
  read: () => Promise<boolean>,
  listen: (changed: (value: boolean) => void) => () => void,
) => {
  let reduced = true;
  let revision = 0;
  let source = 0;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = (value: boolean) => {
    if (reduced === value) return;
    reduced = value;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => reduced,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        const reading = ++revision;
        const observing = ++source;
        stop = listen((value) => {
          if (source !== observing) return;
          revision += 1;
          update(value);
        });
        void read().then((value) => {
          if (revision === reading && listeners.size > 0) update(value);
        }).catch(() => undefined);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          revision += 1;
          source += 1;
          stop?.();
          stop = undefined;
        }
      };
    },
  };
};
