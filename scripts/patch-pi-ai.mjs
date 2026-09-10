// Postinstall: honour `compat.sendChatgptAccountId: false` in pi-ai's
// openai-codex-responses transport so API-key gateways (ClawRouter) can serve
// codex-route models. Mirrors pi-mono-fork; drop when upstream pi-ai ships it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules');
const rel = '@earendil-works/pi-ai/dist/api/openai-codex-responses.js';
const targets = [join(root, rel), join(root, '@earendil-works/pi-coding-agent/node_modules', rel)];

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

for (const file of targets) {
  if (!existsSync(file)) continue;
  let src = readFileSync(file, 'utf8');
  let changed = 0;
  for (const [from, to] of edits) {
    if (src.includes(to)) continue;
    if (!src.includes(from)) {
      console.warn(`patch-pi-ai: anchor not found in ${file}: ${from}`);
      continue;
    }
    src = src.replace(from, to);
    changed++;
  }
  if (changed) writeFileSync(file, src);
  console.log(`patch-pi-ai: ${file.replace(root + '/', '')} ${changed ? 'patched' : 'already patched'}`);
}
