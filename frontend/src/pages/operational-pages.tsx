import type { ReactNode } from 'react';
import { useRepositories } from '../state/repositories';
import { EmptyState, PageHeader } from '../components/ui';
import { operationalSurfaceState } from './operational-data';
import { WarehouseDashboardPage } from './warehouse-pages';
import { LoadingUnloadingDetailPage, LoadingUnloadingPage as InteractiveLoadingUnloadingPage } from './loading-unloading-pages';
import * as PreviewPages from './pages';

function Unavailable({ title, description }: { title: string; description: string }) {
  return <><PageHeader eyebrow="Frontend preview boundary" title={title} description={description} /><EmptyState title="API integration unavailable" description="This operational surface remains preview-only until the backend data and workflow contracts are confirmed." /></>;
}

function PreviewBoundary({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { mode } = useRepositories();
  return operationalSurfaceState(mode) === 'preview' ? <>{children}</> : <Unavailable title={title} description={description} />;
}

export function LoadingUnloadingPage() {
  return <PreviewBoundary title="Loading & unloading" description="Loading and unloading operations require a confirmed backend data and workflow contract in API mode."><InteractiveLoadingUnloadingPage /></PreviewBoundary>;
}

export function LoadingUnloadingDetailRoute() {
  return <PreviewBoundary title="Loading & unloading operation" description="Loading and unloading operations require a confirmed backend data and workflow contract in API mode."><LoadingUnloadingDetailPage /></PreviewBoundary>;
}

export function WarehousePage() {
  return <PreviewBoundary title="Warehouse operations" description="Warehouse operational records require a confirmed backend read model in API mode."><WarehouseDashboardPage /></PreviewBoundary>;
}

export function LocationsPage() {
  return <PreviewBoundary title="Locations" description="Location hierarchy and restriction policy remain static preview data until a confirmed location contract exists."><PreviewPages.LocationsPage /></PreviewBoundary>;
}

export function OperationsPage() {
  return <PreviewBoundary title="Operations command view" description="The operations bridge is a static preview surface and has no confirmed API-backed read model yet."><PreviewPages.OperationsPage /></PreviewBoundary>;
}
