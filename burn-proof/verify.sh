set -euo pipefail
export PATH=/tmp/depsec-node/bin:$PATH
export CI=true DO_NOT_TRACK=1 ANONYMIZED_TELEMETRY=false
trap 'cp /tmp/browser-use-audit.json burn-proof/audit-after.json 2>/dev/null || true; tar -czf burn-proof/result.tar.gz package.json package-lock.json burn-proof/*.json 2>/dev/null || true' EXIT
npm ci --no-audit --no-fund
npm audit --json > /tmp/browser-use-audit.json || test "$?" -eq 1
node --input-type=module -e 'import fs from "node:fs";const a=JSON.parse(fs.readFileSync("/tmp/browser-use-audit.json"));console.log(a.metadata.vulnerabilities);if(a.metadata.vulnerabilities.high || a.metadata.vulnerabilities.critical)process.exit(1)'
npm run build
npm run check
node --test --test-concurrency=1 test/provider.test.mjs test/default-model.test.mjs test/patch-pi-ai.test.mjs test/compatibility.test.mjs
npm run docs:build
