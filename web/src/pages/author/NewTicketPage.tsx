import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, type FieldError } from '../../api/client';
import type { Book, BooksResponse, Ticket } from '../../api/types';
import { ErrorBanner } from '../../components/ui';

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
      } else setError('Could not submit your query');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <h1>Raise a support query</h1>
      <p className="muted">Our team usually responds within one business day. Urgent issues (payments, ISBN errors) are prioritised.</p>
      <form className="card form" onSubmit={submit} noValidate>
        <ErrorBanner message={error} />
        <label>
          Which book is this about?
          <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">General / Account level</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.status})
              </option>
            ))}
          </select>
        </label>
        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} placeholder="e.g. Royalty for last quarter not received" />
          {fieldError('subject') && <span className="field-error">{fieldError('subject')}</span>}
        </label>
        <label>
          Describe the issue
          <textarea
            rows={7}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            placeholder="Include what you expected, what happened and any dates or amounts — it helps us resolve it faster."
          />
          <span className="hint">{description.length}/5000</span>
          {fieldError('description') && <span className="field-error">{fieldError('description')}</span>}
        </label>
        <label>
          Attachment (optional)
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="hint">Screenshots or photos of printed copies help. (Demo: the file name is recorded; upload is not stored.)</span>
        </label>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit query'}
          </button>
        </div>
      </form>
    </section>
  );
}
