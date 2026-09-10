# Browser Use Pi — local spike results (2026-09-10)

Follow-up to `browser-use-pi-eval-2026-09-09.md`. Question: does code-mode (persistent V8 REPL + raw CDP) beat the existing tool-call browser path on Luke's stack, on real tasks, with the same model?

## Setup

- Checkout `e0df274`, built locally (`npm run build`). Harness in `spike/`.
- Model for both sides: `clawrouter/claude-sonnet-5`, reasoning `low`, via Luke's `~/.pi/vanilla-agent/models.json` loaded through `ModelRuntime` (`spike/models.mjs`). No OpenRouter key, no Browser Use Cloud, `telemetry: false` + `DO_NOT_TRACK=1`.
- Target: the repo's own local fixture (`test/fixture.mjs`) — search form, select, two-click state, iframe, shadow DOM, `target=_blank` tab, CSV download. Served on 127.0.0.1; no external sites, no credentials.
- Baseline: a headless `pi -p` session with the `chrome-devtools-axi` skill, same 5 tasks in one prompt, same model/thinking.

### Finding 0 — model routing

`openai-codex-responses` models in `models.json` (e.g. `clawrouter/gpt-5.6-luna`) fail inside Browser Use Pi with `Failed to extract accountId from token`: pi-ai's codex transport wants a ChatGPT OAuth JWT, not a ClawRouter key. Interactive `pii` works because it has extra auth plumbing. Anthropic-messages and openai-completions models route fine. **For SDK use, pick a non-codex model id.**

## Results — 5 tasks, same model

| task | Browser Use Pi | baseline (pi + chrome-devtools-axi) |
|---|---|---|
| ax-extract | pass · 2 steps · 5.8s | pass · 2 tool calls |
| form-flow (search, select, 2× click) | pass · 8 steps · 21s | pass · 7 tool calls |
| iframe + shadow DOM | pass · 6 steps · 14s | pass · 3 tool calls |
| new tab + CSV download | pass · 4 steps · 15s | pass · 5 tool calls |
| partial-checkpoint (maxSteps=3) | `max_steps`, but `checkpoint()` file held both products | pass (reused task-1 data) |
| **totals** | **67s wall · 23 model turns · 99k tok · $0.157** | **214s wall · 31 turns · 30 tool calls · 773k tok (747k cache-read) · $0.282** |

Both sides solved every task. Browser Use Pi was ~3× faster and ~45% cheaper on this set; the baseline burned tokens re-reading its own context each tool call (one Pi session holding all five tasks), so the cost gap is partly a benchmark artifact — per-task fresh sessions would narrow it.

## Behaviours verified (not just claimed)

- **JS state persists across `followUp()` and across a fresh `run()`** (`spike/followup.mjs`): a `products()` helper defined in run 1 was called in the follow-up (2 steps) and again in a new transcript (3 steps) without being redefined.
- **Worker-kill recovery** (`spike/recovery.mjs`, `cellTimeoutMs: 1500`): the timed-out cell killed the worker; the tool result told the model "JavaScript state was reset; inspect the page before retrying. Actions may already have happened." Browser stayed up; task completed in 6 steps.
- **Partial checkpoints survive `max_steps`**: `spike/workspace/partial-checkpoint/products` contained the full array even though the run was cut off.
- **Typed output**: `schema` in `RunOptions` (not a positional arg) enforces the shape; without it the model returns prose.

## What it does *not* solve

- No Harbor/Herdr/agent-relay awareness — it is an in-process SDK; lifecycle, attention and reporting still need a wrapper.
- Worker is not a sandbox (host fs + network). Untrusted tasks need an OS/container boundary.
- Shared Chrome profile ownership is single-writer; fleet use needs locking.
- Codex-route models are unusable via API key (Finding 0).

## Recommendation

**Adopt for a narrow slot: scripted, multi-step browser jobs run as a child process, not as a Pi skill replacement.** On this evidence it is materially faster and cheaper than the tool-call path for anything beyond 2–3 actions, and its recovery/checkpoint semantics are the best I've seen for unattended work. Keep `chrome-devtools-axi`/PinchTab for interactive "look at this page" work from a live session.

Concrete next steps (in order):
1. Wrap `spike/models.mjs` + `BrowserUse.create` into a tiny `bu-run <task> [--schema]` CLI so a Pi session or Harbor lane can shell out to it. Reuse `spike/bench.mjs` as its smoke test.
2. Re-run the bench with per-task fresh baseline sessions to get an honest cost delta; add one real-site task with a throwaway `profileDir`.
3. Decide sandboxing: run the CLI inside the existing sandbox-runner if tasks may touch untrusted pages.

Artifacts: `spike/{models,smoke,bench,followup,recovery}.mjs`, `spike/results.json`, `spike/baseline/{prompt.md,out2.txt,time2.txt}`, run journals under `spike/workspace/*/.browser-use/runs/`.
