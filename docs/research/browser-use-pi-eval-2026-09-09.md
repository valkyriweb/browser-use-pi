# Browser Use Pi evaluation — 2026-09-09

## Outcome

**Browser Use Pi is a real TypeScript SDK, not merely a Pi skill or a browser wrapper.** It embeds a Pi agent loop, a persistent Node/V8 JavaScript worker, and direct Chrome DevTools Protocol (CDP) control. It supports local Chrome/Chromium, an existing Chrome CDP endpoint, or Browser Use Cloud; it adds session/history/workspace persistence, events, recordings, typed results, limits, partial checkpoints, policies, and a Python bridge.

The tweet's claims about Astra and hill-climbing on real browser evaluations are **not proven by this checkout**. The current code proves the architecture and local contract tests, but the checked-in benchmark table explicitly says its historical runs predate the current candidate and are not scores for it.

**Recommendation: SPIKE, narrowly and locally; do not make it a skill or adopt it into the fleet yet.** The code-mode browser architecture is worth comparing against Luke's existing browser stack, but the package overlaps heavily with existing PinchTab/browser-toolkit capabilities and has no Harbor or Herdr integration. A spike should be a disposable local-Chrome comparison on synthetic tasks, with telemetry disabled, no credentials, no cloud browser, and no Harbor/fleet changes.

## Artifact and scope

- Report: `docs/research/browser-use-pi-eval-2026-09-09.md`
- Checkout: `browser-use/browser-use-pi`
- Inspected commit: `e0df2743e680125a4378d4d578420917620711f2` (`Introduce Browser Use Pi and @browser_use/pi (#3)`), a single grafted commit in this checkout.
- Package: `@browser_use/pi`, version `0.1.0`, MIT licensed.
- Required research guidance: `~/.agents/skills/matt-pocock/references/research.md`; followed its primary-source rule.
- Tweet: direct fetch of `https://x.com/gregpr07/status/2097576334302355854` returned HTTP 403. I therefore treat the tweet only as the supplied marketing lead, not as evidence.

## What the repository proves

### README and package surface

The README describes the intended pipeline as:

> “Pi Mono + a persistent V8 REPL + raw CDP. The agent writes JavaScript, controls Chrome, and builds the helpers it needs as it goes.” (`README.md`)

It exposes `BrowserUse.create`, `run`, `followUp`, `Browser.cloud`, workspaces, streaming/hooks, typed results, sessions, and step/time/cost limits. `package.json` makes the product boundary clear:

> `"name": "@browser_use/pi"`, `"version": "0.1.0"`

The runtime dependencies are exact pins to `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, and `@earendil-works/pi-coding-agent`, all `0.85.1`, plus `devtools-protocol` and `typebox`. This is a consumer of the published Pi packages, not a checkout of Luke's customized Pi fork.

### Actual architecture

- `src/index.ts`: `BrowserUse` owns the model, `BrowserRuntime`, browser connection, transcript, events, history, recordings, and lifecycle. `run()` starts a fresh transcript; `followUp()` keeps the conversation.
- `src/agent.ts`: uses Pi's `Agent` and model APIs. The browser tool is one sequential `javascript` tool with `replay: 'never'`; the finish tools validate typed output. Defaults are 40 turns, 300,000 ms per run, and 240,000 context characters. Cost is a soft between-turn boundary and may overshoot one response.
- `src/runtime.ts` and `src/worker.ts`: fork a Node worker, create a V8 `vm` REPL realm, and keep top-level variables/functions alive across cells. The worker has a 256 MB V8 heap cap, an empty environment, and an IPC boundary. Cell cancellation/timeout kills the worker and loses JS state; browser mutations and files may survive, so recovery tells the model to inspect rather than replay.
- `src/cdp.ts` and `src/page.ts`: send typed raw CDP commands over one flattened WebSocket. Page helpers are limited to navigation, info, evaluation, waits, accessibility-tree snapshots, coordinate clicks, screenshots, tabs, and raw `cdp` calls. `src/prompt.ts` explicitly says “No Playwright or hidden selector/action engine.”
- `src/browser.ts`: supports local isolated Chromium, an existing Chrome/CDP endpoint, and Browser Use Cloud. Cloud creation is a direct `POST https://api.browser-use.com/api/v3/browsers`; cleanup is a `PATCH` stop request. The implementation deliberately does not retry provisioning because an ambiguous POST may already have created a billable browser.
- `src/index.ts`, `src/events.ts`, `src/history.ts`, `src/recording.ts`, and `src/video.ts`: provide event streams, JSONL journals, saved transcript history, optional CDP-frame recordings, and GIF/MP4 export.
- `src/server.ts` plus `python/browser_use_next/`: provide a private stdio bridge and a thin Python client over the same Node engine. This is more than a Pi extension or prompt skill.

