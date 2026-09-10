// Step 2b: does JS state actually persist across followUp()?
import { BrowserUse } from '../dist/index.js';
import { startFixture } from '../test/fixture.mjs';
import { loadLukeModels, DEFAULT_MODEL } from './models.mjs';
process.env.DO_NOT_TRACK = '1';
const models = await loadLukeModels();
const f = await startFixture();
const agent = await BrowserUse.create({ model: DEFAULT_MODEL, models, reasoning: 'low', telemetry: false, log: 'pretty', workspace: 'spike/workspace/followup' });
try {
  const a = await agent.run(`Open ${f.url}. Define a reusable top-level function products() that returns [{name, price:number}] from the page, call it, and return the result.`, { maxSteps: 8 });
  console.log('run1', a.status, a.text?.slice(0, 120), a.usage.cost.total.toFixed(4));
  const b = await agent.followUp(`Without redefining anything, call products() again and return only the names.`, { maxSteps: 4 });
  console.log('followUp', b.status, b.text?.slice(0, 120), b.steps, b.usage.cost.total.toFixed(4));
  const c = await agent.run(`Call products() and return the names.`, { maxSteps: 4 });
  console.log('run2(fresh transcript)', c.status, c.text?.slice(0, 160), c.steps, c.usage.cost.total.toFixed(4));
} finally { await agent.close(); await f.close(); }
