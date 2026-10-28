import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Icon } from '../../components/Icons.jsx';
import {
  Alert,
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  Pagination,
  SearchInput,
  StatusBadge,
  useToast,
} from '../../components/ui.jsx';
import { dateTimeLabel, relativeTime, statusMeta } from '../../utils.js';

const STATUSES = ['new', 'read', 'responded', 'closed'];

function InquiryModal({ inquiry, onClose, onUpdated }) {
  const toast = useToast();
  const [status, setStatus] = useState(inquiry.status);
  const [busy, setBusy] = useState(false);

  async function save(nextStatus) {
    setBusy(true);
    try {
      await api.patch(`/admin/inquiries/${inquiry.id}`, { status: nextStatus });
      setStatus(nextStatus);
      toast.success(`Inquiry marked ${statusMeta(nextStatus).label.toLowerCase()}.`);
      onUpdated();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={inquiry.subject}
      subtitle={`From ${inquiry.name} · ${dateTimeLabel(inquiry.createdAt)}`}
      size="wide"
      footer={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="flex items-center gap-1 wrap mb-2">
        <StatusBadge status={status} />
        <Badge tone="slate" dot={false}>Received {relativeTime(inquiry.createdAt)}</Badge>
        {inquiry.handledBy ? <Badge tone="slate" dot={false}>Handled by {inquiry.handledBy}</Badge> : null}
      </div>

      <div className="panel mb-2" style={{ whiteSpace: 'pre-wrap' }}>
        <p className="small" style={{ margin: 0 }}>{inquiry.message}</p>
      </div>

      <div className="kv-grid mb-2">
        <div className="kv"><span>Name</span><b>{inquiry.name}</b></div>
        <div className="kv"><span>Email</span><b>{inquiry.email}</b></div>
        <div className="kv"><span>Phone</span><b>{inquiry.phone || 'Not provided'}</b></div>
        <div className="kv"><span>Received</span><b>{dateTimeLabel(inquiry.createdAt)}</b></div>
      </div>

      <div className="btn-row mb-2">
        <a className="btn btn--secondary btn--sm" href={`mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(`Re: ${inquiry.subject}`)}`}>
          <Icon name="mail" size={15} /> Reply by email
        </a>
        {inquiry.phone ? (
          <a className="btn btn--secondary btn--sm" href={`tel:${inquiry.phone}`}>
            <Icon name="phone" size={15} /> Call
          </a>
        ) : null}
      </div>

      <Alert tone="info" title="Replies are sent outside the system">
        This installation does not have an email provider connected, so nothing is sent automatically. Reply using your own
        email client or phone, then set the inquiry status below so the office knows it was handled.
      </Alert>

      <div className="subhead mt-2">Update status</div>
      <div className="btn-row">
        {STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            className={status === option ? 'btn btn--sm' : 'btn btn--secondary btn--sm'}
            onClick={() => save(option)}
            disabled={busy || status === option}
          >
            {statusMeta(option).label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default function Inquiries() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const { data, loading, error, reload } = useAsync(
    () => api.get('/admin/inquiries', { page, pageSize: 20, q: debouncedQ, status }),
    [page, debouncedQ, status],
  );

  const inquiries = data?.inquiries || [];
  const filtered = debouncedQ || status !== 'all';

  return (
    <>
      <PageHead
        title="Website inquiries"
        subtitle="Messages sent through the public contact form. Reply using your office email or phone."
        actions={
          <button type="button" className="btn btn--secondary" onClick={() => reload()} disabled={loading}>
            <Icon name="refresh" size={16} /> Refresh
          </button>
        }
      />

      <Card className="mb-2">
        <div className="filters">
          <div style={{ flex: 2 }}>
            <SearchInput
              value={q}
              onChange={(value) => {
                setQ(value);
                setPage(1);
              }}
              placeholder="Search name, email or subject…"
            />
          </div>
          <Field label="Status" htmlFor="inquiry-status">
            <select
              id="inquiry-status"
              className="select"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All inquiries</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>{statusMeta(option).label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {loading && !data ? <Loading label="Loading inquiries…" /> : null}
      {error ? <ErrorState error={error} onRetry={() => reload()} /> : null}

      {!loading && data && !inquiries.length ? (
        <Card>
          <Empty
            icon="mail"
            title={filtered ? 'No inquiries match those filters' : 'No website inquiries yet'}
            message={
              filtered
                ? 'Try clearing the search or selecting a different status.'
                : 'Messages submitted through the public contact form will appear here.'
            }
            action={
              filtered ? (
                <button type="button" className="btn btn--secondary" onClick={() => { setQ(''); setStatus('all'); setPage(1); }}>
                  Clear filters
                </button>
              ) : (
                <a className="btn btn--secondary" href="/#contact" target="_blank" rel="noreferrer">
                  <Icon name="external" size={16} /> Open contact form
                </a>
              )
            }
          />
        </Card>
      ) : null}

      {inquiries.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Received</th>
                  <th>Status</th>
                  <th>Handled by</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => (
                  <tr key={inquiry.id}>
                    <td data-label="From">
                      <span className="cell-main small">{inquiry.name}</span>
                      <span className="cell-sub">{inquiry.email}</span>
                      {inquiry.phone ? <span className="cell-sub">{inquiry.phone}</span> : null}
                    </td>
                    <td data-label="Subject">
                      <span className="small wrap-anywhere">{inquiry.subject}</span>
                      <span className="cell-sub wrap-anywhere">
                        {inquiry.message.length > 100 ? `${inquiry.message.slice(0, 100)}…` : inquiry.message}
                      </span>
                    </td>
                    <td data-label="Received">
                      <span className="small">{relativeTime(inquiry.createdAt)}</span>
                    </td>
                    <td data-label="Status"><StatusBadge status={inquiry.status} /></td>
                    <td data-label="Handled by"><span className="small">{inquiry.handledBy || '—'}</span></td>
                    <td data-label="" className="cell-actions">
                      <button type="button" className="btn btn--secondary btn--xs" onClick={() => setSelected(inquiry)}>
                        Read <Icon name="arrowRight" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 .9rem .6rem' }}>
            <Pagination meta={data.meta} onPage={setPage} label={`${data.meta.total} inquir${data.meta.total === 1 ? 'y' : 'ies'}`} />
          </div>
        </Card>
      ) : null}

      {selected ? (
        <InquiryModal
          inquiry={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => reload(true)}
        />
      ) : null}
    </>
  );
}
