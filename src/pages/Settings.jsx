import { useEffect, useState } from 'react';
import { BadgeCheck, Check, Copy, Database, LogOut, Palette, Radio, Sparkles, Speaker } from 'lucide-react';
import { Avatar } from '../components/Art';
import { Button, ErrorBox, useAsync } from '../components/ui';
import * as api from '../lib/api';
import { connect, disconnect, hasClientId, isConnected, onAuthChange, redirectUri, userApi } from '../lib/spotifyAuth';
import { setMode, usePlayer } from '../lib/player';
import { local } from '../lib/storage';
import { listeningEnabled, setListeningEnabled } from '../lib/listening';
import { Link } from 'react-router';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { FARGUSGRAM_URL } from '../config';

export const AUTO_NOW_KEY = 'fy-auto-now';
export const autoNowEnabled = () => local.get(AUTO_NOW_KEY, '1') === '1';

const MB = (b) => `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

export default function Settings() {
  const { active, characters, setActive, signOut } = useSession();
  const player = usePlayer();
  const toast = useToast();
  const [connected, setConnected] = useState(isConnected());
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [autoNow, setAutoNow] = useState(autoNowEnabled());
  const [listenOn, setListenOn] = useState(listeningEnabled());
  const usage = useAsync(() => api.usage(), []);

  useEffect(() => onAuthChange(setConnected), []);
  useEffect(() => {
    if (!connected) return setProfile(null);
    userApi('me')
      .then(setProfile)
      .catch((e) => setProfile({ error: e.message }));
  }, [connected]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copiado');
    } catch {
      toast(text);
    }
  };

  return (
    <div className="page page--settings">
      <h1>Configurações</h1>

      <section className="panel">
        <h2>Ouvindo como</h2>
        <p className="muted">O personagem é o mesmo escolhido no FargusGram. Trocar aqui troca lá também.</p>
        <div className="char-grid">
          {characters.map((c) => (
            <button key={c.id} type="button" className={`char-pick ${c.id === active?.id ? 'is-on' : ''}`} onClick={() => setActive(c.id)}>
              <Avatar character={c} size={56} />
              <span>
                @{c.handle}
                {c.is_verified && <BadgeCheck size={13} className="verified" />}
              </span>
              {c.id === active?.id && <Check size={16} className="char-pick__check" />}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>
          <Speaker size={20} /> Player
        </h2>
        <p>
          Agora: <strong>{player.engine === 'sdk' ? 'player completo do Spotify (Premium)' : 'player embutido do Spotify'}</strong>
        </p>
        <p className="muted">
          O player embutido funciona para todo mundo. Quem está logado no Spotify neste navegador costuma ouvir a música inteira; quem não está ouve uma prévia.
          O player completo toca tudo dentro do FargusFy, mas o Spotify só libera para contas Premium cadastradas no app (no máximo 5).
        </p>
        {!hasClientId() ? (
          <ErrorBox>Para o player completo, cole o Client ID do app do Spotify em src/config.js (veja o README).</ErrorBox>
        ) : connected ? (
          <div className="stack">
            {profile && !profile.error && (
              <p>
                Conectado como <strong>{profile.display_name || profile.id}</strong>
              </p>
            )}
            {profile?.error && <ErrorBox>{profile.error}</ErrorBox>}
            <label className="switch">
              <input type="checkbox" checked={player.mode !== 'embed'} onChange={(e) => setMode(e.target.checked ? 'auto' : 'embed')} />
              <span>Usar o player completo neste aparelho</span>
            </label>
            <Button variant="ghost" onClick={disconnect}>
              Desconectar do Spotify
            </Button>
          </div>
        ) : (
          <div className="stack">
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await connect();
                } catch (e) {
                  toast(e.message, { kind: 'error' });
                  setBusy(false);
                }
              }}
            >
              Conectar Spotify Premium
            </Button>
            <details className="details">
              <summary>Endereço de retorno para o painel do Spotify</summary>
              <p className="muted">Cadastre exatamente este endereço em Redirect URIs, no app do Spotify:</p>
              <button type="button" className="code-copy" onClick={() => copy(redirectUri())}>
                <code>{redirectUri()}</code>
                <Copy size={16} />
              </button>
            </details>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>
          <Radio size={20} /> Ouvindo agora
        </h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={autoNow}
            onChange={(e) => {
              local.set(AUTO_NOW_KEY, e.target.checked ? '1' : '0');
              setAutoNow(e.target.checked);
            }}
          />
          <span>Mostrar no perfil de @{active?.handle} a música que estou ouvindo</span>
        </label>
        <p className="muted">Atualiza poucos segundos depois que cada música começa e renova a cada 5 minutos enquanto toca.</p>
        {active && (
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await api.clearNowPlaying(active.id);
                toast('"Ouvindo agora" apagado');
              } catch (e) {
                toast(api.errorMessage(e), { kind: 'error' });
              }
            }}
          >
            Apagar o "ouvindo agora" de @{active.handle}
          </Button>
        )}
      </section>

      <section className="panel">
        <h2>
          <Sparkles size={20} /> Retrospectiva
        </h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={listenOn}
            onChange={(e) => {
              setListeningEnabled(e.target.checked);
              setListenOn(e.target.checked);
            }}
          />
          <span>Contar o que eu ouço neste aparelho na Retrospectiva</span>
        </label>
        <p className="muted">
          Guarda só os totais por música, dia e hora, e envia em lotes a cada 5 minutos de música. Todo o grupo pode ver a Retrospectiva de cada personagem.
        </p>
        <Link to="/retrospectiva" className="btn btn--ghost btn--small">
          <Sparkles size={16} /> Ver a Retrospectiva
        </Link>
      </section>

      <section className="panel">
        <h2>
          <Database size={20} /> Espaço no banco
        </h2>
        {usage.data ? (
          <>
            <p>
              O FargusFy ocupa <strong>{MB(usage.data.bytes)}</strong>, com {usage.data.playlists} playlists, {usage.data.tracks} músicas em playlists e {usage.data.saved} curtidas.
            </p>
            <div className="meter" aria-label="Uso do banco">
              <span style={{ width: `${Math.min(100, (usage.data.database_bytes / (500 * 1024 * 1024)) * 100)}%` }} />
            </div>
            <p className="muted">
              Banco inteiro (FargusGram + FargusFy): {MB(usage.data.database_bytes)} de 500 MB do plano grátis. O FargusFy não guarda áudio nem imagens.
            </p>
          </>
        ) : usage.error ? (
          <ErrorBox>{api.errorMessage(usage.error)}</ErrorBox>
        ) : (
          <p className="muted">Calculando…</p>
        )}
      </section>

      <section className="panel">
        <h2>
          <Palette size={20} /> Tema
        </h2>
        <p className="muted">O FargusFy usa o tema escolhido no FargusGram.</p>
        <a className="btn btn--ghost btn--small" href={`${FARGUSGRAM_URL}#/temas`}>
          Mudar o tema no FargusGram
        </a>
      </section>

      <section className="panel">
        <Button variant="danger-ghost" onClick={signOut}>
          <LogOut size={18} /> Sair (sai do FargusGram também)
        </Button>
      </section>
    </div>
  );
}
