import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Heart, ListPlus, Moon, Play, RotateCcw, Repeat, Shuffle, Sun, Sunrise, Sunset, X } from 'lucide-react';
import '@fontsource/unbounded/800.css';
import { Artwork, Avatar } from './Art';
import { playTracks } from '../lib/player';
import { buildSlides, fmtDay, fmtHours, fmtInt, listenerType, minutes, minutesFun, rankText, shiftOf } from '../lib/wrapped';

const SLIDE_MS = 7000;

// fundo / texto de cada tela (cores chapadas, uma por tela)
const THEMES = {
  intro: ['#1b1464', '#c6f432'],
  minutes: ['#c6f432', '#1b1464'],
  time: ['#0e2a47', '#ffd84d'],
  artist: ['#ff5a36', '#fff4e8'],
  artists: ['#ff7ac6', '#1b1464'],
  track: ['#47b5ff', '#0e1a3d'],
  tracks: ['#ffd84d', '#1b1464'],
  type: ['#1b1464', '#ff7ac6'],
  summary: ['#c6f432', '#1b1464'],
};

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useCountUp(target, active, ms = 1500) {
  const [v, setV] = useState(reduceMotion() ? target : 0);
  useEffect(() => {
    if (!active) return;
    if (reduceMotion()) return setV(target);
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return v;
}

const SHIFT_ICON = { madrugada: Moon, manha: Sunrise, tarde: Sun, noite: Sunset };
const TYPE_ICON = { repeat: Repeat, explorer: Compass, loyal: Heart, mix: Shuffle };

function toTrack(t) {
  return { id: t.id, title: t.title, artist: t.artist, album: '', album_id: t.album_id, artwork: t.artwork, duration_ms: t.duration_ms || 0, explicit: false };
}

// Botão dentro da tela: não pode virar "toque para avançar"
function SlideButton({ children, onClick, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`wr-btn ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function Slide({ kind, w, character, own, period, images, active, onCreatePlaylist, onRestart }) {
  const S = own ? 'Você' : `@${character.handle}`;
  const min = minutes(w.total_ms);
  const count = useCountUp(min, active && kind === 'minutes');
  const shift = shiftOf(w.hours);
  const type = listenerType(w);
  const a1 = w.top_artists?.[0];
  const t1 = w.top_tracks?.[0];
  const inPeriod = period.month ? `em ${period.short}` : `em ${period.year}`;

  switch (kind) {
    case 'intro':
      return (
        <div className="wr-slide wr-intro">
          <svg className="wr-vinyl" viewBox="0 0 200 200" aria-hidden="true">
            {[96, 80, 64, 48, 32].map((r) => (
              <circle key={r} cx="100" cy="100" r={r} />
            ))}
            <circle cx="100" cy="100" r="10" className="wr-vinyl__hole" />
          </svg>
          <p className="wr-kicker">
            <Avatar character={character} size={28} /> @{character.handle}
          </p>
          <h2 className="wr-huge">
            Retro&shy;spec&shy;tiva
            <br />
            {period.month ? period.short : period.year}
          </h2>
          <p className="wr-lead">Tudo o que {own ? 'você ouviu' : `@${character.handle} ouviu`} no FargusFy {inPeriod}. Toque para começar.</p>
        </div>
      );
    case 'minutes':
      return (
        <div className="wr-slide wr-minutes">
          <p className="wr-lead">{S} ouviu</p>
          <p className="wr-number" aria-label={`${fmtInt(min)} minutos`}>
            {fmtInt(count)}
          </p>
          <h2 className="wr-title">minutos de música</h2>
          <p className="wr-lead">{minutesFun(w)}</p>
          {rankText(w.campaign, S, 'ouviu música') && <p className="wr-note">{rankText(w.campaign, S, 'ouviu música')}</p>}
          <div className="wr-rings" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      );
    case 'time': {
      const Icon = SHIFT_ICON[shift.key] || Sun;
      const max = Math.max(...shift.byHour, 1);
      return (
        <div className="wr-slide wr-time">
          <Icon className="wr-icon" size={64} strokeWidth={1.6} aria-hidden="true" />
          <h2 className="wr-title wr-title--big">{shift.title}</h2>
          <p className="wr-lead">{shift.text}</p>
          <div className="wr-hours" role="img" aria-label={`Horário com mais música: ${shift.peak}h`}>
            {shift.byHour.map((ms, h) => (
              <span key={h} className={h === shift.peak ? 'is-peak' : ''} style={{ '--h': `${Math.max(4, (ms / max) * 100)}%`, '--i': h }} />
            ))}
          </div>
          <div className="wr-hours__axis" aria-hidden="true">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
          <p className="wr-note">
            O dia mais musical foi {fmtDay(w.top_day.day)}, com {fmtHours(w.top_day.ms)}.
          </p>
        </div>
      );
    }
    case 'artist':
      return (
        <div className="wr-slide wr-artist">
          <p className="wr-lead">Artista nº 1</p>
          <div className="wr-portrait">
            <Artwork src={images[a1.name] || a1.artwork} className="art--round" />
          </div>
          <h2 className="wr-title wr-title--big">{a1.name}</h2>
          <p className="wr-lead">
            {fmtHours(a1.ms)} juntos, em {a1.tracks === 1 ? '1 música' : `${fmtInt(a1.tracks)} músicas diferentes`}.
          </p>
          {rankText(w.top_artist_fans, S, `ouviu ${a1.name}`) && <p className="wr-note">{rankText(w.top_artist_fans, S, `ouviu ${a1.name}`)}</p>}
        </div>
      );
    case 'artists':
      return (
        <div className="wr-slide wr-list">
          <h2 className="wr-title">Os artistas mais ouvidos</h2>
          <ol className="wr-rank">
            {w.top_artists.slice(0, 5).map((a, i) => (
              <li key={a.name} style={{ '--i': i }}>
                <span className="wr-rank__n">{i + 1}</span>
                <Artwork src={images[a.name] || a.artwork} size={56} className="art--round" />
                <span className="wr-rank__text">
                  <strong>{a.name}</strong>
                  <small>{fmtHours(a.ms)}</small>
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'track':
      return (
        <div className="wr-slide wr-track">
          <p className="wr-lead">Música nº 1</p>
          <div className="wr-cover">
            <Artwork src={t1.artwork} />
          </div>
          <h2 className="wr-title wr-title--big">{t1.title}</h2>
          <p className="wr-lead">{t1.artist}</p>
          <p className="wr-note">
            Tocou {t1.plays === 1 ? '1 vez' : `${fmtInt(t1.plays)} vezes`}, {fmtHours(t1.ms)} no total.
          </p>
          <SlideButton className="wr-btn--play" onClick={() => playTracks([toTrack(t1)], 0, null)}>
            <Play size={18} fill="currentColor" /> Tocar
          </SlideButton>
        </div>
      );
    case 'tracks':
      return (
        <div className="wr-slide wr-list">
          <h2 className="wr-title">As músicas mais ouvidas</h2>
          <ol className="wr-rank">
            {w.top_tracks.slice(0, 5).map((t, i) => (
              <li key={t.id} style={{ '--i': i }}>
                <span className="wr-rank__n">{i + 1}</span>
                <Artwork src={t.artwork} size={56} />
                <span className="wr-rank__text">
                  <strong>{t.title}</strong>
                  <small>
                    {t.artist} · {t.plays === 1 ? '1 vez' : `${fmtInt(t.plays)} vezes`}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'type': {
      const Icon = TYPE_ICON[type.key] || Shuffle;
      return (
        <div className="wr-slide wr-type">
          <p className="wr-lead">Tipo de ouvinte</p>
          <Icon className="wr-icon wr-icon--huge" size={120} strokeWidth={1.2} aria-hidden="true" />
          <h2 className="wr-huge wr-huge--type">{type.title}</h2>
          <p className="wr-lead">{type.text}</p>
        </div>
      );
    }
    case 'summary':
      return (
        <div className="wr-slide wr-summary">
          <div className="wr-card">
            <div className="wr-card__head">
              <Avatar character={character} size={44} />
              <span>
                <strong>@{character.handle}</strong>
                <small>Retrospectiva {period.label}</small>
              </span>
            </div>
            <div className="wr-card__cols">
              <div>
                <h3>Artistas</h3>
                <ol>
                  {(w.top_artists || []).slice(0, 5).map((a) => (
                    <li key={a.name}>{a.name}</li>
                  ))}
                </ol>
              </div>
              <div>
                <h3>Músicas</h3>
                <ol>
                  {(w.top_tracks || []).slice(0, 5).map((t) => (
                    <li key={t.id}>{t.title}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="wr-card__foot">
              <div>
                <h3>Minutos</h3>
                <strong>{fmtInt(min)}</strong>
              </div>
              <div>
                <h3>Tipo</h3>
                <strong>{type.title}</strong>
              </div>
            </div>
            <p className="wr-card__brand">fargusfy</p>
          </div>
          <div className="wr-actions">
            {own && onCreatePlaylist && w.top_tracks?.length > 0 && (
              <SlideButton className="wr-btn--solid" onClick={onCreatePlaylist}>
                <ListPlus size={18} /> Criar playlist com as mais ouvidas
              </SlideButton>
            )}
            <SlideButton onClick={onRestart}>
              <RotateCcw size={18} /> Ver de novo
            </SlideButton>
          </div>
        </div>
      );
    default:
      return null;
  }
}

// Retrospectiva em telas, como stories: toque à direita avança, à esquerda volta,
// segurar pausa. A última tela fica parada.
export default function WrappedStory({ w, character, own, period, images = {}, onClose, onCreatePlaylist }) {
  const slides = buildSlides(w);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0); // recomeça a animação da tela
  const press = useRef(null);
  const ref = useRef(null);
  const kind = slides[i];
  const last = i === slides.length - 1;

  const go = useCallback(
    (d) => {
      setI((x) => {
        const n = x + d;
        if (n < 0) return 0;
        if (n >= slides.length) return x;
        return n;
      });
      setRun((r) => r + 1);
    },
    [slides.length]
  );

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [go, onClose]);

  const [bg, fg] = THEMES[kind] || THEMES.intro;

  return createPortal(
    <div className="wr-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`wr-frame ${paused ? 'is-paused' : ''}`}
        style={{ '--wr-bg': bg, '--wr-fg': fg }}
        role="dialog"
        aria-modal="true"
        aria-label={`Retrospectiva de @${character.handle}`}
        tabIndex={-1}
        ref={ref}
        onPointerDown={(e) => {
          press.current = { at: Date.now(), x: e.clientX };
          setPaused(true);
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          setPaused(false);
          if (!p || Date.now() - p.at > 300) return;
          const box = e.currentTarget.getBoundingClientRect();
          go(e.clientX - box.left < box.width * 0.3 ? -1 : 1);
        }}
        onPointerCancel={() => {
          press.current = null;
          setPaused(false);
        }}
      >
        <div className="wr-progress" aria-hidden="true">
          {slides.map((s, k) => (
            <span key={s} className={k < i ? 'is-done' : ''}>
              {k === i && (
                <i
                  key={run}
                  className={last ? 'is-full' : ''}
                  style={{ animationDuration: `${SLIDE_MS}ms` }}
                  onAnimationEnd={() => !last && go(1)}
                />
              )}
            </span>
          ))}
        </div>
        <SlideButton className="wr-close" aria-label="Fechar a Retrospectiva" onClick={onClose}>
          <X size={22} />
        </SlideButton>
        <div className="wr-stage" key={`${kind}-${run}`} aria-live="polite">
          <Slide
            kind={kind}
            w={w}
            character={character}
            own={own}
            period={period}
            images={images}
            active
            onCreatePlaylist={onCreatePlaylist}
            onRestart={() => {
              setI(0);
              setRun((r) => r + 1);
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
