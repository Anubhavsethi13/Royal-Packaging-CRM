import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Info, LoaderCircle, MoreHorizontal, Search, X, XCircle } from 'lucide-react';
import { useAuth } from '../state/auth';
import type { PermissionRequirement } from '../state/authorization';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export function Button({ variant = 'primary', className = '', children, loading = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  const { disabled, ...buttonProps } = props;
  return <button className={`button button-${variant} ${className}`} aria-busy={loading || undefined} disabled={loading || disabled} {...buttonProps}>{loading && <LoaderCircle className="spin" size={15} />}{children}</button>;
}

export function PermissionButton({ permission, children, title, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { permission: PermissionRequirement; variant?: ButtonVariant; loading?: boolean }) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission(permission);
  return <Button {...props} disabled={disabled || !allowed} title={title ?? (allowed ? undefined : 'You do not have permission for this action')}>{children}</Button>;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton({ label, children, className = '', ...props }, ref) {
  return <button ref={ref} className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
});

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input textarea ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="select-wrap"><select className={`input select ${className}`} {...props}>{children}</select><ChevronDown size={15} aria-hidden="true" /></span>;
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone: BadgeTone = normalized.includes('ready') || normalized.includes('active') || normalized.includes('complete') || normalized.includes('approved') || normalized.includes('success') ? 'success' : normalized.includes('risk') || normalized.includes('urgent') || normalized.includes('pending') || normalized.includes('hold') ? 'warning' : normalized.includes('blocked') || normalized.includes('damage') || normalized.includes('exception') || normalized.includes('error') ? 'error' : normalized.includes('preview') || normalized.includes('prepared') || normalized.includes('production') || normalized.includes('progress') ? 'info' : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}

