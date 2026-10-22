import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api, ApiError, type FieldError } from '../../api/client';
import type { Book, BooksResponse, Ticket } from '../../api/types';
import { ErrorBanner } from '../../components/ui';
import { ArrowLeft, Paperclip, Send, X, ShieldCheck } from '../../components/icons';

export function NewTicketPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState(params.get('book') ?? '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<BooksResponse>('/books').then((r) => setBooks(r.items)).catch(() => setBooks([]));
  }, []);

  const fieldError = (f: string) => fields.find((e) => e.field === f)?.message;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields([]);
    try {
      const ticket = await api.post<Ticket>('/tickets', {
        bookId: bookId || null,
        subject,
        description,
        attachmentName: file?.name ?? null,
      });
      navigate(`/tickets/${ticket.id}`, { state: { justCreated: true } });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError('Could not submit your query. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <div style={{ marginBottom: '1.25rem' }}>
        <Link to="/tickets" className="button secondary small" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} />
          <span>Back to queries</span>
        </Link>
        <h1>Raise an Author Support Query</h1>
        <p className="page-subtitle">
          Our editorial and operations team prioritizes issues grounded in your real sales and production records.
        </p>
      </div>

      <div className="banner info" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <ShieldCheck size={20} style={{ color: '#0f766e', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>
          <strong>Average turnaround: under 24 business hours.</strong> Questions regarding quarterly royalties,
          ISBN metadata, or print quality receive automatic priority routing to senior desk managers.
        </div>
      </div>

      <form className="card" onSubmit={submit} noValidate style={{ marginTop: '1.5rem' }}>
        <ErrorBanner message={error} />

        <label>
          <div className="label-row">
            <span>Related Title / Book</span>
            <span className="hint">Optional if account-level</span>
          </div>
          <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">General / Account-level query</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.status})
              </option>
            ))}
          </select>
        </label>

        <label>
          <div className="label-row">
            <span>Subject</span>
            <span className="hint">{subject.length}/150</span>
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            placeholder="e.g., Royalty disbursement for Q3 not reflected in account"
          />
          {fieldError('subject') && <span className="field-error">{fieldError('subject')}</span>}
        </label>

        <label>
          <div className="label-row">
            <span>Detailed Description</span>
            <span className="hint">{description.length}/5000</span>
          </div>
          <textarea
            rows={7}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            placeholder="Please detail your query clearly. Include specific book titles, dates, expected amounts, or courier tracking numbers to expedite resolution."
          />
          {fieldError('description') && <span className="field-error">{fieldError('description')}</span>}
        </label>

        <label>
          <span>Attachment (Optional)</span>
          {file ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: 'var(--slate-50)',
                border: '1px solid var(--slate-200)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Paperclip size={16} color="var(--brand-primary)" />
                <strong style={{ fontSize: '0.88rem' }}>{file.name}</strong>
                <span className="hint">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                type="button"
                className="link small"
                onClick={() => setFile(null)}
                title="Remove attachment"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="file-upload-box" onClick={() => document.getElementById('ticket-file-input')?.click()}>
              <input
                id="ticket-file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Paperclip size={24} style={{ color: 'var(--slate-400)', marginBottom: '0.4rem' }} />
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--slate-800)' }}>
                Click to attach a screenshot, photo of print copy, or bank slip
              </div>
              <div className="hint" style={{ marginTop: '0.2rem' }}>
                PNG, JPG, PDF up to 10MB (Recorded for triage reference)
              </div>
            </div>
          )}
        </label>

        <div className="actions">
          <button type="button" className="secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !subject.trim() || !description.trim()}>
            <Send size={15} />
            <span>{busy ? 'Submitting query…' : 'Submit query'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
