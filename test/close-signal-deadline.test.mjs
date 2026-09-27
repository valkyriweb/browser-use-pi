import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { mock } from 'node:test';

const DELAY_CALLS = Symbol.for('browser-use-pi.close-deadline-delay');
const BUDGET_MS = 2000;
// Real-clock cap for a close that is still pending after the fixture is killed.
// Mocked-timer reset drops the silent CDP timeout without settling it.
const CLEANUP_CLOSE_MS = 100;

// dist/browser.js imports node:timers/promises before a test can wrap it, and mock.timers
// never sees that module's internal Timeout. Redirect only that import so launch's short
// poll and close's post-CDP wait share the mocked global clock. Every other importer keeps
// the real module.
const moduleHooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'node:timers/promises' && context.parentURL?.endsWith('/dist/browser.js')) {
      return {
        url: new URL('./close-deadline-delay.mjs', import.meta.url).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

let openBrowser;
try {
  ({ openBrowser } = await import('../dist/browser.js'));
} finally {
  moduleHooks.deregister();
}

// Owned-browser close is the closure inside openBrowser, after a local executable is spawned
// and DevToolsActivePort has been read. The child below installs its SIGTERM ignore and pid
// file before publishing that port, so launch cannot observe a process that still dies on
// the default SIGTERM.
// The WebSocket accepts Browser.close and never replies or disconnects, so the CDP stage can
// end only on its own timer. Pre-21850be that timer, the post-CDP delay, and the SIGTERM grace
// each had an independent 2000ms, so SIGKILL landed at 6000ms. The deadline under test is the
// moment kill('SIGKILL') is invoked, which is before `await exited` and the lock removal.
// seam: global WebSocket — the CDP endpoint boundary, not an internal helper.
// seam: ChildProcess.prototype.kill — openBrowser does not return the child, and close()
// settling includes the untimed exit wait and lock removal.
test('owned-browser signal escalation issues SIGKILL at one 2000ms deadline', async () => {
  const delayCalls = globalThis[DELAY_CALLS];
  assert.ok(
    Array.isArray(delayCalls),
    'dist/browser.js must import the controlled delay, not node:timers/promises',
  );

  const root = await mkdtemp(join(tmpdir(), 'bu-close-deadline-'));
  const profile = join(root, 'profile');
  const scriptPath = join(root, 'hung-browser.mjs');
  const portFile = '1\n/devtools/browser/fixture\n';
  await writeFile(
    scriptPath,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const prefix = '--user-data-dir=';
const dir = process.argv.find((arg) => arg.startsWith(prefix)).slice(prefix.length);
process.on('SIGTERM', () => {});
writeFileSync(dir + '/fixture.pid', String(process.pid));
setInterval(() => {}, 1e9);
writeFileSync(dir + '/DevToolsActivePort', ${JSON.stringify(portFile)});
`,
  );
  await chmod(scriptPath, 0o755);

  const originalKill = ChildProcess.prototype.kill;
  const OriginalWebSocket = globalThis.WebSocket;
  const signals = [];
  let sentPayload = null;
  let sentAt = null;
  let gracefulClosedAt = null;
  let browser;
  let timersEnabled = false;
  let closing;

  ChildProcess.prototype.kill = function kill(signal) {
    if (this.spawnfile === scriptPath) signals.push({ signal, at: Date.now() });
    return originalKill.call(this, signal);
  };
  globalThis.WebSocket = class SilentEndpoint extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event('open')));
    }
    send(data) {
      sentPayload = String(data);
      sentAt = Date.now();
    }
    close() {
      gracefulClosedAt ??= Date.now();
    }
  };

  try {
    browser = await openBrowser({ executablePath: scriptPath, profileDir: profile });
    assert.equal(browser.endpoint, 'ws://127.0.0.1:1/devtools/browser/fixture');
    // Launch may have polled DevToolsActivePort through the same delay helper.
    delayCalls.length = 0;

    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    timersEnabled = true;
    const origin = Date.now();
    closing = browser.close();

    // The next stage arms its timer only after the previous promise continuation.
    // tick(0) fires a SIGKILL scheduled at the current instant without moving the clock;
    // tick(2000) is one more budget quantum. The cap makes a ladder that never kills
    // fail this assertion instead of hanging.
    for (
      let step = 0;
      step < 8 && !signals.some((entry) => entry.signal === 'SIGKILL');
      step += 1
    ) {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      mock.timers.tick(0);
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      if (signals.some((entry) => entry.signal === 'SIGKILL')) break;
      mock.timers.tick(BUDGET_MS);
    }

    const observed = {
      browserClose: sentPayload,
      browserCloseSentAt: sentAt === null ? null : sentAt - origin,
      gracefulSocketClosedAt: gracefulClosedAt === null ? null : gracefulClosedAt - origin,
      postCdpDelays: [...delayCalls],
      signals: signals.map(({ signal, at }) => [signal, at - origin]),
    };
    assert.deepEqual(observed, {
      browserClose: JSON.stringify({ id: 1, method: 'Browser.close' }),
      browserCloseSentAt: 0,
      gracefulSocketClosedAt: BUDGET_MS,
      postCdpDelays: [],
      signals: [
        ['SIGTERM', BUDGET_MS],
        ['SIGKILL', BUDGET_MS],
      ],
    });
    await closing;
    closing = undefined;
  } finally {
    // Kill before any wait. The fixture ignores SIGTERM, so a failed assertion can
    // leave `closing` on the exit promise. Resetting mocked timers also drops the
    // silent CDP timeout without settling it, so that wait stays on a real clock.
    const pendingClose = closing?.catch(() => {});
    closing = undefined;
    try {
      const pid = Number(readFileSync(join(profile, 'fixture.pid'), 'utf8'));
      if (Number.isInteger(pid) && pid > 0) process.kill(pid, 'SIGKILL');
    } catch {
      // The close path already reaped the child, or launch never wrote a pid.
    }
    ChildProcess.prototype.kill = originalKill;
    globalThis.WebSocket = OriginalWebSocket;
    if (timersEnabled) {
      timersEnabled = false;
      mock.timers.reset();
    }
    try {
      if (pendingClose) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, CLEANUP_CLOSE_MS);
          pendingClose.then(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
      delete globalThis[DELAY_CALLS];
    }
  }
});
