# Upstream

- Upstream: github.com/browser-use/browser-use-pi
- Package: @browser_use/pi
- Forked from: e0df274 (v0.1.0, "Introduce Browser Use Pi and @browser_use/pi (#3)")
- License: MIT (c) 2026 Browser Use contributors — kept in LICENSE
- Why forked: run through Luke's Pi stack (ClawRouter, `~/.pi/vanilla-agent/models.json`) without per-call wiring; codex-route models via API key
- Divergence: light — see below

## What differs

- `src/models.ts` (added): `defaultModels()` loads Pi's `models.json` + `auth.json`; `DEFAULT_MODEL = clawrouter/gpt-5.6-luna`.
- `src/index.ts`, `src/server.ts`, `src/types.ts`, `src/agent.ts`: `model` optional; `BROWSER_USE_MODEL` env; default collection from `defaultModels()`.
- `scripts/patch-pi-ai.mjs` + `postinstall`: pi-ai `openai-codex-responses` honours `compat.sendChatgptAccountId: false` (port of the pi-mono-fork guard). Drop when upstream pi-ai ships it.
- `examples/*`, `README.md`, `docs/{api,models,python}.md`: default model examples point at clawrouter.
- `spike/`, `docs/research/`: evaluation harness and reports (not product code).

## Refresh from upstream

```sh
git fetch upstream && git rebase upstream/main   # or merge
# conflicts expected only in the files listed above
# then bump "Forked from"
```
