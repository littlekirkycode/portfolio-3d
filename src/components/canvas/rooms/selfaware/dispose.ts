import { useEffect } from "react";

/* ── deferred disposal (same pattern as bayScreens / selfgrow kit) ──────────
 * React StrictMode (dev) runs every effect cleanup once straight after mount,
 * and Scene's compile-before-reveal pass may still hold a pending
 * compileAsync on these materials — disposing them then throws inside three
 * ("reading isReady"). Cleanup only SCHEDULES disposal; a re-mount with the
 * same object cancels it, a real unmount disposes a few seconds later. */
type Disposable = { dispose: () => void };
const pending = new WeakMap<object, number>();

export function useDeferredDispose(objs: Disposable | Disposable[] | Record<string, Disposable>) {
  useEffect(() => {
    const list: Disposable[] = Array.isArray(objs)
      ? objs
      : typeof (objs as Disposable).dispose === "function"
        ? [objs as Disposable]
        : Object.values(objs as Record<string, Disposable>);
    for (const o of list) {
      const t = pending.get(o);
      if (t !== undefined) {
        window.clearTimeout(t);
        pending.delete(o);
      }
    }
    return () => {
      for (const o of list) {
        pending.set(
          o,
          window.setTimeout(() => {
            pending.delete(o);
            o.dispose();
          }, 8000),
        );
      }
    };
  }, [objs]);
}
