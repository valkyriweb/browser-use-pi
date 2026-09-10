import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Models } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Default model when none is given: ClawRouter via the local Pi models.json. */
export const DEFAULT_MODEL = 'clawrouter/claude-sonnet-5';

let cached: Promise<Models> | undefined;

/**
 * Pi's configured model collection (~/.pi/<agent>/models.json + auth.json), so custom
 * providers such as `clawrouter/...` resolve without the caller passing `models`.
 * Falls back to pi-ai builtins when no models.json exists.
 */
export function defaultModels(): Promise<Models> {
  cached ??= (async () => {
    const dir =
      process.env.PI_CODING_AGENT_DIR ??
      process.env.BROWSER_USE_PI_DIR ??
      join(homedir(), '.pi', 'vanilla-agent');
    const modelsPath = join(dir, 'models.json');
    if (!existsSync(modelsPath)) return builtinModels();
    return ModelRuntime.create({
      modelsPath,
      authPath: join(dir, 'auth.json'),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
  })();
  return cached;
}
