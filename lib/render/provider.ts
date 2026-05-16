import { A7_ENGINE_RENDER_ID_PREFIX } from '@/lib/a7-engine/renderer';

export type RenderProvider = 'auto' | 'a7_engine' | 'shotstack';
export type RenderEngine = 'a7_engine' | 'shotstack';

export const RENDER_ENGINE_VERSION = 'a7-engine-ffmpeg-v0.1';

export function selectedRenderProvider(input: {
  envProvider?: unknown;
  requestProvider?: unknown;
}): RenderProvider {
  const candidate = String(input.envProvider ?? input.requestProvider ?? 'auto').toLowerCase();
  if (candidate === 'a7_engine' || candidate === 'shotstack' || candidate === 'auto') {
    return candidate;
  }
  return 'auto';
}

export function engineForProviderRenderId(providerRenderId: unknown): {
  engine: RenderEngine;
  engineVersion: string;
} {
  const renderId = String(providerRenderId ?? '');
  if (renderId.startsWith(A7_ENGINE_RENDER_ID_PREFIX)) {
    return { engine: 'a7_engine', engineVersion: RENDER_ENGINE_VERSION };
  }
  return { engine: 'shotstack', engineVersion: 'shotstack' };
}
