// Marca do FargusFy: a "fissura" do FargusGram com três barras de som
let n = 0;
export function FyMark({ size = 32 }) {
  const id = `fy-g-${(n += 1)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="fy-mark">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#06b6d4" />
          <stop offset="0.52" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${id})`} />
      <rect x="13" y="19" width="5" height="10" rx="2.5" fill="#fff" />
      <rect x="21.5" y="12" width="5" height="24" rx="2.5" fill="#fff" />
      <rect x="30" y="16" width="5" height="16" rx="2.5" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ big = false }) {
  return <span className={`wordmark ${big ? 'wordmark--big' : ''}`}>fargusfy</span>;
}
