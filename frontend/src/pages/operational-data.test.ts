import { describe, expect, it } from 'vitest';
import { operationalSurfaceState } from './operational-data';

describe('operational surface mode boundary', () => {
  it('keeps operational preview screens available in mock mode', () => {
    expect(operationalSurfaceState('mock')).toBe('preview');
  });

  it('does not expose mock operational data in API mode', () => {
    expect(operationalSurfaceState('api')).toBe('unavailable');
  });
});
