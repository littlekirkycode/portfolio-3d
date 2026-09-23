import { useEffect, useMemo } from "react";

/* Deferred disposal: React StrictMode (dev) runs every effect cleanup once
 * straight after mount, and Scene's compile-before-reveal pass may still hold
 * a pending compileAsync on these materials — disposing them then throws
 * inside three ("reading isReady"). Cleanup only SCHEDULES disposal; a
 * re-mount with the same object cancels it, a real unmount (or key change)
 * disposes a few seconds later. Same pattern as bayScreens / selfgrow kit. */
const pending = new WeakMap<object, number>();

/** Memoise a disposable GPU resource (material / geometry / texture) on a
 *  single string key and dispose it (deferred) when the key changes or on
 *  unmount. */
export function useDisposable<T extends { dispose: () => void }>(make: () => T, key = ""): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const v = useMemo(() => make(), [key]);
  useEffect(() => {
    const t = pending.get(v);
    if (t !== undefined) {
      window.clearTimeout(t);
      pending.delete(v);
    }
    return () => {
      pending.set(
        v,
        window.setTimeout(() => {
          pending.delete(v);
          v.dispose();
        }, 8000),
      );
    };
  }, [v]);
  return v;
}
