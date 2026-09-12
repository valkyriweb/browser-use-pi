import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Models } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Default model when none is given: ClawRouter via the local Pi models.json. */
export const DEFAULT_MODEL = 'clawrouter/gpt-5.6-luna';
/** Used instead of DEFAULT_MODEL when no Pi models.json registers its provider (pi-ai builtins only). */
export const BUILTIN_DEFAULT_MODEL = 'openai/gpt-5.4';

let cached: Promise<Models> | undefined;

function agentDir(): string {
  return (
    process.env.PI_CODING_AGENT_DIR ??
    process.env.BROWSER_USE_PI_DIR ??
    join(homedir(), '.pi', 'vanilla-agent')
  );
}

/**
 * The model to use when the caller supplied none: BROWSER_USE_MODEL, else DEFAULT_MODEL when the
 * loaded collection can resolve it, else BUILTIN_DEFAULT_MODEL. Never silently substitutes for an
 * explicit `model`.
 */
export function resolveDefaultModel(models: Models): string {
  const env = process.env.BROWSER_USE_MODEL;
  if (env) return env;
  const sep = DEFAULT_MODEL.indexOf('/');
  return models.getModel(DEFAULT_MODEL.slice(0, sep), DEFAULT_MODEL.slice(sep + 1))
    ? DEFAULT_MODEL
    : BUILTIN_DEFAULT_MODEL;
}

/**
 * Pi's configured model collection (~/.pi/<agent>/models.json + auth.json), so custom
 * providers such as `clawrouter/...` resolve without the caller passing `models`.
 * Falls back to pi-ai builtins when no models.json exists.
 */
export function defaultModels(): Promise<Models> {
  cached ??= (async () => {
    const dir = agentDir();
    const modelsPath = join(dir, 'models.json');
    if (!existsSync(modelsPath)) return builtinModels();
    return ModelRuntime.create({
      modelsPath,
      authPath: join(dir, 'auth.json'),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
  })().catch((error: unknown) => {
    cached = undefined; // do not pin a transient failure for the process lifetime
    throw error;
  });
  return cached;
}
