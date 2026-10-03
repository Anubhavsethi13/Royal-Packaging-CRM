import { describe, expect, it } from 'vitest';
import vercel from '../../vercel.json';
import { resolveApiBaseUrl } from './client';

// Production uses the same-origin /api proxy: the browser only talks to the
// Vercel origin, so the backend's SameSite=Lax session cookie is first-party.
describe('Vercel deployment configuration', () => {
  const rewrites = vercel.rewrites;

  it('proxies /api/* to the backend before the SPA fallback', () => {
    const apiIndex = rewrites.findIndex((rule) => rule.source === '/api/:path*');
    const spaIndex = rewrites.findIndex((rule) => rule.destination === '/index.html');
    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(spaIndex).toBe(rewrites.length - 1);
    expect(apiIndex).toBeLessThan(spaIndex);
  });

  it('targets an https backend origin and keeps the /api prefix and path', () => {
    const api = rewrites.find((rule) => rule.source === '/api/:path*');
    const destination = new URL(api?.destination ?? '');
    expect(destination.protocol).toBe('https:');
    expect(destination.pathname).toBe('/api/:path*');
    expect(destination.hostname).not.toMatch(/localhost|127\.0\.0\.1|vercel\.app$/);
  });

  it('preserves the existing build settings', () => {
    expect(vercel.framework).toBe('vite');
    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.outputDirectory).toBe('dist');
  });

  it('accepts the relative /api base URL in production', () => {
    expect(resolveApiBaseUrl('/api', true)).toBe('/api');
  });
});
