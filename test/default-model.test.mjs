import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import {
  BUILTIN_DEFAULT_MODEL,
  DEFAULT_MODEL,
  defaultModels,
  resolveDefaultModel,
} from '../dist/index.js';

const ENV = ['BROWSER_USE_MODEL', 'PI_CODING_AGENT_DIR', 'BROWSER_USE_PI_DIR'];

function withEnv(values, fn) {
  const previous = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of ENV) {
        if (previous[k] === undefined) delete process.env[k];
        else process.env[k] = previous[k];
      }
    });
}

test('resolveDefaultModel prefers BROWSER_USE_MODEL, then DEFAULT_MODEL only when resolvable', async () => {
  const [provider, id] = [
    DEFAULT_MODEL.slice(0, DEFAULT_MODEL.indexOf('/')),
    DEFAULT_MODEL.slice(DEFAULT_MODEL.indexOf('/') + 1),
  ];
  const builtins = builtinModels();
  assert.equal(
    builtins.getModel(provider, id),
    undefined,
    'fixture: builtins must not know DEFAULT_MODEL',
  );
  const [b, sep] = [BUILTIN_DEFAULT_MODEL, BUILTIN_DEFAULT_MODEL.indexOf('/')];
  assert.ok(
    builtins.getModel(b.slice(0, sep), b.slice(sep + 1)),
    'BUILTIN_DEFAULT_MODEL must resolve from builtins',
  );

  await withEnv({ BROWSER_USE_MODEL: 'openai/gpt-5.4' }, () => {
    assert.equal(resolveDefaultModel(builtins), 'openai/gpt-5.4');
  });
  await withEnv({}, () => {
    assert.equal(resolveDefaultModel(builtins), BUILTIN_DEFAULT_MODEL);
    const custom = { getModel: (p, m) => (p === provider && m === id ? { id } : undefined) };
    assert.equal(resolveDefaultModel(custom), DEFAULT_MODEL);
  });
});

test('defaultModels falls back to builtins without or with malformed models.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'browser-use-models-'));
  try {
    // No models.json: builtin collection.
    await withEnv({ PI_CODING_AGENT_DIR: dir }, async () => {
      const models = await defaultModels();
      assert.ok(models.getModel('openai', 'gpt-5.4'));
    });
    // Malformed models.json in a fresh process must not wedge default resolution
    // (ModelRuntime tolerates it; the collection just lacks custom providers).
    const { spawnSync } = await import('node:child_process');
    await writeFile(join(dir, 'models.json'), '{ not json');
    const script = `
      const { defaultModels, resolveDefaultModel, BUILTIN_DEFAULT_MODEL } = await import(${JSON.stringify(new URL('../dist/index.js', import.meta.url).href)});
      const models = await defaultModels();
      console.log(JSON.stringify({ fallback: resolveDefaultModel(models) === BUILTIN_DEFAULT_MODEL }));
    `;
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, PI_CODING_AGENT_DIR: dir, BROWSER_USE_MODEL: '' },
      encoding: 'utf8',
    });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout.trim().split('\n').pop()), { fallback: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