### Confirmed product features

The following are backed by code/docs rather than the tweet:

- **Persistent sessions:** `run` resets the transcript but reuses the browser, JS, and workspace; `followUp` continues the transcript; `profileDir` preserves local Chrome state; `historyFile` restores the transcript but not JS bindings or browser login (`docs/sessions.md`).
- **Streaming/control:** `events()`, `onEvent`, `observe`, pause/resume/steer/cancel, hooks, and model streaming are implemented (`src/index.ts`, `src/agent.ts`, `src/model-stream.ts`).
- **Limits:** max steps, wall-clock timeout, model/cell/CDP/hook/compaction deadlines, context limit, and soft cost cap (`src/types.ts`, `src/agent.ts`).
- **Partial work:** `checkpoint(name, value, { partial: true })` atomically publishes the last partial value; it is intentionally not promoted to a completed result (`src/worker.ts`, `docs/api.md`).
- **Browser policy and secrets:** domain allow/deny rules, isolated-world named-secret insertion, text redaction, and optional telemetry (`src/policy.ts`, `src/history.ts`, `src/telemetry.ts`).
- **Optional Pi coding tools:** `researchTools: true` exposes Pi read/write/edit/bash, but the docs and code explicitly say this is not a sandbox (`src/research-tools.ts`, `docs/api.md`).

## Marketing vs. evidence

| Claim/source layer | Finding |
|---|---|
| Tweet | Announcement/marketing lead only. Direct X retrieval was 403; no tweet claim is used as proof. |
| README/docs | Confirm Pi + persistent V8 REPL + raw CDP, local/cloud browser choices, sessions, streaming, limits, and API shape. |
| Source | Confirms the worker, Pi model loop, raw CDP, cloud provisioning, persistence, policies, telemetry, and Python bridge. |
| Tests | Substantial local coverage: 17 `*.test.mjs` files plus Python/evidence tests, faux providers, local HTTP fixtures, real local Chrome, worker crash/timeout/recovery, policy, sessions, recordings, and eval-adapter contracts. |
| Evals/benchmarks | `eval/run.mjs` is a cloud-eval adapter and would provision a cloud browser per task. No cloud eval was run here. `docs/benchmarks.md` says historical runs predate the simplified candidate and “are not scores for the current candidate.” There is no current candidate score or checked-in run artifact in this checkout. |
| License | `LICENSE` is MIT, copyright 2026 Browser Use contributors. |

The repository therefore supports “working SDK with meaningful local tests,” but not “Astra hill-climbed this exact release on real-browser evals,” benchmark parity, or production readiness.

## Security and operational boundaries

The main blocker for unattended or multi-tenant use is the execution model, not the browser API:

- `docs/browser.md` and `docs/sessions.md` say generated JavaScript has filesystem and network access and that the worker is **not a security sandbox**.
- `src/policy.ts` documents navigation policy as a document-navigation guard, not network isolation: subresources, page fetches, arbitrary Node code, and separate CDP connections remain outside it.
- Named secrets are redacted from text/history/checkpoints, but screenshots, recordings, transformed secrets, and files written directly by generated code are not automatically sanitized.
- Anonymous telemetry is on by default. The payload is narrowly allowlisted, but it still makes a network request to EU PostHog unless `telemetry: false`, `DO_NOT_TRACK=1`, or `ANONYMIZED_TELEMETRY=false` is set.
- Cloud mode requires a Browser Use API key and can incur provider charges. No cloud browser was provisioned for this evaluation.

## Relation to Luke's stack

### Luke's Pi

The primary Pi source (`/Users/luke/Projects/oss/pi-mono`, HEAD `ddc0bfa98970e2f6ff5e644f509a5f11f20a8b9e`) describes the Pi Agent Harness packages as `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-ai`. Browser Use Pi consumes those same package names at `0.85.1`.