export function PageHeader({ eyebrow, title, description, actions, breadcrumbs }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; breadcrumbs?: string[] }) {
  return <div className="page-header"><div>{breadcrumbs && <div className="breadcrumbs">{breadcrumbs.map((crumb, index) => <span key={crumb}><span>{crumb}</span>{index < breadcrumbs.length - 1 && <ChevronRight size={13} />}</span>)}</div>}{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function MetricCard({ label, value, detail, accent = 'indigo', icon }: { label: string; value: string; detail: string; accent?: 'indigo' | 'green' | 'amber' | 'slate'; icon?: ReactNode }) {
  return <Card className={`metric-card metric-${accent}`}><div className="metric-top"><div className="metric-label">{label}</div>{icon && <span className="metric-icon">{icon}</span>}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></Card>;
}

export function EmptyState({ icon: Icon = Info, title, description, action }: { icon?: typeof Info; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={20} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function ErrorState({ title = 'Something needs attention', description = 'The requested surface could not be loaded.', action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="state-block state-error"><XCircle size={18} /><div><strong>{title}</strong><span>{description}</span>{action}</div></div>;
}

export function LoadingState({ label = 'Loading foundation data' }: { label?: string }) {
  return <div className="state-block"><LoaderCircle className="spin" size={18} /><div><strong>Loading</strong><span>{label}</span></div></div>;
}

export function Skeleton({ width = '100%', height = 14 }: { width?: string; height?: number }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function SearchField({ placeholder = 'Search records', value, onChange }: { placeholder?: string; value?: string; onChange?: (value: string) => void }) {
  return <label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">{placeholder}</span><Input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} /></label>;
}

export function DataTable({ headers, rows, empty, caption }: { headers: string[]; rows: ReactNode[][]; empty?: ReactNode; caption?: string }) {
  return <div className="table-wrap"><table>{caption && <caption className="sr-only">{caption}</caption>}<thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="table-empty" colSpan={headers.length}>{empty ?? 'No records match the current view.'}</td></tr>}</tbody></table></div>;
}

export function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{error ? <small className="field-error">{error}</small> : hint && <small>{hint}</small>}</label>;
}

export function FilterBar({ children, resultLabel }: { children: ReactNode; resultLabel?: string }) {
  return <div className="filter-bar"><div className="filter-controls">{children}</div>{resultLabel && <span className="filter-result">{resultLabel}</span>}</div>;
}

export function Pagination({ page = 1, totalPages = 1, onChange }: { page?: number; totalPages?: number; onChange?: (page: number) => void }) {
  return <div className="pagination"><span>Page {page} of {totalPages}</span><div><Button variant="ghost" disabled={page <= 1} onClick={() => onChange?.(page - 1)}>Previous</Button><Button variant="ghost" disabled={page >= totalPages} onClick={() => onChange?.(page + 1)}>Next</Button></div></div>;
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((tab) => <button key={tab} role="tab" aria-selected={active === tab} className={active === tab ? 'tab-active' : ''} onClick={() => onChange(tab)}>{tab}</button>)}</div>;
}

export function Alert({ tone = 'info', title, children }: { tone?: BadgeTone; title: string; children: ReactNode }) {
  const Icon = tone === 'error' ? XCircle : tone === 'warning' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  return <div className={`alert alert-${tone}`}><Icon size={17} /><div><strong>{title}</strong><span>{children}</span></div></div>;
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return <div className="demo-banner"><span className="demo-dot" /><strong>Preview data</strong><span>{children}</span></div>;
}

export function ActionMenu({ items }: { items: Array<{ label: string; onClick?: () => void; danger?: boolean; permission?: PermissionRequirement }> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ label: string; onClick?: () => void; danger?: boolean } | null>(null);
  const { hasPermission } = useAuth();
  const availableItems = items.filter((item) => !item.permission || hasPermission(item.permission));
  useEffect(() => { if (!open) return undefined; const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', onKeyDown); return () => document.removeEventListener('keydown', onKeyDown); }, [open]);
  return <div className="action-menu"><IconButton label="More actions" aria-expanded={open} aria-haspopup="menu" disabled={!availableItems.length} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={18} /></IconButton>{open && <><button className="menu-dismiss" aria-label="Close actions" onClick={() => setOpen(false)} /><div className="menu-popover" role="menu">{availableItems.map((item) => <button role="menuitem" key={item.label} className={item.danger ? 'menu-danger' : ''} onClick={() => { setOpen(false); if (item.danger) setPending(item); else if (item.onClick) item.onClick(); else setPending(item); }}>{item.label}</button>)}</div></>}<Dialog open={pending !== null} title={pending?.danger ? `Confirm ${pending.label}` : `${pending?.label ?? 'This action'} is unavailable`} description={pending?.danger ? 'This is a frontend preview. Confirming will not change authoritative server data.' : 'This workflow is backend-dependent and no local record was changed.'} onClose={() => setPending(null)}>{pending?.danger ? <><Alert tone="warning" title="Sensitive action">Review this change carefully. Backend safeguards remain authoritative.</Alert><div className="dialog-actions"><Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button><Button variant="danger" onClick={() => { pending.onClick?.(); setPending(null); }}>Confirm</Button></div></> : <><Alert tone="info" title="Preview boundary">The action is visible for workflow discovery, but authoritative data, exports, and integrations remain unavailable in this frontend-only phase.</Alert><div className="dialog-actions"><Button onClick={() => setPending(null)}>Close</Button></div></>}</Dialog></div>;
}

export function Dialog({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return <DialogSurface title={title} description={description} onClose={onClose}>{children}</DialogSurface>;
}

function DialogSurface({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', onKeyDown); return () => document.removeEventListener('keydown', onKeyDown); }, [onClose]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-header"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><IconButton ref={closeRef} label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div>{children}</div></div>;
}

export function Toast({ children, tone = 'success' }: { children: ReactNode; tone?: BadgeTone }) {
  return <div className={`toast toast-${tone}`}><CheckCircle2 size={16} /> {children}</div>;
}

export function Avatar({ initials, tone = 'indigo' }: { initials: string; tone?: 'indigo' | 'green' | 'amber' }) {
  return <span className={`avatar avatar-${tone}`}>{initials}</span>;
}
