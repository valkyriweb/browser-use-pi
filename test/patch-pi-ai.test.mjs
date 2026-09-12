// Fixtures for scripts/patch-pi-ai.mjs target discovery.
//
// Regression under test: pi-ai's package.json is absent from its `exports` map, so the
// original `require.resolve('@earendil-works/pi-ai/package.json')` threw
// ERR_PACKAGE_PATH_NOT_EXPORTED for BOTH specs. Only the top-level directory fallback
// ever matched, so the copy nested under pi-coding-agent (pinned by its
// npm-shrinkwrap.json, so it never hoists) stayed unpatched while the script exited 0 —
// codex-route models silently broken.
//
// Each test builds a synthetic package tree in a temp dir and runs the real script in a
// child process with cwd/script path pointed at that tree, so the host's node_modules is
// never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/patch-pi-ai.mjs', import.meta.url));

const UNPATCHED = `export function build(model, apiKey, headers) {
  const accountId = extractAccountId(apiKey);
  headers.set("chatgpt-account-id", accountId);
  return headers;
}
`;
const DRIFTED = `export function build(model, apiKey, headers) {
  const accountId = readAccountFromToken(apiKey);
  headers.append("chatgpt-account-id", accountId);
  return headers;
}
`;
// Only the SECOND anchor renamed upstream; the first still applies cleanly.
const PARTIAL_DRIFT_SECOND = `export function build(model, apiKey, headers) {
  const accountId = extractAccountId(apiKey);
  headers.append("chatgpt-account-id", accountId);
  return headers;
}
`;
// Only the FIRST anchor renamed upstream; the second still applies cleanly.
const PARTIAL_DRIFT_FIRST = `export function build(model, apiKey, headers) {
  const accountId = readAccountFromToken(apiKey);
  headers.set("chatgpt-account-id", accountId);
  return headers;
}
`;

/** pi-ai's real shape: ESM-only, and package.json deliberately NOT exported. */
const PI_AI_PKG = {
  name: '@earendil-works/pi-ai',
  version: '0.85.1',
  type: 'module',
  exports: {
    '.': { import: './dist/index.js' },
    './api/*': { import: './dist/api/*.js' },
  },
};

