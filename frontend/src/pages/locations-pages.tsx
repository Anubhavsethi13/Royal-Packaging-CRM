import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useAuth } from '../state/auth';
import { ApiError } from '../api/client';
import { Badge, Button, Card, EmptyState, ErrorState, FilterBar, LoadingState, PageHeader, Pagination, SearchField, Select } from '../components/ui';
import type { LocationRecord } from './warehouse-api';
import { describeWarehouseError, fetchLocations, type LocationPage, type LocationQuery } from './warehouse-gateway';

const PAGE_SIZE = 24;

function locationStatus(location: LocationRecord): { label: string; tone: 'success' | 'neutral' | 'warning' } {
  if (!location.warehouse.active) return { label: 'Warehouse inactive', tone: 'warning' };
  return location.active ? { label: 'Active', tone: 'success' } : { label: 'Inactive', tone: 'neutral' };
}

/** Presentational list (props only). Occupancy and restriction policy are not modelled, so they are not shown. */
export function LocationsView({ page, onPageChange }: { page: LocationPage; onPageChange?: (page: number) => void }) {
  if (page.items.length === 0) return <Card><EmptyState icon={MapPin} title="No locations match" description="No warehouse locations match these filters. Clear the search or status filter." /></Card>;
  return <>
    <div className="surface-grid">{page.items.map((location, index) => {
      const status = locationStatus(location);
      return <Card className="structure-card" key={location.id}>
        <div className={`location-marker marker-${index % 3}`}><MapPin size={18} /></div>
        <h3>{location.code} · {location.name}</h3>
        <p>{location.warehouse.name} ({location.warehouse.code}){location.parent ? ` · within ${location.parent.code}` : ''}</p>
        <div className="structure-footer"><Badge tone={status.tone}>{status.label}</Badge><span className="mono">{location.boxOnHand.toLocaleString('en-US')} BOX on hand</span></div>
      </Card>;
    })}</div>
    {page.totalPages > 1 && <Pagination page={page.page} totalPages={page.totalPages} onChange={onPageChange} />}
  </>;
}

/** API-mode Locations page backed by GET /locations. */
export function ApiLocationsPage() {
  const { expireSession } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'true' | 'false'>('all');
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<LocationPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPage(null);
    setError(null);
    const query: LocationQuery = { page: pageNumber, pageSize: PAGE_SIZE, search, active: status === 'all' ? undefined : status };
    fetchLocations(query).then((result) => { if (active) setPage(result); }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) expireSession();
      setError(describeWarehouseError(cause, 'Locations could not be loaded.'));
    });
    return () => { active = false; };
  }, [expireSession, pageNumber, search, status]);

  return <>
    <PageHeader eyebrow="Warehouse structure" title="Locations" description="Warehouse locations with their depot, parent location, and BOX currently on hand." />
    <FilterBar resultLabel={page ? `${page.total} location${page.total === 1 ? '' : 's'}` : undefined}>
      <SearchField placeholder="Search location or warehouse" value={search} onChange={(value) => { setSearch(value); setPageNumber(1); }} />
      <Select aria-label="Filter location status" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPageNumber(1); }}><option value="all">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></Select>
      <Button variant="ghost" disabled={!search && status === 'all'} onClick={() => { setSearch(''); setStatus('all'); setPageNumber(1); }}>Clear filters</Button>
    </FilterBar>
    {error ? <ErrorState title="Locations could not be loaded" description={error} /> : !page ? <LoadingState label="Loading locations" /> : <LocationsView page={page} onPageChange={setPageNumber} />}
  </>;
}
