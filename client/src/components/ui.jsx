import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons.jsx';
import { cn, initials, statusMeta } from '../utils.js';
import { usePageTitle } from '../hooks.js';

/* ------------------------------------------------------------------ */
/* Toasts                                                             */
/* ------------------------------------------------------------------ */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone, message, title) => {
      if (!message) return;
      counter.current += 1;
      const id = counter.current;
      setToasts((list) => [...list.slice(-3), { id, tone, message, title }]);
      window.setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== id));
      }, tone === 'error' ? 7000 : 4500);
    },
    [],
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (message, title = 'Done') => push('success', message, title),
      error: (message, title = 'Something went wrong') => push('error', message, title),
      info: (message, title = 'Notice') => push('info', message, title),
      warn: (message, title = 'Heads up') => push('warn', message, title),
      dismiss,
    }),
    [push, dismiss],
  );

  const icons = { success: 'check', error: 'alert', info: 'info', warn: 'alert' };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-region" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.tone}`}>
              <Icon name={icons[t.tone] || 'info'} size={18} />
              <div className="toast__body">
                {t.title ? <span className="toast__title">{t.title}</span> : null}
                <span className="toast__msg">{t.message}</span>
              </div>
              <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Confirmation dialogs                                               */
/* ------------------------------------------------------------------ */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest(typeof options === 'string' ? { message: options } : options);
    });
  }, []);

  const finish = (value) => {
    if (resolver.current) resolver.current(value);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!request}
        onClose={() => finish(false)}
        title={request?.title || (request?.danger ? 'Confirm removal' : 'Please confirm')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => finish(false)}>
              {request?.cancelLabel || 'Cancel'}
            </button>
            <button
              type="button"
              className={cn('btn', request?.danger ? 'btn--danger' : '')}
              onClick={() => finish(true)}
            >
              {request?.confirmLabel || 'Continue'}
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{request?.message}</p>
        {request?.detail ? <p className="muted small" style={{ marginTop: '0.6rem' }}>{request.detail}</p> : null}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */
