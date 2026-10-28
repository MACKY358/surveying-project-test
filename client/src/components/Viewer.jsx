// Zoomable / pannable preview for PDF drawings and image scans.
// PDF.js is loaded on demand so the rest of the portal stays light.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { cn, fileExtension } from '../utils.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function isImageFile(mimeType, name) {
  return /^image\//i.test(String(mimeType || '')) || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(String(name || ''));
}

function isPdfFile(mimeType, name) {
  return String(mimeType || '') === 'application/pdf' || /\.pdf$/i.test(String(name || ''));
}

export default function Viewer({ src, mimeType, name, downloadName, onDownload, onClose, height, hint }) {
  const image = isImageFile(mimeType, name);
  const pdfFile = isPdfFile(mimeType, name);
  const unsupported = !image && !pdfFile;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(!image && !unsupported);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfRef = useRef(null);
  const dragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
    setPage(1);
    setNumPages(0);
    setError(null);
    pdfRef.current = null;
    if (!src || image || unsupported) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ url: src, withCredentials: true });
        const doc = await task.promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'The drawing could not be opened.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (pdfRef.current) {
        try {
          pdfRef.current.destroy();
        } catch (err) {
          /* already destroyed */
        }
        pdfRef.current = null;
      }
    };
  }, [src, image, unsupported, reset]);

  useEffect(() => {
    if (image || unsupported || loading || error || !pdfRef.current) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const doc = pdfRef.current;
        const pdfPage = await doc.getPage(clamp(page, 1, doc.numPages));
        if (cancelled) return;
        const container = containerRef.current;
        const available = Math.max(280, (container?.clientWidth || 720) - 24);
        const natural = pdfPage.getViewport({ scale: 1 });
        const base = Math.min(available / natural.width, 1.7);
        const viewport = pdfPage.getViewport({ scale: base });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({
          canvasContext: context,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        }).promise;
        reset();
      } catch (err) {
        if (!cancelled) setError(err?.message || 'That page could not be rendered.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, loading, error, image, reset]);

  const startDrag = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest && event.target.closest('.viewer-toolbar')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };

  const moveDrag = (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const endDrag = () => setDragging(false);
  const downloadLabel = downloadName || name || 'drawing';

  const viewerHeight = height || undefined;

  return (
    <div className="viewer-shell" style={viewerHeight ? { height: viewerHeight } : undefined}>
      <div className="viewer-toolbar">
        {pdfFile ? (
          <>
            <button
              type="button"
              className="btn btn--sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <Icon name="chevronLeft" size={15} />
            </button>
            <span className="zoom-label" style={{ minWidth: 70 }}>
              {numPages ? `${page} / ${numPages}` : '—'}
            </span>
            <button
              type="button"
              className="btn btn--sm"
              disabled={!numPages || page >= numPages}
              onClick={() => setPage((p) => Math.min(numPages, p + 1))}
              aria-label="Next page"
            >
              <Icon name="chevronRight" size={15} />
            </button>
            <span style={{ width: 1, height: 20, background: '#33424f', margin: '0 .2rem' }} />
          </>
        ) : null}
        <button type="button" className="btn btn--sm" onClick={() => setZoom((z) => clamp(z - 0.2, 0.4, 4))} aria-label="Zoom out">
          <Icon name="zoomOut" size={15} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn--sm" onClick={() => setZoom((z) => clamp(z + 0.2, 0.4, 4))} aria-label="Zoom in">
          <Icon name="zoomIn" size={15} />
        </button>
        <button type="button" className="btn btn--sm" onClick={reset} aria-label="Reset zoom and position">
          <Icon name="expand" size={15} /> Fit
        </button>
        <span style={{ marginLeft: 'auto' }} />
        {onDownload ? (
          <button type="button" className="btn btn--sm" onClick={onDownload} title={`Download ${downloadLabel}`}>
            <Icon name="download" size={15} /> Download
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className="btn btn--sm" onClick={onClose} aria-label="Close preview">
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className={cn('viewer-canvas', dragging && 'grabbing')}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={reset}
      >
        {loading ? (
          <div className="viewer-status">
            <div>
              <span className="spinner" style={{ color: '#cfe0ee' }} />
              <p style={{ marginTop: '.6rem' }}>Preparing drawing…</p>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="viewer-status">
            <div>
              <Icon name="alert" size={30} />
              <p>{error}</p>
              <p className="tiny" style={{ opacity: 0.7 }}>{fileExtension(name)} · {name}</p>
            </div>
          </div>
        ) : null}
        {unsupported ? (
          <div className="viewer-status">
            <div>
              <Icon name="file" size={34} />
              <p style={{ marginTop: '.5rem' }}>In-browser preview is not available for this file type.</p>
              <p className="tiny" style={{ opacity: 0.7 }}>{fileExtension(name)} · {name}</p>
              {onDownload ? (
                <button type="button" className="btn btn--secondary btn--sm mt-2" onClick={onDownload}>
                  <Icon name="download" size={15} /> Download to open
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {!error && image ? (
          <img
            src={src}
            alt={name || 'Document preview'}
            draggable="false"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              maxWidth: '92%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 4,
              background: '#fff',
              transition: dragging ? 'none' : 'transform .12s ease',
            }}
          />
        ) : null}
        {!error && !image && !unsupported ? (
          <canvas
            ref={canvasRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: dragging ? 'none' : 'transform .12s ease',
              boxShadow: '0 10px 40px rgba(0,0,0,.35)',
            }}
          />
        ) : null}
        {!loading && !error && !unsupported ? <span className="viewer-hint">{hint || 'Drag to pan · Double-click to reset'}</span> : null}
      </div>
    </div>
  );
}
