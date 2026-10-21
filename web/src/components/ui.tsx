import type { ReactNode } from 'react';
import type { Priority, Status, TriageSource } from '../api/types';
import { PRIORITY_LABELS, SOURCE_LABELS, STATUS_LABELS } from '../lib/format';

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority | null | undefined }) {
  if (!priority) return <span className="badge muted">Triaging…</span>;
  return <span className={`badge priority-${priority}`}>{PRIORITY_LABELS[priority]}</span>;
}

export function SourceTag({ source }: { source: TriageSource | null | undefined }) {
  if (!source) return null;
  return <span className={`source source-${source}`} title="Where this value came from">{SOURCE_LABELS[source]}</span>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" /> {label}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="banner error" role="alert">
      {message}
    </div>
  );
}

export function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className={`live ${connected ? 'on' : 'off'}`} title={connected ? 'Receiving live updates' : 'Reconnecting…'}>
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}