export function Modal({ open, onClose, title, subtitle, children, footer, size = '', hideClose = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onClose) onClose();
      }}
      role="presentation"
    >
      <div className={cn('modal', size === 'wide' && 'modal--wide', size === 'full' && 'modal--full')} role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
        <div className="modal__grab" />
        <div className="modal__head">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {!hideClose ? (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
              <Icon name="close" size={21} />
            </button>
          ) : null}
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Page furniture                                                     */
/* ------------------------------------------------------------------ */
export function PageHead({ title, subtitle, actions, back }) {
  usePageTitle(title);
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        {back ? (
          <button type="button" className="link-btn small" onClick={back.onClick} style={{ marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="arrowLeft" size={14} /> {back.label || 'Back'}
          </button>
        ) : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="btn-row no-print">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ title, action, sub }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {sub ? <p className="muted small" style={{ margin: '0.15rem 0 0' }}>{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = '', flush = false, ...rest }) {
  return (
    <div className={cn('card', flush && 'card--flush', className)} {...rest}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, icon, accent = false }) {
  return (
    <div className={cn('stat', accent && 'stat--accent')}>
      {icon ? <Icon name={icon} size={30} className="stat__icon" /> : null}
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}

export function Badge({ tone = 'slate', children, dot = true, className = '' }) {
  return <span className={cn('badge', `badge--${tone}`, !dot && 'badge--none', className)}>{children}</span>;
}

export function StatusBadge({ status, label }) {
  const meta = statusMeta(status);
  return <Badge tone={meta.tone}>{label || meta.label}</Badge>;
}

export function Progress({ value, navy = false, showLabel = false }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="progress-row">
      <div className={cn('progress', navy && 'progress--navy')} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? <span className="pct">{pct}%</span> : null}
    </div>
  );
}

export function Avatar({ name, size = '', tone = '' }) {
  return (
    <span className={cn('avatar', size === 'sm' && 'avatar--sm', size === 'lg' && 'avatar--lg', tone && `avatar--${tone}`)} title={name}>
      {initials(name)}
    </span>
  );
}

export function Person({ name, meta, size = '', tone = '', children }) {
  return (
    <div className="person">
      <Avatar name={name} size={size} tone={tone} />
      <div style={{ minWidth: 0 }}>
        <div className="person__name">{name}</div>
        {meta ? <div className="person__meta">{meta}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon = 'folder', title = 'Nothing here yet', message, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={42} />
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonCards({ count = 3, height = 96 }) {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skel-card" style={{ height }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We could not load this page' }) {
  return (
    <div className="alert alert--danger" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start' }}>
        <Icon name="alert" size={18} style={{ flex: 'none', marginTop: 2 }} />
        <div>
          <strong>{title}</strong>
          <div className="small" style={{ marginTop: 2 }}>
            {error?.message || 'Please check your connection and try again.'}
          </div>
        </div>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry} style={{ marginTop: '.6rem' }}>
          <Icon name="refresh" size={15} /> Try again
        </button>
      ) : null}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, icon }) {
  const icons = { info: 'info', warn: 'alert', danger: 'alert', success: 'check' };
  return (
    <div className={cn('alert', `alert--${tone}`)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon || icons[tone] || 'info'} size={18} />
      <div style={{ minWidth: 0 }}>
        {title ? <strong>{title}</strong> : null}
        {title ? <div style={{ marginTop: 2 }}>{children}</div> : children}
      </div>
    </div>
  );
}

export function Pagination({ meta, onPage, label }) {
  if (!meta || meta.totalPages <= 1) {
    return meta ? (
      <div className="pagination">
        <span>{label || `${meta.total} record${meta.total === 1 ? '' : 's'}`}</span>
      </div>
    ) : null;
  }
  const pages = [];
  const total = meta.totalPages;
  const current = meta.page;
  for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p += 1) pages.push(p);

  return (
    <div className="pagination">
      <span>
        {label || `${meta.total} record${meta.total === 1 ? '' : 's'}`} · page {current} of {total}
      </span>
      <div className="pagination__pages">
        <button type="button" onClick={() => onPage(current - 1)} disabled={!meta.hasPrev} aria-label="Previous page">
          <Icon name="chevronLeft" size={15} />
        </button>
        {pages[0] > 1 ? <span className="muted tiny">…</span> : null}
        {pages.map((p) => (
          <button key={p} type="button" className={p === current ? 'active' : ''} onClick={() => onPage(p)}>
            {p}
          </button>
        ))}
        {pages[pages.length - 1] < total ? <span className="muted tiny">…</span> : null}
        <button type="button" onClick={() => onPage(current + 1)} disabled={!meta.hasNext} aria-label="Next page">
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, ariaLabel = 'Sections' }) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          className={cn('tab', value === tab.key && 'active')}
          onClick={() => onChange(tab.key)}
        >
          {tab.icon ? <Icon name={tab.icon} size={16} /> : null}
          {tab.label}
          {tab.count !== undefined && tab.count !== null ? <span className="count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, htmlFor, error, hint, required, children, className = '' }) {
  return (
    <div className={cn('field', className)}>
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label} {required ? <span className="req" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <div className="field__error" role="alert">{error}</div> : null}
      {hint && !error ? <div className="field__hint">{hint}</div> : null}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
  return (
    <div className="field">
      <label className="sr-only" htmlFor="search-input">{label}</label>
      <div className="search-input">
        <Icon name="search" size={18} />
        <input
          id="search-input"
          className="input"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

export function FileTile({ name, meta, icon, actions, onClick }) {
  const content = (
    <>
      <span className="file-tile__icon" aria-hidden="true">{icon || (String(name).split('.').pop() || 'FILE').slice(0, 4)}</span>
      <span className="file-tile__body">
        <span className="file-tile__name">{name}</span>
        {meta ? <span className="file-tile__meta">{meta}</span> : null}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="file-tile" onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}>
        {content}
        {actions}
      </button>
    );
  }
  return (
    <div className="file-tile">
      {content}
      {actions}
    </div>
  );
}

export function Dropzone({ files = [], onFiles, accept, multiple = true, maxMb, label = 'Choose a file', hint }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const add = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    onFiles(multiple ? [...files, ...incoming] : incoming.slice(0, 1));
  };

  return (
    <div>
      <label
        className={cn('dropzone', drag && 'drag')}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          add(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(event) => {
            add(event.target.files);
            event.target.value = '';
          }}
        />
        <Icon name="upload" size={28} />
        <b>{label}</b>
        <span>{hint || `Drag and drop, or tap to browse${maxMb ? ` · up to ${maxMb} MB` : ''}`}</span>
      </label>
      {files.length ? (
        <div className="stack" style={{ marginTop: '.5rem' }}>
          {files.map((file, index) => (
            <div className="file-chosen" key={`${file.name}-${index}`}>
              <span className="file-tile__icon" style={{ width: 30, height: 34, fontSize: '.55rem' }}>
                {(file.name.split('.').pop() || 'file').slice(0, 4)}
              </span>
              <span style={{ flex: 1 }}>{file.name}</span>
              <span className="muted tiny">{file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}</span>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 30, height: 30 }}
                aria-label={`Remove ${file.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  onFiles(files.filter((_, i) => i !== index));
                }}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function InfoRow({ label, children }) {
  return (
    <div className="timeline-inline" style={{ marginBottom: '.35rem' }}>
      <span className="muted small" style={{ minWidth: 110 }}>{label}</span>
      <span className="small strong" style={{ fontWeight: 600 }}>{children || '—'}</span>
    </div>
  );
}

export function Divider({ children }) {
  if (!children) return <hr />;
  return (
    <div className="section-title">
      <h2 style={{ fontSize: '.95rem' }}>{children}</h2>
    </div>
  );
}
