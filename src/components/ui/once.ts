// A synchronous one-shot flag: tryStart() is true only the first time, until
// reset(). It guards an action against a second trigger that arrives before a
// re-render could disable the control (a double tap, two swipe ends, an
// accessibility action). Kept behind methods because gesture callbacks close
// over it, which a ref or a mutated object would not allow.
export function createOnce() {
  let started = false;
  return {
    tryStart: () => {
      if (started) return false;
      started = true;
      return true;
    },
    reset: () => {
      started = false;
    },
  };
}
