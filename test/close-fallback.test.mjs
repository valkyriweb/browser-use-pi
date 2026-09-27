import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBrowser } from '../dist/browser.js';

// Stand-in for Chrome: writes DevToolsActivePort, speaks just enough WebSocket to receive
// Browser.close, then either exits (orderly) or waits for the parent's signal (fallback).
function fixtureSource(mode) {
  return `#!/usr/bin/env node
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const mode = ${JSON.stringify(mode)};
const userData = process.argv.find((arg) => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
if (!userData) process.exit(2);
if (mode === 'exit-before-endpoint') process.exit(0);

const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const server = createServer();
server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string') return socket.destroy();
  const accept = createHash('sha1').update(key + magic).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' +
      accept +
      '\\r\\n\\r\\n',
  );
  socket.on('data', () => {
    if (mode === 'graceful') process.exit(0);
  });
});
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  writeFileSync(userData + '/DevToolsActivePort', port + '\\n/devtools/browser/fixture\\n');
});
`;
}

async function ownedBrowser(root, mode) {
  const executablePath = join(root, `chrome-${mode}`);
  await writeFile(executablePath, fixtureSource(mode), { mode: 0o755 });
  await chmod(executablePath, 0o755);
  const profileDir = await mkdtemp(join(root, 'profile-'));
  const browser = await openBrowser({ executablePath, profileDir });
  return { browser, profileDir };
}

test(
  'owned browser close warns once when graceful shutdown misses the child exit',
  { timeout: 20_000 },
  async () => {
    const warnings = [];
    const patch = mock.method(console, 'warn', (...args) => {
      warnings.push(args.map(String).join(' '));
    });
    const root = await mkdtemp(join(tmpdir(), 'bu-close-fallback-'));
    try {
      await assert.rejects(
        ownedBrowser(root, 'exit-before-endpoint'),
        /Chrome exited before exposing CDP\./,
      );
      assert.deepEqual(warnings, []);

      const graceful = await ownedBrowser(root, 'graceful');
      try {
        assert.match(
          graceful.browser.endpoint,
          /^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/fixture$/,
        );
        await Promise.all([graceful.browser.close(), graceful.browser.close()]);
      } finally {
        await graceful.browser.close();
      }
      assert.deepEqual(warnings, []);

      const lingered = await ownedBrowser(root, 'linger');
      try {
        assert.match(
          lingered.browser.endpoint,
          /^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/fixture$/,
        );
        await Promise.all([lingered.browser.close(), lingered.browser.close()]);
        await lingered.browser.close();
      } finally {
        await lingered.browser.close();
      }
      assert.equal(warnings.length, 1);
      const [warning] = warnings;
      const elapsed = Number(warning.match(/after (\d+)ms/)?.[1]);
      assert.match(warning, /falling back to SIGTERM/);
      assert.ok(elapsed >= 1_500 && elapsed < 5_000, `elapsed ms out of range: ${warning}`);
    } finally {
      patch.mock.restore();
      await rm(root, { recursive: true, force: true });
    }
  },
);
