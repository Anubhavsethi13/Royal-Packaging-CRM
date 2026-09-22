import { useEffect, useState } from 'react';
import { BrainCircuit, ShieldCheck } from 'lucide-react';
import { useAuth } from '../state/auth';
import { useRepositories } from '../state/repositories';
import { Alert, Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui';
import { loadRecommendations, type RecommendationPreview } from './recommendations';

export function RecommendationsPage() {
  const { mode } = useRepositories();
  const { session } = useAuth();
  const [items, setItems] = useState<RecommendationPreview[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'empty' | 'error' | 'unavailable'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setState('loading');
    setError('');
    void loadRecommendations(mode).then((result) => {
      if (!active) return;
      if (result.state === 'unavailable') { setState('unavailable'); setError(result.reason); return; }
      setItems(result.items);
      setState(result.items.length ? 'success' : 'empty');
    }).catch((requestError: unknown) => {
      if (!active) return;
      setState('error');
      setError(requestError instanceof Error ? requestError.message : 'Recommendations could not be loaded.');
    });
    return () => { active = false; };
  }, [mode]);

  if (!session?.roles.includes('SUPER_ADMIN')) return <EmptyState icon={ShieldCheck} title="Recommendations unavailable" description="This preview surface is limited to the existing Super Admin preview role. Backend authorization remains authoritative." />;
  if (state === 'loading') return <LoadingState label="Loading recommendations" />;
  if (state === 'error') return <ErrorState title="Recommendations could not be loaded" description={error} />;
  if (state === 'unavailable') return <><PageHeader eyebrow="Decision support" title="AI recommendations" description="Advisory signals for human review across productivity, efficiency, and operational risk." /><EmptyState icon={BrainCircuit} title="AI recommendations are not configured" description={error} /></>;
  if (state === 'empty') return <><PageHeader eyebrow="Decision support" title="AI recommendations" description="Advisory signals for human review across productivity, efficiency, and operational risk." /><EmptyState icon={BrainCircuit} title="No recommendations" description="No advisory signals are available for this view." /></>;
  return <><PageHeader eyebrow="Decision support" title="AI recommendations" description="Advisory signals for human review across productivity, efficiency, and operational risk." /><Alert tone="warning" title="Preview recommendations">These deterministic records are mock advisory content. They do not change tasks, employees, inventory, orders, incentives, payroll, or KPI targets.</Alert><div className="surface-grid">{items.map((item) => <Card className="structure-card" key={item.id}><div className="section-heading"><div><span className="section-kicker">{item.category}</span><h2>{item.title}</h2></div><Badge tone={item.priority === 'High' ? 'warning' : 'neutral'}>{item.priority} priority</Badge></div><p className="body-copy">{item.explanation}</p><div className="detail-facts"><span><small>Affected context</small><strong>{item.entity}</strong></span><span><small>Evidence</small><strong>{item.context}</strong></span><span><small>Generated</small><strong>{item.generatedAt}</strong></span></div><div className="structure-footer"><StatusBadge status="Preview" /><span className="mono">Human review required</span></div></Card>)}</div></>;
}
