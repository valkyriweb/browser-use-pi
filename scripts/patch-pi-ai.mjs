// Postinstall: honour `compat.sendChatgptAccountId: false` in pi-ai's
// openai-codex-responses transport so API-key gateways (ClawRouter) can serve
// codex-route models. Mirrors pi-mono-fork; drop when upstream pi-ai ships it.
//
// Ships in the published tarball (package.json `files`), so it must be safe on
// every consumer install: a missing pi-ai is a no-op, but an existing pi-ai
// whose anchors have drifted fails loudly instead of leaving codex-route models
// silently broken.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REL = 'dist/api/openai-codex-responses.js';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Every pi-ai copy this package may load: hoisted, local, and the one nested under pi-coding-agent. */
function targets() {
  const found = new Set();
  const add = (pkgJson) => pkgJson && found.add(join(dirname(pkgJson), REL));
  for (const spec of [
    '@earendil-works/pi-ai/package.json',
    '@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/package.json',
  ]) {
    try {
      add(require.resolve(spec));
    } catch {
      /* not installed at this location */
    }
  }
  const local = join(here, '..', 'node_modules', '@earendil-works');
  add(existsSync(join(local, 'pi-ai', 'package.json')) && join(local, 'pi-ai', 'package.json'));
  return [...found].filter((f) => existsSync(f));
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

const files = targets();
if (files.length === 0) {
  console.warn('patch-pi-ai: @earendil-works/pi-ai not installed; nothing to patch');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  let src = readFileSync(file, 'utf8');
  let changed = 0;
  let missing = 0;
  for (const [from, to] of edits) {
    if (src.includes(to)) continue;
    if (!src.includes(from)) {
      console.error(`patch-pi-ai: anchor not found in ${file}: ${from}`);
      missing++;
      continue;
    }
    src = src.replace(from, to);
    changed++;
  }
  if (changed) writeFileSync(file, src);
  if (missing) failed++;
  console.log(
    `patch-pi-ai: ${file} ${missing ? 'FAILED' : changed ? 'patched' : 'already patched'}`,
  );
}
if (failed) {
  console.error(
    'patch-pi-ai: pi-ai anchors have drifted; codex-route models via API-key gateways will not work. Update scripts/patch-pi-ai.mjs or drop it if upstream now honours compat.sendChatgptAccountId.',
  );
  process.exit(1);
}
