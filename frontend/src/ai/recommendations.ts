import type { DataMode } from '../state/repositories';

export interface RecommendationPreview {
  id: string;
  category: 'Productivity' | 'Efficiency' | 'Anomaly';
  title: string;
  explanation: string;
  priority: 'High' | 'Medium' | 'Low';
  entity: string;
  context: string;
  generatedAt: string;
}

export type RecommendationResult =
  | { state: 'success'; items: RecommendationPreview[]; preview: true }
  | { state: 'unavailable'; reason: string; preview: false };

const mockRecommendations: RecommendationPreview[] = [
  { id: 'rec-preview-001', category: 'Productivity', title: 'Review picker workload balance', explanation: 'One active picker is carrying a higher task load than the rest of the morning shift.', priority: 'High', entity: 'Meera Nair · RP-EMP-024', context: '24 assigned tasks · Morning shift', generatedAt: 'Today · 10:15' },
  { id: 'rec-preview-002', category: 'Efficiency', title: 'Review staged inventory dwell time', explanation: 'A staged material record has remained in the same position longer than the preview threshold.', priority: 'Medium', entity: 'CB-5P-1200 · INV-001', context: 'D1 · A03 · R02 · Staged', generatedAt: 'Today · 09:42' },
  { id: 'rec-preview-003', category: 'Anomaly', title: 'Review order risk signal', explanation: 'An urgent order is progressing below its illustrative fulfilment trajectory.', priority: 'Medium', entity: 'RP-10461 · Zenith Pharma', context: '42% fulfilled · Due today', generatedAt: 'Today · 09:18' },
];

export function loadRecommendations(mode: DataMode): Promise<RecommendationResult> {
  if (mode === 'api') return Promise.resolve({ state: 'unavailable', reason: 'AI recommendation API contract is not confirmed.', preview: false });
  return Promise.resolve({ state: 'success', items: mockRecommendations, preview: true });
}

export function recommendationPreviewItems() {
  return mockRecommendations;
}
