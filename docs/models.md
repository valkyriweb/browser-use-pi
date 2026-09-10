# Models

Use `provider/model`. Browser Use Pi uses upstream Pi’s pinned model catalog and transports; it does not fork the model loop or silently substitute models.

**Default (this fork):** when `model` is omitted, `BROWSER_USE_MODEL` is used, else `DEFAULT_MODEL` = `clawrouter/claude-sonnet-5`. When `models` is omitted, the collection is loaded from Pi’s `models.json` + `auth.json` (`PI_CODING_AGENT_DIR`, default `~/.pi/vanilla-agent`), so custom providers such as `clawrouter/...` resolve without extra wiring; it falls back to pi-ai builtins if no `models.json` exists.

**ClawRouter caveat:** model ids whose `api` is `openai-codex-responses` (e.g. `clawrouter/gpt-5.6-luna`) fail with `Failed to extract accountId from token` — that transport wants a ChatGPT OAuth JWT. Use `anthropic-messages` or `openai-completions` ids (e.g. `clawrouter/claude-sonnet-5`, `clawrouter/xai/grok-4.6`).

| Example                              | Environment variable |
| ------------------------------------ | -------------------- |
| `openrouter/openai/gpt-5.6-luna`     | `OPENROUTER_API_KEY` |
| `openrouter/openai/gpt-6-astra`      | `OPENROUTER_API_KEY` |
| `openrouter/anthropic/claude-opus-5` | `OPENROUTER_API_KEY` |
| `anthropic/claude-sonnet-4-6`        | `ANTHROPIC_API_KEY`  |

Provider access depends on your account. A catalog entry is not proof of entitlement. Screenshot interpretation requires a vision model.

```js
const agent = await BrowserUse.create({ reasoning: 'low' }); // clawrouter/claude-sonnet-5
const explicit = await BrowserUse.create({
  model: 'clawrouter/claude-opus-5',
  reasoning: 'xhigh',
});
```

Reasoning levels depend on the model. Inspect `builtinModels()` or supply `models` for a new endpoint/catalog. Advanced callers can override `streamFn`.

**Opus 5 / OpenRouter:** Pi 0.85.1’s Messages route sends an unsupported mid-conversation effort update. The default SDK resolution uses OpenRouter’s `/api/v1` completions transport for this exact model. Caller-supplied `models` collections are left untouched. Remove this compatibility patch when Pi’s upstream route is fixed.

Usage and costs come from the configured model catalog. They are estimates, not invoices. `maxCostUsd` is checked between turns and may overshoot by one response.
