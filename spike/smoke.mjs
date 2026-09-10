// Step 1: prove the Browser Use Pi loop works on Luke's stack.
// Local Chrome only, telemetry off, model via ClawRouter.
import { BrowserUse } from '../dist/index.js';
import { loadLukeModels, DEFAULT_MODEL } from './models.mjs';

process.env.DO_NOT_TRACK = '1';

const models = await loadLukeModels();
const model = DEFAULT_MODEL;
const [provider, id] = model.split('/');
if (!models.getModel(provider, id)) {
  console.error(`model ${model} not found in models.json`);
  process.exit(1);
}

const t0 = Date.now();
const agent = await BrowserUse.create({
  model,
  models,
  reasoning: process.env.SPIKE_REASONING ?? 'low',
  telemetry: false,
  log: 'pretty',
  workspace: 'spike/workspace/smoke',
});

try {
  const result = await agent.run(
    'Go to https://example.com and return the text of the h1 element as {"h1": string}.',
    { maxSteps: 8, timeoutMs: 120_000 },
  );
  console.log(JSON.stringify({ ms: Date.now() - t0, result }, null, 2));
} finally {
  await agent.close();
}