Luke's local inventory (`/Users/luke/Projects/personal/my-pi/docs/pi-stack-inventory.md`) distinguishes plain `pi` (upstream-equivalent) from customized `pii` (the `pi-mono-fork` plus `my-pi` profile). Browser Use Pi is therefore closest to the plain Pi package/runtime, not to Luke's fork extensions, cache/provider routing, Pi/Claude bridge, or daily-driver `pii`. It could be run by an application launched from either runtime, but it is not a drop-in my-pi extension and does not use Luke's fleet model routing by default.

### Harbor

Harbor is the lane/fleet coordination layer in `/Users/luke/Projects/personal/harbor` (local HEAD `b6903a5a833dd14188ec5a095944bbefd0763a1c`). Its package and task/fleet artifacts concern spawning and supervising agent lanes, worktrees, attention, and reporting through Agent Relay. The Browser Use Pi checkout contains no Harbor import, protocol, plugin, task runner, or relay integration.

The relationship is complementary only: a Harbor lane could launch a Node program that uses Browser Use Pi, but that would be an application-level child process with separate browser/profile/API-key lifecycle. It would not automatically become Harbor-visible, attention-aware, or fleet-safe. No Harbor files were changed.

### Herdr

Herdr (`/Users/luke/Projects/oss/herdr`, HEAD `da49cb8a9dac6facc8f77671376914ee0ef47291`) is a Rust background terminal/agent runtime. Its README says it keeps terminals and agent sessions alive, exposes CLI/socket control, and “owns their terminals” rather than replacing the agents. Browser Use Pi owns a Node worker plus Chrome/CDP; it has no Herdr plugin or socket integration. It could be hosted inside a Herdr pane, but Herdr would only supervise the terminal process, not the browser session's budgets, cloud billing, profile locks, or browser-specific events.

### Luke's browser-agent stack

The closest existing overlap is PinchTab and the `browser-toolkit`/site-client path:

- PinchTab (`/Users/luke/Projects/oss/pinchtab`, HEAD `e1392ecb8d45d440ddad8c1b531eb4d7c1c926aa`) is a **server-first**, local-first Chrome control plane with an HTTP API, managed profiles/instances, daemon lifecycle, and operator security gates. Its README says the normal journey is to point agents at a local control-plane endpoint.
- Luke's `my-pi` evidence records `browser-toolkit` as the default for browser automation and routes portable agent environments toward PinchTab; repeat same-service work is often intentionally converted to site clients instead of driving a browser.
- Browser Use Pi instead embeds an agent loop and raw CDP in the application process, with a persistent code-mode REPL and optional Browser Use Cloud. It is more programmable and self-contained per task, but less aligned with the existing shared browser daemon/fleet lifecycle.
- There is no evidence this package replaces `cmux-browser`, PinchTab, or site-client conventions. It overlaps their browser-control substrate while adding a different agent/runtime layer.

## Recommendation

### Decision: targeted local spike; no skill, no adoption

Do **not** create a `browser-use-pi` skill now. A skill would only document a new SDK and would not solve the real integration questions; Luke already has browser-toolkit/PinchTab guidance. Do not register it as a model, add it to Harbor, or make it a fleet dependency.

A small spike is justified only to answer one concrete question: does code-mode persistent REPL + raw CDP improve a local browser task enough to justify a separate runtime? The spike should:

1. Use a disposable checkout, local Chrome only, synthetic fixture pages, `telemetry: false`, and the faux/local providers already used by the tests.
2. Compare 3–5 representative tasks against the current PinchTab/browser-toolkit path: AX discovery, authenticated-profile reuse using synthetic credentials, multi-tab/iframe work, bounded partial delivery, and recovery after worker timeout.
3. Measure task success, turns, latency, artifacts, cleanup, and failure/recovery behavior; do not infer performance from `docs/benchmarks.md`.
4. Keep Browser Use Pi behind an explicit child-process boundary if tested from Pi/Herdr; do not give it production credentials or shared Chrome profiles.
5. Stop if the result is merely another browser-control API, if the worker sandbox gap is unacceptable, or if lifecycle/telemetry costs exceed the local PinchTab path.

If no current task needs the code-mode behavior, the correct near-term action is **ignore for now**, retaining this report as the evidence-backed decision record.

