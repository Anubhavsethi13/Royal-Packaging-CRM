import type { ReactNode } from 'react';
import { useRepositories } from '../state/repositories';
import { EmptyState, PageHeader } from '../components/ui';
import { operationalSurfaceState, type OperationalSurface } from './operational-data';
import { ApiLocationsPage } from './locations-pages';
import { WarehouseDashboardPage } from './warehouse-pages';
import { LoadingUnloadingDetailPage, LoadingUnloadingPage as InteractiveLoadingUnloadingPage } from './loading-unloading-pages';
import * as PreviewPages from './pages';

function Unavailable({ title, description }: { title: string; description: string }) {
  return <><PageHeader eyebrow="Frontend preview boundary" title={title} description={description} /><EmptyState title="API integration unavailable" description="This operational surface remains preview-only until the backend data and workflow contracts are confirmed." /></>;
}

/** Mock mode renders the preview; API mode renders `api` only for surfaces with a confirmed contract, otherwise the boundary message. */
function PreviewBoundary({ surface, title, description, children, api }: { surface: OperationalSurface; title: string; description: string; children: ReactNode; api?: ReactNode }) {
  const { mode } = useRepositories();
  const state = operationalSurfaceState(mode, surface);
  if (state === 'preview') return <>{children}</>;
  if (state === 'api' && api) return <>{api}</>;
  return <Unavailable title={title} description={description} />;
}

export function LoadingUnloadingPage() {
  return <PreviewBoundary surface="loading-unloading" title="Loading & unloading" description="Loading and unloading operations require a confirmed backend data and workflow contract in API mode." api={<InteractiveLoadingUnloadingPage />}><InteractiveLoadingUnloadingPage /></PreviewBoundary>;
}

export function LoadingUnloadingDetailRoute() {
  return <PreviewBoundary surface="loading-unloading" title="Loading & unloading operation" description="Loading and unloading operations require a confirmed backend data and workflow contract in API mode." api={<LoadingUnloadingDetailPage />}><LoadingUnloadingDetailPage /></PreviewBoundary>;
}

export function WarehousePage() {
  return <PreviewBoundary surface="warehouse" title="Warehouse operations" description="Warehouse operational records require a confirmed backend read model in API mode." api={<WarehouseDashboardPage />}><WarehouseDashboardPage /></PreviewBoundary>;
}

export function LocationsPage() {
  return <PreviewBoundary surface="locations" title="Locations" description="Location hierarchy and restriction policy remain static preview data until a confirmed location contract exists." api={<ApiLocationsPage />}><PreviewPages.LocationsPage /></PreviewBoundary>;
}

export function OperationsPage() {
  return <PreviewBoundary surface="operations" title="Operations command view" description="The operations bridge is a static preview surface and has no confirmed API-backed read model yet."><PreviewPages.OperationsPage /></PreviewBoundary>;
}
