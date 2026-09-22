import { describe, expect, it } from 'vitest';
import { loadRecommendations, recommendationPreviewItems } from './recommendations';

describe('recommendation boundary', () => {
  it('provides deterministic advisory preview data in mock mode', async () => {
    const result = await loadRecommendations('mock');
    expect(result).toMatchObject({ state: 'success', preview: true });
    if (result.state === 'success') {
      expect(result.items).toEqual(recommendationPreviewItems());
      expect(result.items[0]).not.toHaveProperty('confidence');
    }
  });

  it('does not fall back to mock recommendations in API mode', async () => {
    await expect(loadRecommendations('api')).resolves.toEqual({ state: 'unavailable', reason: 'AI recommendation API contract is not confirmed.', preview: false });
  });
});
