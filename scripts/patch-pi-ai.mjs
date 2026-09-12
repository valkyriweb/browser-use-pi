// Postinstall: honour `compat.sendChatgptAccountId: false` in pi-ai's
// openai-codex-responses transport so API-key gateways (ClawRouter) can serve
// codex-route models. Mirrors pi-mono-fork; drop when upstream pi-ai ships it.
//
// Ships in the published tarball (package.json `files`), so it must be safe on
// every consumer install: a missing pi-ai is a no-op, but any reachable pi-ai
// that still contains the unpatched anchors fails loudly instead of leaving
// codex-route models silently broken.
//
// Resolution note: pi-ai's package.json is NOT in its `exports` map, so
// `require.resolve('@earendil-works/pi-ai/package.json')` throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. It is also ESM-only (`import` condition), so
// CJS `require.resolve` cannot see the subpaths either. We therefore resolve the
// real exported subpath with `import.meta.resolve` from each dependent's own
// directory, which is what actually determines the copy loaded at runtime:
// pi-coding-agent pins pi-ai via npm-shrinkwrap.json, so it keeps a nested copy
// that never hoists and must be patched separately from the top-level one.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUBPATH = '@earendil-works/pi-ai/api/openai-codex-responses';
const REL = 'dist/api/openai-codex-responses.js';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Directories whose module resolution we must honour: our package plus every dependent that may pin its own pi-ai. */
function resolutionBases() {
  const bases = [root];
  for (const dep of ['@earendil-works/pi-coding-agent', '@earendil-works/pi-agent-core']) {
    const dir = join(root, 'node_modules', ...dep.split('/'));
    if (existsSync(dir)) bases.push(dir);
  }
  return bases;
}

/**
 * Every distinct pi-ai transport file reachable at runtime, deduped by realpath so a
 * symlinked/hoisted copy is not patched twice. Resolution is attempted from each
 * dependent's own directory; a plain directory probe covers exports-blocked cases.
 */
function targets() {
  const found = new Map();
  const add = (file) => {
    if (!file || !existsSync(file)) return;
    const key = realpathSync(file);
    if (!found.has(key)) found.set(key, file);
  };
  for (const base of resolutionBases()) {
    // Resolve from a path inside `base` so node walks that directory's node_modules first.
    try {
      add(fileURLToPath(import.meta.resolve(SUBPATH, pathToFileURL(join(base, 'index.js')).href)));
    } catch {
      /* not resolvable from here; the directory probe below still covers it */
    }
    add(join(base, 'node_modules', '@earendil-works', 'pi-ai', REL));
  }
  return [...found.values()];
}

const edits = [
  [
    'const accountId = extractAccountId(apiKey);',
    'const accountId = model.compat?.sendChatgptAccountId === false ? undefined : extractAccountId(apiKey);',
  ],
  [
    'headers.set("chatgpt-account-id", accountId);',
    'if (accountId) headers.set("chatgpt-account-id", accountId);',
  ],
];

export function patchFile(file) {
  let src = readFileSync(file, 'utf8');
  let changed = 0;
  let missing = 0;
  for (const [from, to] of edits) {
    if (src.includes(to)) continue;
    if (!src.includes(from)) {
      missing++;
      continue;
    }
    src = src.replace(from, to);
    changed++;
  }
  if (changed) writeFileSync(file, src);
  // Re-read what is now on disk: a file is only OK when no unpatched anchor survives.
  const after = readFileSync(file, 'utf8');
  const unpatched = edits.filter(([from, to]) => after.includes(from) && !after.includes(to));
  return { changed, missing, unpatched: unpatched.length };
}

export function run(log = console) {
  const files = targets();
  if (files.length === 0) {
    log.warn('patch-pi-ai: @earendil-works/pi-ai not installed; nothing to patch');
    return 0;
  }
  let failed = 0;
  for (const file of files) {
    const { changed, missing, unpatched } = patchFile(file);
    // Any surviving unpatched anchor, or any anchor we could not find at all, fails the
    // file. `missing` alone is decisive: an already-patched edit hits `continue` before
    // the missing++ branch, so missing > 0 always means a genuinely absent anchor, never
    // a benign already-patched state. Guarding on `missing && !changed` would let partial
    // drift (one anchor renamed upstream, one intact) pass silently with changed=1,
    // missing=1 -- shipping a half-patched transport.
    if (unpatched || missing) {
      log.error(
        unpatched
          ? `patch-pi-ai: anchors present but unpatched in ${file}`
          : `patch-pi-ai: anchor not found in ${file}${changed ? ' (partial drift: some anchors applied, others absent)' : ''}`,
      );
      failed++;
    } else {
      log.log(`patch-pi-ai: ${file} ${changed ? 'patched' : 'already patched'}`);
    }
  }
  if (failed) {
    log.error(
      'patch-pi-ai: pi-ai anchors have drifted; codex-route models via API-key gateways will not work. Update scripts/patch-pi-ai.mjs or drop it if upstream now honours compat.sendChatgptAccountId.',
    );
    return 1;
  }
  return 0;
}

export { targets };

// Only act when executed directly, so tests can import the helpers.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  process.exit(run());
