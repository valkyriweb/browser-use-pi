// Step 2c: worker killed by cell timeout mid-task — does the run recover?
import { BrowserUse } from '../dist/index.js';
import { startFixture } from '../test/fixture.mjs';
import { loadLukeModels, DEFAULT_MODEL } from './models.mjs';
process.env.DO_NOT_TRACK = '1';
const models = await loadLukeModels();
const f = await startFixture();
const agent = await BrowserUse.create({ model: DEFAULT_MODEL, models, reasoning: 'low', telemetry: false, log: 'pretty', workspace: 'spike/workspace/recovery', cellTimeoutMs: 1500 });
try {
  const r = await agent.run(`Open ${f.url}. First, run a JavaScript cell containing "await new Promise(r => setTimeout(r, 10000))" exactly once (it is expected to time out; do not retry it). Then click "Save selection" and return the status text.`, { maxSteps: 8 });
  console.log(r.status, '|', r.text?.slice(0, 120), '| steps', r.steps, '| $', r.usage.cost.total.toFixed(4));
} finally { await agent.close(); await f.close(); }
