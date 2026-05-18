import { describe, expect, it } from 'vitest';
import {
  RENDER_ENGINE_VERSION,
  activeJobMatchesRequestedProvider,
  engineForProviderRenderId,
  selectedRenderProvider,
} from './provider';

describe('render provider selection', () => {
  it('defaults to auto when no provider is supplied', () => {
    expect(selectedRenderProvider({})).toBe('auto');
  });

  it('allows founder requests to force the native A7 engine', () => {
    expect(selectedRenderProvider({ requestProvider: 'a7_engine' })).toBe('a7_engine');
  });

  it('lets explicit founder test requests override environment defaults', () => {
    expect(selectedRenderProvider({ envProvider: 'shotstack', requestProvider: 'a7_engine' })).toBe('a7_engine');
  });

  it('falls back to auto for invalid provider values', () => {
    expect(selectedRenderProvider({ envProvider: 'bogus' })).toBe('auto');
  });

  it('identifies native A7 engine render ids', () => {
    expect(engineForProviderRenderId('a7_engine:abc123')).toEqual({
      engine: 'a7_engine',
      engineVersion: RENDER_ENGINE_VERSION,
    });
    expect(engineForProviderRenderId('shotstack-123')).toEqual({
      engine: 'shotstack',
      engineVersion: 'shotstack',
    });
  });

  it('does not let an active job from another explicit provider mask founder tests', () => {
    expect(
      activeJobMatchesRequestedProvider({
        requestedProvider: 'a7_engine',
        renderEngine: 'shotstack',
        providerRenderId: 'shotstack-123',
      })
    ).toBe(false);
    expect(
      activeJobMatchesRequestedProvider({
        requestedProvider: 'auto',
        renderEngine: 'shotstack',
        providerRenderId: 'shotstack-123',
      })
    ).toBe(true);
  });
});
