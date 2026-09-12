// Step 2: representative local tasks against the repo's own fixture page.
// Usage: SPIKE_MODEL=clawrouter/claude-sonnet-5 node spike/bench.mjs [taskId ...]
import { writeFile, mkdir } from 'node:fs/promises';
import { Type } from 'typebox';
import { BrowserUse } from '../dist/index.js';
import { startFixture } from '../test/fixture.mjs';
import { defaultModels, DEFAULT_MODEL as PKG_DEFAULT_MODEL } from '../dist/index.js';

const DEFAULT_MODEL = process.env.SPIKE_MODEL ?? PKG_DEFAULT_MODEL;

process.env.DO_NOT_TRACK = '1';

const tasks = [
  {
    id: 'ax-extract',
    task: (u) =>
      `Open ${u}. List every product with its name and price as numbers.`,
    schema: Type.Object({
      products: Type.Array(Type.Object({ name: Type.String(), price: Type.Number() })),
    }),
    check: (o) =>
      o?.products?.length === 2 &&
      o.products.some((p) => p.name === 'Atlas' && p.price === 29) &&
      o.products.some((p) => p.name === 'Orbit' && p.price === 49),
  },
  {
    id: 'form-flow',
    task: (u) =>
      `Open ${u}. Search for "orbit" so only matching products remain, set Shipping to Express, click "Save selection", then click "Save selection" once more. Report the status text and how many products are still visible.`,
    schema: Type.Object({ status: Type.String(), visibleProducts: Type.Number() }),
    check: (o) => o?.status === 'Saved 2 time(s)' && o.visibleProducts === 1,
  },
  {
    id: 'iframe-shadow',
    task: (u) =>
      `Open ${u}. Inside the "Reference" iframe, type REF-7731 into the Reference field and click "Save reference"; report the text shown below it. Then click the button inside the shadow DOM host #shadow and report its new label.`,
    schema: Type.Object({ reference: Type.String(), shadowLabel: Type.String() }),
    check: (o) => o?.reference === 'REF-7731' && o.shadowLabel === 'Shadow done',
  },
  {
    id: 'newtab-download',
    task: (u) =>
      `Open ${u}. Click "Open details" (it opens a new tab) and report the resulting tab's URL path. Then fetch the "Export catalog" link and return its CSV rows (excluding the header) as name/price pairs.`,
    schema: Type.Object({
      detailsPath: Type.String(),
      rows: Type.Array(Type.Object({ name: Type.String(), price: Type.Number() })),
    }),
    check: (o) => o?.detailsPath?.startsWith('/details') && o.rows?.length === 2,
  },
  {
    id: 'partial-checkpoint',
    task: (u) =>
      `Open ${u}. For each product, record {name, price} and call checkpoint("products", <array so far>, {partial: true}) after each one. Finally return the full list.`,
    schema: Type.Object({
      products: Type.Array(Type.Object({ name: Type.String(), price: Type.Number() })),
    }),
    check: (o) => o?.products?.length === 2,
    maxSteps: 3, // tight budget: exercise partial delivery
  },
];

const only = new Set(process.argv.slice(2));
const models = await defaultModels();
const fixture = await startFixture();
const rows = [];
await mkdir('spike/workspace', { recursive: true });

for (const t of tasks) {
  if (only.size && !only.has(t.id)) continue;
  const agent = await BrowserUse.create({
    model: DEFAULT_MODEL,
    models,
    reasoning: process.env.SPIKE_REASONING ?? 'low',
    telemetry: false,
    log: 'pretty',
    workspace: `spike/workspace/${t.id}`,
  });
  const t0 = Date.now();
  let r;
  try {
    r = await agent.run(t.task(fixture.url), {
      schema: t.schema,
      maxSteps: t.maxSteps ?? 12,
      timeoutMs: 180_000,
    });
  } catch (e) {
    r = { status: 'threw', error: String(e) };
  } finally {
    await agent.close();
  }
  const output = r.output ?? r.partial?.value ?? r.checkpoints?.products;
  rows.push({
    id: t.id,
    status: r.status,
    pass: !!t.check(output),
    steps: r.steps,
    ms: Date.now() - t0,
    cost: r.usage?.cost?.total,
    tokens: r.usage?.totalTokens,
    error: r.error,
    output,
  });
  console.error(`### ${t.id}: ${r.status} pass=${rows.at(-1).pass}`);
}
await fixture.close();
await writeFile('spike/results.json', JSON.stringify({ model: DEFAULT_MODEL, rows }, null, 2));
console.table(rows.map(({ output, ...r }) => r));
