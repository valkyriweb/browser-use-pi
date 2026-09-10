// Loads Luke's Pi models.json (clawrouter etc.) as a pi-ai Models collection
// so Browser Use Pi can route through the local ClawRouter endpoint.
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { homedir } from 'node:os';
import { join } from 'node:path';

const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'vanilla-agent');

export async function loadLukeModels() {
  return ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
}

export const DEFAULT_MODEL = process.env.SPIKE_MODEL ?? 'clawrouter/gpt-5.6-luna';
