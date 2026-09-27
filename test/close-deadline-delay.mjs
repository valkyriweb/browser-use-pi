// Replacement for the `node:timers/promises` import in dist/browser.js only.
// That module schedules an internal Timeout, which node:test mock.timers does not
// advance. Routing the wait through global setTimeout puts the post-CDP delay on
// the same clock as the CDP timer and the SIGKILL timer.
const calls = [];
globalThis[Symbol.for('browser-use-pi.close-deadline-delay')] = calls;

export function setTimeout(after, value, options) {
  calls.push(after);
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(() => resolve(value), after);
    if (options?.ref === false) timer.unref?.();
  });
}