## Commands and gates

Commands run in this checkout:

- `git rev-parse HEAD` → `e0df2743e680125a4378d4d578420917620711f2`.
- `npm ci --ignore-scripts` → completed; 564 packages installed, audit reported 0 vulnerabilities. This changed only ignored install artifacts, not tracked source.
- `npm run check` on a clean install → failed because examples import the package name before `dist/` exists (`Cannot find module '@browser-use/pi'`). This means the standalone `check` script is not clean-checkout safe.
- `npm run build && npm run check` → passed.
- `DO_NOT_TRACK=1 npm test` → did not complete within the 300-second command budget. Most earlier local tests passed, but the run reported failures in both tests in `test/evaluation-deadline.test.mjs` before the command timed out.
- `DO_NOT_TRACK=1 node --test test/evaluation-deadline.test.mjs` → both tests failed with `Error: CDP connection timed out.` The fixture hardcodes a 200 ms CDP connection deadline; this is an environment/timing blocker, not evidence that cloud execution works or that the architecture is correct.

No paid cloud browser was started. No model provider request was made. No npm publish, model registration, Harbor mutation, fleet mutation, or production credential use occurred.

## Blockers and open questions

1. **No current benchmark evidence:** the only benchmark table is historical and explicitly disclaims current-candidate scores.
2. **Cloud path untested by design:** validating Browser Use Cloud would require credentials and could create billable browser resources; it remains unverified here.
3. **Clean-checkout gate defect:** `npm run check` needs a prior build because examples resolve the package through `dist`.
4. **Local deadline test blocker:** the two 200 ms CDP-connection tests fail in this environment; the full serial suite exceeded the 300 s observation budget.
5. **No Harbor/Herdr integration:** lifecycle, attention, relay reporting, profile ownership, and browser cleanup would need a new adapter design.
6. **Worker is not a sandbox:** generated code has host filesystem/network access; this is unsuitable for untrusted tasks without a stronger OS/container boundary.
7. **Telemetry default-on:** any spike must explicitly set `telemetry: false`/`DO_NOT_TRACK=1`.
8. **Node/runtime footprint:** requires Node 22.19+ even when the caller is Bun; Windows is documented as unverified.
9. **Profile and cloud ownership:** persistent profiles are single-owner and cloud sessions are provider-managed; shared fleet use would need explicit locking and billing policy.

## Primary-source evidence index

- Browser Use Pi: `README.md`, `package.json`, `LICENSE`, `src/index.ts`, `src/agent.ts`, `src/browser.ts`, `src/cdp.ts`, `src/page.ts`, `src/runtime.ts`, `src/worker.ts`, `src/policy.ts`, `src/telemetry.ts`, `src/types.ts`, `src/prompt.ts`.
- Browser Use Pi docs/evals: `docs/api.md`, `docs/browser.md`, `docs/sessions.md`, `docs/benchmarks.md`, `eval/README.md`, `eval/run.mjs`, `test/*.test.mjs`.
- Pi: `/Users/luke/Projects/oss/pi-mono/README.md`, `/Users/luke/Projects/oss/pi-mono/package.json`, HEAD `ddc0bfa98970e2f6ff5e644f509a5f11f20a8b9e`.
- Luke Pi inventory: `/Users/luke/Projects/personal/my-pi/docs/pi-stack-inventory.md`, local HEAD `d3e05a39a041288137199998cee0d6e79586070a`.
- Harbor: `/Users/luke/Projects/personal/harbor/package.json`, `/Users/luke/Projects/personal/harbor/data/briefs/browser-use-pi-eval-260909.md`, local HEAD `b6903a5a833dd14188ec5a095944bbefd0763a1c`.
- Herdr: `/Users/luke/Projects/oss/herdr/README.md`, `/Users/luke/Projects/oss/herdr/AGENTS.md`, HEAD `da49cb8a9dac6facc8f77671376914ee0ef47291`.
- Browser-agent control plane: `/Users/luke/Projects/oss/pinchtab/README.md`, HEAD `e1392ecb8d45d440ddad8c1b531eb4d7c1c926aa`.
- Coordination transport: `/Users/luke/Projects/personal/agent-relay/README.md`, HEAD `d17e5d565e1be24aa47057e08aba46916a38c72d`.
