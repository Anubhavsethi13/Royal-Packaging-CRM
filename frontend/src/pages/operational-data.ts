import type { DataMode } from '../state/repositories';

export function operationalSurfaceState(mode: DataMode): 'preview' | 'unavailable' {
  return mode === 'mock' ? 'preview' : 'unavailable';
}
