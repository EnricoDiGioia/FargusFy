import { Heart, Music, User } from 'lucide-react';
import { mediaUrl } from '../lib/supabase';

const PALETTE = [
  ['#06b6d4', '#8b5cf6'],
  ['#8b5cf6', '#d946ef'],
  ['#f97316', '#db2777'],
  ['#10b981', '#0891b2'],
  ['#6366f1', '#0ea5e9'],
  ['#eab308', '#f97316'],
  ['#ef4444', '#7c3aed'],
  ['#14b8a6', '#6366f1'],
];
export function hash(s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export const paletteFor = (key) => PALETTE[hash(key) % PALETTE.length];

// Capa quadrada (música ou álbum)
export function Artwork({ src, size, alt = '', className = '' }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className={`art ${className}`} style={style}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" draggable="false" /> : <Music size={size ? Math.max(14, size * 0.4) : 28} aria-hidden="true" />}
    </span>
  );
}

// Capa de playlist: até 4 capas em mosaico; sem músicas, um degradê
export function Mosaic({ covers = [], seed = '', className = '', size }) {
  const style = size ? { width: size, height: size } : undefined;
  if (covers.length >= 4) {
    return (
      <span className={`art art--mosaic ${className}`} style={style}>
        {covers.slice(0, 4).map((c) => (
          <img key={c} src={c} alt="" loading="lazy" decoding="async" draggable="false" />
        ))}
      </span>
    );
  }
  if (covers.length) return <Artwork src={covers[0]} className={className} size={size} />;
  const [a, b] = paletteFor(seed);
  return (
    <span className={`art art--empty ${className}`} style={{ ...style, background: `linear-gradient(135deg, ${a}, ${b})` }}>
      <Music size={size ? Math.max(14, size * 0.38) : 40} aria-hidden="true" />
    </span>
  );
}

export function LikedCover({ className = '', size }) {
  return (
    <span className={`art art--liked ${className}`} style={size ? { width: size, height: size } : undefined}>
      <Heart size={size ? Math.max(14, size * 0.38) : 40} fill="currentColor" aria-hidden="true" />
    </span>
  );
}

// Foto do personagem (do FargusGram)
export function Avatar({ character, size = 32, className = '' }) {
  const url = mediaUrl(character?.avatar_path);
  const label = (character?.name || character?.handle || '?').trim();
  const [a, b] = paletteFor(character?.handle || label);
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42), background: url ? undefined : `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {url ? <img src={url} alt="" loading="lazy" decoding="async" draggable="false" /> : label ? label[0].toUpperCase() : <User size={size * 0.5} />}
    </span>
  );
}

// Barrinhas animadas da música que está tocando
export function Equalizer({ paused = false }) {
  return (
    <span className={`eq ${paused ? 'eq--paused' : ''}`} aria-label={paused ? 'Pausada' : 'Tocando'}>
      <i />
      <i />
      <i />
    </span>
  );
}
