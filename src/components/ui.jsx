import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

export function Spinner({ size = 22, className = '' }) {
  return <Loader2 size={size} className={`spin ${className}`} aria-label="Carregando" />;
}

export function Loading({ label = 'Carregando…' }) {
  return (
    <div className="loading">
      <Spinner />
      <span className="muted">{label}</span>
    </div>
  );
}

export function Button({ children, variant = 'primary', loading = false, className = '', ...props }) {
  return (
    <button className={`btn btn--${variant} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner size={18} /> : children}
    </button>
  );
}

export function IconButton({ label, children, className = '', active = false, ...props }) {
  return (
    <button type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Empty({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      {title && <h3>{title}</h3>}
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ children, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <p>{children}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

// Janela por cima: embaixo no celular, no centro no computador
export function Sheet({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`sheet ${wide ? 'sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet__grip" aria-hidden="true" />
        {title && (
          <div className="sheet__head">
            <h2>{title}</h2>
            <IconButton label="Fechar" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </div>
        )}
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// Item de menu dentro de um Sheet
export function MenuItem({ icon, children, onClick, danger = false, href, external = false }) {
  const cls = `menu-item ${danger ? 'menu-item--danger' : ''}`;
  if (href)
    return (
      <a className={cls} href={href} onClick={onClick} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {icon}
        <span>{children}</span>
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onClick}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

// Carrega dados assíncronos com estados de carregando/erro
export function useAsync(fn, deps) {
  const [st, setSt] = useState({ data: undefined, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => alive && setSt({ data, error: null, loading: false }))
      .catch((error) => alive && setSt({ data: undefined, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...st, reload: () => setTick((t) => t + 1), setData: (data) => setSt((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMedia(query) {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
