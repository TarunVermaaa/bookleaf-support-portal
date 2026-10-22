import type { ReactNode } from 'react';
import type { Priority, Status, TriageSource } from '../api/types';
import { PRIORITY_LABELS, SOURCE_LABELS, STATUS_LABELS } from '../lib/format';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ShieldCheck,
  Sparkles,
  Inbox
} from './icons';

export function StatusBadge({ status }: { status: Status }) {
  const getIcon = () => {
    switch (status) {
      case 'open':
        return <Clock size={12} strokeWidth={2.5} />;
      case 'in_progress':
        return <Clock size={12} strokeWidth={2.5} />;
      case 'resolved':
        return <CheckCircle2 size={12} strokeWidth={2.5} />;
      case 'closed':
        return <CheckCircle2 size={12} strokeWidth={2.5} />;
      default:
        return null;
    }
  };

  return (
    <span className={`badge status-${status}`}>
      {getIcon()}
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority | null | undefined }) {
  if (!priority) {
    return (
      <span className="badge muted">
        <Clock size={11} /> Triaging…
      </span>
    );
  }

  const getIcon = () => {
    switch (priority) {
      case 'critical':
        return <AlertCircle size={12} strokeWidth={2.5} />;
      case 'high':
        return <AlertTriangle size={12} strokeWidth={2.5} />;
      case 'medium':
        return <span style={{ fontSize: '10px' }}>▲</span>;
      case 'low':
        return <span style={{ fontSize: '10px' }}>▼</span>;
      default:
        return null;
    }
  };

  return (
    <span className={`badge priority-${priority}`}>
      {getIcon()}
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function SourceTag({ source }: { source: TriageSource | null | undefined }) {
  if (!source) return null;

  const getIcon = () => {
    switch (source) {
      case 'ai':
        return <Sparkles size={11} />;
      case 'rules':
        return <Layers size={11} />;
      case 'admin':
        return <ShieldCheck size={11} />;
      default:
        return null;
    }
  };

  return (
    <span className={`source source-${source}`} title={`Triaged via ${SOURCE_LABELS[source]}`}>
      {getIcon()}
      {SOURCE_LABELS[source]}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      <div style={{
        width: 44,
        height: 44,
        borderRadius: '12px',
        background: 'var(--slate-100)',
        color: 'var(--slate-500)',
        display: 'grid',
        placeItems: 'center',
        marginBottom: '0.5rem'
      }}>
        {icon || <Inbox size={22} />}
      </div>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="banner error" role="alert">
      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
      <div>{message}</div>
    </div>
  );
}

export function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className={`live ${connected ? 'on' : 'off'}`} title={connected ? 'Live updates active (SSE connected)' : 'Reconnecting to live feed…'}>
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}
