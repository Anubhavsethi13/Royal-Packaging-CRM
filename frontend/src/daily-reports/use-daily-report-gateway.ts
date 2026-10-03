import { useMemo } from 'react';
import { useRepositories } from '../state/repositories';
import { createApiDailyReportGateway, createMockDailyReportGateway, type DailyReportGateway } from './daily-report-gateway';

// One in-memory store per page load so preview-mode reports survive navigation.
let sharedMockGateway: DailyReportGateway | null = null;

/** Picks the API or preview gateway from the configured data mode (mirrors the repository provider). */
export function useDailyReportGateway(): DailyReportGateway {
  const { mode } = useRepositories();
  return useMemo(() => {
    if (mode === 'api') return createApiDailyReportGateway();
    sharedMockGateway ??= createMockDailyReportGateway();
    return sharedMockGateway;
  }, [mode]);
}
