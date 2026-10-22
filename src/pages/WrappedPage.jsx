import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ListPlus, Play, Sparkles } from 'lucide-react';
import { Artwork, Avatar } from '../components/Art';
import { Shelf } from '../components/Cards';
import { TrackList } from '../components/TrackList';
import { Button, Empty, ErrorBox, Loading, useAsync } from '../components/ui';
import WrappedStory from '../components/WrappedStory';
import * as api from '../lib/api';
import { artistImage } from '../lib/catalog';
import { playTracks } from '../lib/player';
import { MIN_MS, fmtDay, fmtHours, fmtInt, minutes, monthName, parsePeriod } from '../lib/wrapped';
import { useSession } from '../state/session';
import { useLibrary } from '../state/library';
import { useToast } from '../state/toast';

const asTrack = (t) => ({ id: t.id, title: t.title, artist: t.artist, album: '', album_id: t.album_id, artwork: t.artwork, duration_ms: t.duration_ms || 0, explicit: false, plays: t.plays });

// Retrospectiva: do personagem ativo (/retrospectiva) ou de qualquer um (/u/:handle/retrospectiva)
export default function WrappedPage() {
  const { handle } = useParams();
  const [params, setParams] = useSearchParams();
  const { active } = useSession();
  const lib = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const own = !handle || handle === active?.handle;
  const period = parsePeriod(params.get('p'));
  const [story, setStory] = useState(false);
  const [images, setImages] = useState({});
  const [busy, setBusy] = useState(false);

  const res = useAsync(async () => {
    const who = own ? active : await api.characterByHandle(handle);
    if (!who) return null;
    // o ano inteiro vem junto, para saber quais meses têm música
    const yearP = parsePeriod(String(period.year));
    const [w, year] = await Promise.all([
      api.wrapped(who.id, period.from, period.to),
      period.month ? api.wrapped(who.id, yearP.from, yearP.to) : null,
    ]);
    return { who, w, year: year || w };
  }, [handle, active?.id, period.key]);

  const w = res.data?.w;
  const topArtists = w?.top_artists?.slice(0, 5) ?? [];
  const artistsKey = topArtists.map((a) => a.name).join('|');
  useEffect(() => {
    if (!artistsKey) return;
    let alive = true;
    Promise.allSettled(topArtists.map((a) => artistImage(a.name, a.artist_id))).then((list) => {
      if (!alive) return;
      const map = {};
      list.forEach((r, k) => {
        if (r.status === 'fulfilled' && r.value) map[topArtists[k].name] = r.value;
      });
      setImages(map);
    });
    return () => {
      alive = false;
    };
  }, [artistsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorBox onRetry={res.reload}>{api.errorMessage(res.error)}</ErrorBox>;
  if (!res.data) return <Empty title="Personagem não encontrado" />;
  const { who, year } = res.data;

  const setPeriod = (key) => setParams(key === String(new Date().getFullYear()) ? {} : { p: key }, { replace: true });
  const months = (year.months || []).filter((m) => m.ms > 0);
  const since = w.since || year.since;
  const yearsBack = since ? Number(since.slice(0, 4)) : period.year;
  const years = [];
  for (let y = new Date().getFullYear(); y >= Math.min(yearsBack, period.year); y--) years.push(y);
  const enough = Number(w.total_ms) >= MIN_MS;
  const tracks = (w.top_tracks || []).map(asTrack);
  const context = { type: 'wrapped', id: `${who.id}:${period.key}`, name: `Mais ouvidas de ${period.label}`, href: `${own ? '' : `/u/${who.handle}`}/retrospectiva` };

  const createPlaylist = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const p = await api.createPlaylist({
        characterId: who.id,
        name: `Mais ouvidas de ${period.label}`,
        description: `As músicas que @${who.handle} mais ouviu em ${period.label}, pela Retrospectiva do FargusFy.`,
      });
      await api.addTracks(p.id, tracks.slice(0, 50), who.id);
      lib.refresh();
      toast(`Playlist "${p.name}" criada`);
      setStory(false);
      navigate(`/playlist/${p.id}`);
    } catch (e) {
      toast(api.errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const maxMonth = Math.max(1, ...months.map((m) => Number(m.ms)));

  return (
    <div className="page page--wrapped">
      <button type="button" className="wr-cover-card" onClick={() => enough && setStory(true)} disabled={!enough} aria-label={enough ? `Ver a Retrospectiva ${period.label} de @${who.handle}` : undefined}>
        <svg className="wr-vinyl" viewBox="0 0 200 200" aria-hidden="true">
          {[96, 80, 64, 48, 32].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} />
          ))}
          <circle cx="100" cy="100" r="10" className="wr-vinyl__hole" />
        </svg>
        <span className="wr-kicker">
          <Avatar character={who} size={28} /> @{who.handle}
        </span>
        <span className="wr-cover-card__title">
          Retro&shy;spectiva
          <br />
          {period.month ? period.short : period.year}
        </span>
        {enough && (
          <span className="wr-cover-card__go">
            <Play size={18} fill="currentColor" /> Começar
          </span>
        )}
      </button>

      <div className="chips" role="tablist" aria-label="Período">
        {years.map((y) => (
          <button key={y} type="button" role="tab" aria-selected={period.key === String(y)} className={`chip ${period.key === String(y) ? 'is-on' : ''}`} onClick={() => setPeriod(String(y))}>
            {y}
          </button>
        ))}
        {months.map((m) => {
          const key = m.month.slice(0, 7);
          return (
            <button key={key} type="button" role="tab" aria-selected={period.key === key} className={`chip ${period.key === key ? 'is-on' : ''}`} onClick={() => setPeriod(key)}>
              {monthName(Number(key.slice(5)) - 1)}
            </button>
          );
        })}
      </div>

      {!enough ? (
        <Empty
          icon={<Sparkles size={32} />}
          title={own ? 'Sua Retrospectiva ainda está começando' : `@${who.handle} ainda não tem Retrospectiva aqui`}
          action={
            own && (
              <Link to="/buscar" className="btn btn--primary">
                Buscar músicas
              </Link>
            )
          }
        >
          {since
            ? `A contagem começou em ${fmtDay(since)}. Quando tiver mais música em ${period.label}, ela aparece aqui.`
            : 'Toda música tocada no FargusFy entra na conta. Depois de alguns minutos de música, a Retrospectiva aparece aqui.'}
        </Empty>
      ) : (
        <>
          <p className="wr-facts">
            <strong>{fmtInt(minutes(w.total_ms))} minutos</strong>, {fmtInt(w.track_count)} músicas e {fmtInt(w.artist_count)} artistas em {w.active_days}{' '}
            {w.active_days === 1 ? 'dia' : 'dias'} com música.
            {since && <span className="muted"> Contando desde {fmtDay(since)}.</span>}
          </p>

          <section className="shelf">
            <div className="shelf__head">
              <h2>Músicas mais ouvidas</h2>
              {own && (
                <Button variant="ghost" className="btn--small" onClick={createPlaylist} loading={busy}>
                  <ListPlus size={16} /> Criar playlist
                </Button>
              )}
            </div>
            <TrackList tracks={tracks.slice(0, 10)} context={context} header={false} showAlbum={false} />
            {tracks.length > 0 && (
              <button type="button" className="btn btn--ghost btn--small wr-play-all" onClick={() => playTracks(tracks, 0, context)}>
                <Play size={16} fill="currentColor" /> Tocar as {tracks.length} mais ouvidas
              </button>
            )}
          </section>

          {topArtists.length > 0 && (
            <Shelf title="Artistas mais ouvidos">
              {w.top_artists.map((a, k) => (
                <Link key={a.name} to={a.artist_id ? `/artista/${a.artist_id}` : `/buscar?q=${encodeURIComponent(a.name)}&f=artist`} className="card card--round">
                  <div className="card__art">
                    <Artwork src={images[a.name] || a.artwork} className="art--round" />
                  </div>
                  <strong className="card__title">
                    {k + 1}. {a.name}
                  </strong>
                  <span className="card__sub">{fmtHours(a.ms)}</span>
                </Link>
              ))}
            </Shelf>
          )}

          {!period.month && months.length > 1 && (
            <section className="shelf">
              <div className="shelf__head">
                <h2>Minutos por mês</h2>
              </div>
              <div className="wr-months">
                {months.map((m) => (
                  <button key={m.month} type="button" className="wr-months__bar" onClick={() => setPeriod(m.month.slice(0, 7))} title={`${fmtInt(minutes(m.ms))} minutos`}>
                    <span style={{ height: `${Math.max(4, (Number(m.ms) / maxMonth) * 100)}%` }} />
                    <small>{monthName(Number(m.month.slice(5, 7)) - 1).slice(0, 3)}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {story && enough && (
        <WrappedStory w={w} character={who} own={own} period={period} images={images} onClose={() => setStory(false)} onCreatePlaylist={createPlaylist} />
      )}
    </div>
  );
}