async function writePiAi(dir, body = UNPATCHED) {
  await mkdir(join(dir, 'dist', 'api'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify(PI_AI_PKG));
  await writeFile(join(dir, 'dist', 'index.js'), 'export const ok = true;\n');
  await writeFile(join(dir, 'dist', 'api', 'openai-codex-responses.js'), body);
}

/**
 * Build a package tree and copy the real script into it, so its `..`-relative root is the
 * fixture rather than the repository.
 * @param {{hoisted?: string|false, nested?: string|false}} layout
 */
async function fixture(layout) {
  const dir = await mkdtemp(join(tmpdir(), 'patch-pi-ai-'));
  await mkdir(join(dir, 'scripts'), { recursive: true });
  await cp(SCRIPT, join(dir, 'scripts', 'patch-pi-ai.mjs'));
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture-root', version: '1.0.0', type: 'module' }),
  );
  const hoistedDir = join(dir, 'node_modules', '@earendil-works', 'pi-ai');
  const pcaDir = join(dir, 'node_modules', '@earendil-works', 'pi-coding-agent');
  const nestedDir = join(pcaDir, 'node_modules', '@earendil-works', 'pi-ai');
  if (layout.hoisted !== false) await writePiAi(hoistedDir, layout.hoisted ?? UNPATCHED);
  if (layout.nested !== false) {
    await mkdir(pcaDir, { recursive: true });
    await writeFile(
      join(pcaDir, 'package.json'),
      JSON.stringify({
        name: '@earendil-works/pi-coding-agent',
        version: '0.85.1',
        type: 'module',
        exports: { '.': { import: './dist/index.js' } },
      }),
    );
    // Mirrors the real package: a shrinkwrap pin is why this copy never hoists.
    await writeFile(join(pcaDir, 'npm-shrinkwrap.json'), JSON.stringify({ lockfileVersion: 3 }));
    await mkdir(join(pcaDir, 'dist'), { recursive: true });
    await writeFile(join(pcaDir, 'dist', 'index.js'), 'export const ok = true;\n');
    await writePiAi(nestedDir, layout.nested ?? UNPATCHED);
  }
  return {
    dir,
    hoistedFile: join(hoistedDir, 'dist', 'api', 'openai-codex-responses.js'),
    nestedFile: join(nestedDir, 'dist', 'api', 'openai-codex-responses.js'),
    run: () =>
      spawnSync(process.execPath, [join(dir, 'scripts', 'patch-pi-ai.mjs')], {
        cwd: dir,
        encoding: 'utf8',
      }),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const isPatched = async (file) =>
  (await readFile(file, 'utf8')).includes('sendChatgptAccountId === false');

test('patches both hoisted and nested pi-ai despite package.json not being exported', async () => {
  const f = await fixture({});
  try {
    // Guard: the regression's root cause must still hold in the fixture.
    const probe = spawnSync(
      process.execPath,
      [
        '-e',
        'try{require.resolve("@earendil-works/pi-ai/package.json");console.log("RESOLVED")}catch(e){console.log(e.code)}',
      ],
      { cwd: f.dir, encoding: 'utf8' },
    );
    assert.match(probe.stdout.trim(), /ERR_PACKAGE_PATH_NOT_EXPORTED/);

    const out = f.run();
    assert.equal(out.status, 0, out.stderr);
    assert.ok(await isPatched(f.hoistedFile), 'hoisted copy must be patched');
    assert.ok(await isPatched(f.nestedFile), 'nested copy must be patched');
  } finally {
    await f.cleanup();
  }
});

test('patches a nested-only install (nothing hoisted)', async () => {
  const f = await fixture({ hoisted: false });
  try {
    const out = f.run();
    assert.equal(out.status, 0, out.stderr);
    assert.ok(await isPatched(f.nestedFile));
  } finally {
    await f.cleanup();
  }
});

test('patches a hoisted-only install and reports each file once', async () => {
  const f = await fixture({ nested: false });
  try {
    const out = f.run();
    assert.equal(out.status, 0, out.stderr);
    assert.ok(await isPatched(f.hoistedFile));
    const lines = out.stdout.split('\n').filter((l) => l.includes('openai-codex-responses.js'));
    assert.equal(lines.length, 1, `expected one target, got:\n${out.stdout}`);
  } finally {
    await f.cleanup();
  }
});

test('is a no-op with exit 0 when pi-ai is absent', async () => {
  const f = await fixture({ hoisted: false, nested: false });
  try {
    const out = f.run();
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stderr + out.stdout, /not installed/);
  } finally {
    await f.cleanup();
  }
});

test('is idempotent: a second run re-reports already patched and never doubles', async () => {
  const f = await fixture({});
  try {
    assert.equal(f.run().status, 0);
    const second = f.run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal((second.stdout.match(/already patched/g) ?? []).length, 2);
    const body = await readFile(f.nestedFile, 'utf8');
    assert.equal(body.match(/sendChatgptAccountId === false/g).length, 1);
  } finally {
    await f.cleanup();
  }
});

test('fails loudly when anchors have drifted in ANY reachable copy', async () => {
  // Hoisted is fine; only the nested copy drifted. The original script exited 0 here.
  const f = await fixture({ nested: DRIFTED });
  try {
    const out = f.run();
    assert.equal(out.status, 1, 'drift in a reachable copy must fail loudly');
    assert.match(out.stderr, /anchor not found|unpatched/);
    assert.match(out.stderr, /drifted/);
  } finally {
    await f.cleanup();
  }
});

// Regression: run() previously guarded with `missing && !changed`, so partial drift
// (changed=1, missing=1) was FALSE and the file passed with exit 0 -- shipping a
// half-patched transport where accountId can be undefined. Both-anchors-drifted still
// failed loudly, which is why this slipped through. Both orderings are covered because
// the two anchors are evaluated in sequence.
for (const [label, body] of [
  ['second anchor renamed', PARTIAL_DRIFT_SECOND],
  ['first anchor renamed', PARTIAL_DRIFT_FIRST],
]) {
  test(`fails loudly on partial drift (${label}), not just when every anchor drifts`, async () => {
    const f = await fixture({ nested: body });
    try {
      const out = f.run();
      assert.equal(out.status, 1, `partial drift must fail loudly, got exit ${out.status}`);
      assert.match(out.stderr, /anchor not found|unpatched/);
      assert.match(out.stderr, /drifted/);
      // The surviving original anchor must not be silently reported as a success.
      assert.doesNotMatch(out.stdout, /already patched.*pi-coding-agent/);
    } finally {
      await f.cleanup();
    }
  });
}

test('fails when a copy is left containing unpatched anchors', async () => {
  const f = await fixture({});
  try {
    // Partially patched file: second anchor still raw, so it must not pass as OK.
    await writeFile(
      f.nestedFile,
      `const accountId = model.compat?.sendChatgptAccountId === false ? undefined : extractAccountId(apiKey);
headers.set("chatgpt-account-id", accountId);
`,
    );
    const out = f.run();
    assert.equal(out.status, 0, out.stderr);
    assert.ok(await isPatched(f.nestedFile));
    const body = await readFile(f.nestedFile, 'utf8');
    assert.match(body, /if \(accountId\) headers\.set/);
  } finally {
    await f.cleanup();
  }
});
