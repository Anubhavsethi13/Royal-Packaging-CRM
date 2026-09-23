import { describe, expect, it } from 'vitest';
import { createRepositorySelection, resolveDataMode } from './repositories';
import { repositories as mockRepositories } from '../mock/repositories';

const decodeDetail = <T,>(payload: unknown) => payload as T;
const apiConfig = {
  clients: { resourcePath: '/configured/clients', decodeDetail },
  orders: { resourcePath: '/configured/orders', decodeDetail },
  inventory: { resourcePath: '/configured/inventory', decodeDetail },
  employees: { resourcePath: '/configured/employees', decodeDetail },
  tasks: { resourcePath: '/configured/tasks', decodeDetail },
  kpis: { resourcePath: '/configured/kpis', decodeDetail },
  incentives: { resourcePath: '/configured/incentives', decodeDetail },
  payroll: { resourcePath: '/configured/payroll', decodeDetail },
  audits: { resourcePath: '/configured/audits', decodeDetail },
  reports: { resourcePath: '/configured/reports', decodeDetail },
};

describe('repository mode selection', () => {
  it('selects the unchanged mock repository collection in mock mode', () => {
    const selection = createRepositorySelection('mock');
    if (selection.mode !== 'mock') throw new Error('Expected mock mode.');
    expect(selection.mode).toBe('mock');
    expect(selection.repositories).toBe(mockRepositories);
    expect(selection.repositories.clients.peek()).toEqual(expect.any(Array));
  });

  it('selects configured API repositories without exposing synchronous peek', () => {
    const selection = createRepositorySelection('api', apiConfig);
    expect(selection.mode).toBe('api');
    expect(Object.keys(selection.repositories)).toEqual(['clients', 'orders', 'inventory', 'employees', 'tasks', 'kpis', 'kpiResults', 'incentives', 'payroll', 'audits', 'reports']);
    expect('peek' in selection.repositories.clients).toBe(false);
  });

  it('keeps KPI result API access explicitly unavailable until its contract exists', async () => {
    const selection = createRepositorySelection('api', apiConfig);
    await expect(selection.repositories.kpiResults.list()).rejects.toThrow('KPI result API contract is not available');
  });

  it('resolves only the supported modes and defaults an unset mode to mock in development', () => {
    expect(resolveDataMode(undefined, false)).toBe('mock');
    expect(resolveDataMode('mock', false)).toBe('mock');
    expect(resolveDataMode('api', false)).toBe('api');
    expect(() => resolveDataMode('preview', false)).toThrow('Invalid VITE_DATA_MODE');
  });

  it('fails API selection when configuration is missing instead of using mocks', () => {
    expect(() => createRepositorySelection('api')).toThrow('no mock fallback is available');
  });

  it('P0-03: enforces strict API mode in production and rejects mock mode or missing mode', () => {
    expect(resolveDataMode('api', true)).toBe('api');
    expect(() => resolveDataMode('mock', true)).toThrow("VITE_DATA_MODE cannot be set to 'mock' in production");
    expect(() => resolveDataMode(undefined, true)).toThrow("VITE_DATA_MODE must be explicitly set to 'api' in production");
    expect(() => resolveDataMode('', true)).toThrow("VITE_DATA_MODE must be explicitly set to 'api' in production");
  });
});
