import { useNavigate, Link } from 'react-router';
import { ChevronDown, Heart, ListMusic, Radio, SkipBack, SkipForward } from 'lucide-react';
import { Artwork } from '../components/Art';
import { Empty, IconButton } from '../components/ui';
import { PlayPause, Progress, ShuffleRepeat } from '../components/Layout';
import { current, next, prev, usePlayer } from '../lib/player';
import * as api from '../lib/api';
import { useLibrary } from '../state/library';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';

// Tela "tocando agora": capa grande, e os controles no player completo.
// No modo embed, os controles são os do próprio player do Spotify (na barra de baixo).
export default function NowPlaying() {
  const p = usePlayer();
  const t = current(p);
  const lib = useLibrary();
  const { active } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  if (!t) return <Empty title="Nada tocando">Escolha uma música para começar.</Empty>;
  const saved = lib.isSaved(t.id);
  const upNext = p.queue.slice(p.index + 1, p.index + 6);

  return (
    <div className="page page--now">
      <div className="now__top">
        <IconButton label="Fechar" onClick={() => navigate(-1)}>
          <ChevronDown size={26} />
        </IconButton>
        <div className="now__ctx">
          <small className="muted">Tocando de</small>
          {p.context?.href ? <Link to={p.context.href}>{p.context.name}</Link> : <span>{p.context?.name || 'Músicas avulsas'}</span>}
        </div>
        <IconButton label="Fila" onClick={() => navigate('/fila')}>
          <ListMusic size={22} />
        </IconButton>
      </div>
      <div className="now__art">
        <Artwork src={t.artwork} />
      </div>
      <div className="now__info">
        <div className="now__titles">
          <h1>{t.title}</h1>
          <span className="muted">{t.artist}</span>
        </div>
        <IconButton label={saved ? 'Remover das curtidas' : 'Curtir'} className={`track__heart ${saved ? 'is-on' : ''}`} onClick={() => lib.toggleSaved(t)}>
          <Heart size={24} fill={saved ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
      {p.engine === 'sdk' ? (
        <>
          <Progress />
          <div className="now__controls">
            <ShuffleRepeat />
            <IconButton label="Anterior" onClick={prev}>
              <SkipBack size={28} fill="currentColor" />
            </IconButton>
            <PlayPause />
            <IconButton label="Próxima" onClick={() => next()}>
              <SkipForward size={28} fill="currentColor" />
            </IconButton>
          </div>
        </>
      ) : (
        <div className="now__controls now__controls--embed">
          <ShuffleRepeat />
          <IconButton label="Anterior" onClick={prev}>
            <SkipBack size={26} fill="currentColor" />
          </IconButton>
          <IconButton label="Próxima" onClick={() => next()}>
            <SkipForward size={26} fill="currentColor" />
          </IconButton>
        </div>
      )}
      {active && (
        <button
          type="button"
          className="btn btn--ghost btn--small now__status"
          onClick={async () => {
            try {
              await api.setNowPlaying(active.id, t);
              toast(`@${active.handle} está ouvindo "${t.title}"`);
            } catch (e) {
              toast(api.errorMessage(e), { kind: 'error' });
            }
          }}
        >
          <Radio size={16} /> Mostrar no perfil de @{active.handle}
        </button>
      )}
      {!!upNext.length && (
        <section className="now__next">
          <h2>A seguir</h2>
          {upNext.map((x, k) => (
            <div key={`${x.id}-${k}`} className="qrow">
              <span className="qrow__main">
                <Artwork src={x.artwork} size={40} />
                <span className="qrow__text">
                  <strong>{x.title}</strong>
                  <small className="muted">{x.artist}</small>
                </span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
