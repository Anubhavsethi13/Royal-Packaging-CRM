import { useMemo } from 'react';
import { useRepositories } from '../state/repositories';
import { createApiManagementKpiGateway, createMockManagementKpiGateway, type ManagementKpiGateway } from './management-kpi-gateway';
import { createApiShiftGateway, createMockShiftGateway, type ShiftGateway } from './shift-gateway';

// One in-memory store per page load so preview-mode entries survive navigating between the shift screens.
let sharedMockGateway: ShiftGateway | null = null;

/** Picks the API or preview gateway from the configured data mode (mirrors the repository provider). */
export function useShiftGateway(): ShiftGateway {
  const { mode } = useRepositories();
  return useMemo(() => {
    if (mode === 'api') return createApiShiftGateway();
    sharedMockGateway ??= createMockShiftGateway();
    return sharedMockGateway;
  }, [mode]);
}

let sharedMockManagementGateway: ManagementKpiGateway | null = null;

/** Management summary gateway for the configured data mode. */
export function useManagementKpiGateway(): ManagementKpiGateway {
  const { mode } = useRepositories();
  return useMemo(() => {
    if (mode === 'api') return createApiManagementKpiGateway();
    sharedMockManagementGateway ??= createMockManagementKpiGateway();
    return sharedMockManagementGateway;
  }, [mode]);
}
