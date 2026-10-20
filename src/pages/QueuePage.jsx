import { Link } from 'react-router';
import { ArrowDown, ArrowUp, ListMusic, X } from 'lucide-react';
import { Artwork, Equalizer } from '../components/Art';
import { Button, Empty, IconButton } from '../components/ui';
import { clearUpcoming, current, jump, moveInQueue, removeFromQueue, usePlayer } from '../lib/player';
import { fmtTime } from '../lib/format';

function Row({ t, i, label, onUp, onDown, onRemove, playing, paused }) {
  return (
    <div className={`qrow ${playing ? 'is-current' : ''}`}>
      <button type="button" className="qrow__main" onClick={() => jump(i)} aria-label={`${label}: tocar ${t.title}`}>
        <Artwork src={t.artwork} size={44} />
        <span className="qrow__text">
          <strong>{t.title}</strong>
          <small className="muted">{t.artist}</small>
        </span>
      </button>
      {playing ? <Equalizer paused={paused} /> : <span className="muted qrow__time">{fmtTime(t.duration_ms)}</span>}
      {onUp && (
        <IconButton label="Subir" onClick={onUp}>
          <ArrowUp size={18} />
        </IconButton>
      )}
      {onDown && (
        <IconButton label="Descer" onClick={onDown}>
          <ArrowDown size={18} />
        </IconButton>
      )}
      {onRemove && (
        <IconButton label="Tirar da fila" onClick={onRemove}>
          <X size={18} />
        </IconButton>
      )}
    </div>
  );
}

export default function QueuePage() {
  const p = usePlayer();
  const cur = current(p);
  if (!cur) {
    return (
      <div className="page">
        <h1>Fila</h1>
        <Empty icon={<ListMusic size={32} />} title="Nada tocando">
          Escolha uma playlist ou álbum para começar.
        </Empty>
      </div>
    );
  }
  const start = p.index + 1;
  const manualEnd = start + p.manual;
  const manual = p.queue.slice(start, manualEnd);
  const rest = p.queue.slice(manualEnd, manualEnd + 80);
  const last = p.queue.length - 1;

  return (
    <div className="page page--queue">
      <h1>Fila</h1>
      <h2 className="queue-label">Tocando agora</h2>
      <Row t={cur} i={p.index} label="Agora" playing paused={p.isPaused} />

      {!!manual.length && (
        <>
          <h2 className="queue-label">A seguir na fila</h2>
          {manual.map((t, k) => {
            const i = start + k;
            return <Row key={`m${i}-${t.id}`} t={t} i={i} label="Fila" onUp={i > start ? () => moveInQueue(i, i - 1) : null} onDown={i < last ? () => moveInQueue(i, i + 1) : null} onRemove={() => removeFromQueue(i)} />;
          })}
        </>
      )}

      {!!rest.length && (
        <>
          <h2 className="queue-label">
            A seguir{p.context?.name ? ' de ' : ''}
            {p.context?.href ? <Link to={p.context.href}>{p.context.name}</Link> : p.context?.name}
          </h2>
          {rest.map((t, k) => {
            const i = manualEnd + k;
            return <Row key={`r${i}-${t.id}`} t={t} i={i} label="A seguir" onUp={i > start ? () => moveInQueue(i, i - 1) : null} onDown={i < last ? () => moveInQueue(i, i + 1) : null} onRemove={() => removeFromQueue(i)} />;
          })}
          {p.queue.length - manualEnd > rest.length && <p className="muted pad">e mais {p.queue.length - manualEnd - rest.length} músicas</p>}
          <Button variant="ghost" onClick={clearUpcoming}>
            Limpar a fila
          </Button>
        </>
      )}
    </div>
  );
}
