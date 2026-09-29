import type { DataMode } from '../state/repositories';

export type OperationalSurface = 'warehouse' | 'locations' | 'loading-unloading' | 'operations';

/** Surfaces whose API contract is implemented and tested (see Docs/integration/supervisor-api-integration-diagnostic.md). */
export const API_CONNECTED_SURFACES: readonly OperationalSurface[] = ['warehouse', 'locations', 'loading-unloading'];

export function operationalSurfaceState(mode: DataMode, surface?: OperationalSurface): 'preview' | 'api' | 'unavailable' {
  if (mode === 'mock') return 'preview';
  return surface && API_CONNECTED_SURFACES.includes(surface) ? 'api' : 'unavailable';
}
