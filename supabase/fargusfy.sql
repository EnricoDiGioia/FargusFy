-- =====================================================================
--  FargusFy — banco de dados (roda no MESMO projeto Supabase do FargusGram)
--
--  Como instalar: no Supabase do FargusGram, abra o SQL Editor, clique em
--  "New query", cole este arquivo inteiro e clique em "Run". Ele só cria
--  tabelas novas (todas começam com fy_) e não mexe em nada do FargusGram.
--  Pode ser rodado mais de uma vez.
--
--  Precisa do FargusGram já instalado (usa as tabelas characters e players
--  e as funções is_member, is_admin e owns_character do setup.sql).
--
--  Plano grátis: o FargusFy não guarda áudio nem imagens. Cada música numa
--  playlist ocupa uns 300 bytes (id do Spotify, título, artista e o link da
--  capa, que fica no CDN do Spotify). Os limites abaixo seguram o pior caso
--  em poucos MB:
--    - 100 playlists por personagem
--    - 500 músicas por playlist
--    - 2.000 músicas curtidas por personagem
--    - 10 colaboradores por playlist
--    - Retrospectiva: só resumos por mês, dia e hora (seção 5)
--
--  Atualizações: quando o FargusFy ganhar novidades no banco (como as
--  playlists colaborativas e a Retrospectiva, em outubro/2026), basta
--  rodar este arquivo de novo. Ele não apaga nada que já existe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

-- Playlists dos personagens
create table if not exists public.fy_playlists (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 300),
  is_public    boolean not null default true,
  track_count  int not null default 0,
  duration_ms  bigint not null default 0,
  covers       text[] not null default '{}',   -- até 4 capas para o mosaico
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists fy_playlists_character_idx on public.fy_playlists (character_id, updated_at desc);
create index if not exists fy_playlists_updated_idx on public.fy_playlists (updated_at desc) where is_public;

-- Regras dos dados de uma música (repetidas nas três tabelas que guardam músicas)
--   track_id: id do Spotify (22 letras e números)
--   artwork:  só imagens do CDN do Spotify (i.scdn.co)
create table if not exists public.fy_playlist_tracks (
  id          bigint generated always as identity primary key,
  playlist_id uuid not null references public.fy_playlists (id) on delete cascade,
  position    double precision not null,
  track_id    text not null check (track_id ~ '^[A-Za-z0-9]{22}$'),
  title       text not null check (char_length(title) between 1 and 200),
  artist      text not null default '' check (char_length(artist) <= 300),
  album       text not null default '' check (char_length(album) <= 200),
  album_id    text check (album_id is null or album_id ~ '^[A-Za-z0-9]{22}$'),
  artwork     text check (artwork is null or (artwork ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$')),
  duration_ms int not null default 0 check (duration_ms between 0 and 14400000),
  explicit    boolean not null default false,
  added_by    uuid references public.characters (id) on delete set null,
  added_at    timestamptz not null default now()
);
create index if not exists fy_playlist_tracks_order_idx on public.fy_playlist_tracks (playlist_id, position);

-- Músicas curtidas de cada personagem
create table if not exists public.fy_saved_tracks (
  character_id uuid not null references public.characters (id) on delete cascade,
  track_id     text not null check (track_id ~ '^[A-Za-z0-9]{22}$'),
  title        text not null check (char_length(title) between 1 and 200),
  artist       text not null default '' check (char_length(artist) <= 300),
  album        text not null default '' check (char_length(album) <= 200),
  album_id     text check (album_id is null or album_id ~ '^[A-Za-z0-9]{22}$'),
  artwork      text check (artwork is null or (artwork ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$')),
  duration_ms  int not null default 0 check (duration_ms between 0 and 14400000),
  explicit     boolean not null default false,
  saved_at     timestamptz not null default now(),
  primary key (character_id, track_id)
);
create index if not exists fy_saved_tracks_recent_idx on public.fy_saved_tracks (character_id, saved_at desc);

-- Playlists de outros personagens que o personagem segue
create table if not exists public.fy_playlist_follows (
  character_id uuid not null references public.characters (id) on delete cascade,
  playlist_id  uuid not null references public.fy_playlists (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (character_id, playlist_id)
);
create index if not exists fy_playlist_follows_playlist_idx on public.fy_playlist_follows (playlist_id);

-- Playlists colaborativas: personagens convidados pelo dono podem adicionar,
-- remover e reordenar músicas (até 10 colaboradores por playlist)
create table if not exists public.fy_playlist_collaborators (
  playlist_id  uuid not null references public.fy_playlists (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (playlist_id, character_id)
);
create index if not exists fy_playlist_collaborators_character_idx on public.fy_playlist_collaborators (character_id);

-- "Ouvindo agora" de cada personagem (uma linha por personagem, sobrescrita)
create table if not exists public.fy_now_playing (
  character_id uuid primary key references public.characters (id) on delete cascade,
  track_id     text not null check (track_id ~ '^[A-Za-z0-9]{22}$'),
  title        text not null check (char_length(title) between 1 and 200),
  artist       text not null default '' check (char_length(artist) <= 300),
  album_id     text check (album_id is null or album_id ~ '^[A-Za-z0-9]{22}$'),
  artwork      text check (artwork is null or (artwork ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$')),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Limites e contas automáticas
-- ---------------------------------------------------------------------

create or replace function public.fy_check_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'fy_playlists' then
    if (select count(*) from public.fy_playlists p where p.character_id = new.character_id) >= 100 then
      raise exception 'Limite de 100 playlists por personagem';
    end if;
  elsif tg_table_name = 'fy_playlist_tracks' then
    if (select count(*) from public.fy_playlist_tracks t where t.playlist_id = new.playlist_id) >= 500 then
      raise exception 'Limite de 500 músicas por playlist';
    end if;
  elsif tg_table_name = 'fy_playlist_collaborators' then
    if exists (select 1 from public.fy_playlists p where p.id = new.playlist_id and p.character_id = new.character_id) then
      raise exception 'O dono já pode editar a playlist';
    end if;
    if (select count(*) from public.fy_playlist_collaborators c where c.playlist_id = new.playlist_id) >= 10 then
      raise exception 'Limite de 10 colaboradores por playlist';
    end if;
  elsif tg_table_name = 'fy_saved_tracks' then
    if (select count(*) from public.fy_saved_tracks s where s.character_id = new.character_id) >= 2000 then
      raise exception 'Limite de 2.000 músicas curtidas por personagem';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists fy_playlists_limit on public.fy_playlists;
create trigger fy_playlists_limit before insert on public.fy_playlists
  for each row execute function public.fy_check_limits();
drop trigger if exists fy_playlist_tracks_limit on public.fy_playlist_tracks;
create trigger fy_playlist_tracks_limit before insert on public.fy_playlist_tracks
  for each row execute function public.fy_check_limits();
drop trigger if exists fy_collaborators_limit on public.fy_playlist_collaborators;
create trigger fy_collaborators_limit before insert on public.fy_playlist_collaborators
  for each row execute function public.fy_check_limits();
drop trigger if exists fy_saved_tracks_limit on public.fy_saved_tracks;
create trigger fy_saved_tracks_limit before insert on public.fy_saved_tracks
  for each row execute function public.fy_check_limits();

-- Recalcula contagem, duração e mosaico da playlist quando as músicas mudam
create or replace function public.fy_refresh_playlist(p_playlist uuid)
returns void language sql security definer set search_path = '' as $$
  update public.fy_playlists p set
    track_count = s.n,
    duration_ms = s.ms,
    covers = s.covers,
    updated_at = now()
  from (
    select
      count(*)::int as n,
      coalesce(sum(t.duration_ms), 0)::bigint as ms,
      coalesce((
        select array_agg(c.artwork order by c.first_pos)
        from (
          select t2.artwork, min(t2.position) as first_pos
          from public.fy_playlist_tracks t2
          where t2.playlist_id = p_playlist and t2.artwork is not null
          group by t2.artwork
          order by min(t2.position)
          limit 4
        ) c
      ), '{}') as covers
    from public.fy_playlist_tracks t
    where t.playlist_id = p_playlist
  ) s
  where p.id = p_playlist;
$$;

create or replace function public.fy_tracks_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fy_refresh_playlist(new.playlist_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.playlist_id <> new.playlist_id) then
    perform public.fy_refresh_playlist(old.playlist_id);
  end if;
  return null;
end;
$$;

drop trigger if exists fy_playlist_tracks_changed on public.fy_playlist_tracks;
create trigger fy_playlist_tracks_changed after insert or update or delete on public.fy_playlist_tracks
  for each row execute function public.fy_tracks_changed();

create or replace function public.fy_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists fy_playlists_touch on public.fy_playlists;
create trigger fy_playlists_touch before update of name, description, is_public on public.fy_playlists
  for each row execute function public.fy_touch();

-- ---------------------------------------------------------------------
-- 3. Quem vê e quem altera (Row Level Security)
--    Ver: qualquer jogador logado (playlists privadas só o dono e o admin).
--    Alterar: só o jogador dono do personagem.
-- ---------------------------------------------------------------------
alter table public.fy_playlists        enable row level security;
alter table public.fy_playlist_tracks  enable row level security;
alter table public.fy_saved_tracks     enable row level security;
alter table public.fy_playlist_follows enable row level security;
alter table public.fy_now_playing      enable row level security;
alter table public.fy_playlist_collaborators enable row level security;

create or replace function public.fy_owns_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fy_playlists p
    where p.id = p_playlist and public.owns_character(p.character_id)
  );
$$;

-- o jogador logado tem um personagem colaborador desta playlist?
create or replace function public.fy_is_collaborator(p_playlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fy_playlist_collaborators c
    where c.playlist_id = p_playlist and public.owns_character(c.character_id)
  );
$$;

create or replace function public.fy_can_see_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fy_playlists p
    where p.id = p_playlist
      and public.is_member()
      and (p.is_public or public.owns_character(p.character_id) or public.is_admin() or public.fy_is_collaborator(p.id))
  );
$$;

-- pode mexer nas músicas: o dono ou um colaborador
create or replace function public.fy_can_edit_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fy_owns_playlist(p_playlist) or public.fy_is_collaborator(p_playlist);
$$;

drop policy if exists fy_playlists_select on public.fy_playlists;
create policy fy_playlists_select on public.fy_playlists for select to authenticated
  using ((select public.is_member()) and (is_public or public.owns_character(character_id) or (select public.is_admin()) or public.fy_is_collaborator(id)));
drop policy if exists fy_playlists_insert on public.fy_playlists;
create policy fy_playlists_insert on public.fy_playlists for insert to authenticated
  with check (public.owns_character(character_id) and track_count = 0 and duration_ms = 0 and covers = '{}');
drop policy if exists fy_playlists_update on public.fy_playlists;
create policy fy_playlists_update on public.fy_playlists for update to authenticated
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
drop policy if exists fy_playlists_delete on public.fy_playlists;
create policy fy_playlists_delete on public.fy_playlists for delete to authenticated
  using (public.owns_character(character_id) or (select public.is_admin()));

-- contagem, duração e mosaico só mudam pelo gatilho (o app não escreve neles)
revoke update on public.fy_playlists from authenticated;
grant update (name, description, is_public) on public.fy_playlists to authenticated;

drop policy if exists fy_tracks_select on public.fy_playlist_tracks;
create policy fy_tracks_select on public.fy_playlist_tracks for select to authenticated
  using (public.fy_can_see_playlist(playlist_id));
drop policy if exists fy_tracks_insert on public.fy_playlist_tracks;
create policy fy_tracks_insert on public.fy_playlist_tracks for insert to authenticated
  with check (public.fy_can_edit_playlist(playlist_id) and (added_by is null or public.owns_character(added_by)));
drop policy if exists fy_tracks_update on public.fy_playlist_tracks;
create policy fy_tracks_update on public.fy_playlist_tracks for update to authenticated
  using (public.fy_can_edit_playlist(playlist_id)) with check (public.fy_can_edit_playlist(playlist_id));
drop policy if exists fy_tracks_delete on public.fy_playlist_tracks;
create policy fy_tracks_delete on public.fy_playlist_tracks for delete to authenticated
  using (public.fy_can_edit_playlist(playlist_id) or (select public.is_admin()));

-- colaboradores: o dono convida e tira; o colaborador pode sair sozinho
drop policy if exists fy_collab_select on public.fy_playlist_collaborators;
create policy fy_collab_select on public.fy_playlist_collaborators for select to authenticated
  using (public.fy_can_see_playlist(playlist_id));
drop policy if exists fy_collab_insert on public.fy_playlist_collaborators;
create policy fy_collab_insert on public.fy_playlist_collaborators for insert to authenticated
  with check (public.fy_owns_playlist(playlist_id));
drop policy if exists fy_collab_delete on public.fy_playlist_collaborators;
create policy fy_collab_delete on public.fy_playlist_collaborators for delete to authenticated
  using (public.fy_owns_playlist(playlist_id) or public.owns_character(character_id));

revoke update on public.fy_playlist_tracks from authenticated;
grant update (position) on public.fy_playlist_tracks to authenticated;

drop policy if exists fy_saved_select on public.fy_saved_tracks;
create policy fy_saved_select on public.fy_saved_tracks for select to authenticated
  using ((select public.is_member()));
drop policy if exists fy_saved_insert on public.fy_saved_tracks;
create policy fy_saved_insert on public.fy_saved_tracks for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists fy_saved_delete on public.fy_saved_tracks;
create policy fy_saved_delete on public.fy_saved_tracks for delete to authenticated
  using (public.owns_character(character_id));

drop policy if exists fy_follows_select on public.fy_playlist_follows;
create policy fy_follows_select on public.fy_playlist_follows for select to authenticated
  using ((select public.is_member()));
drop policy if exists fy_follows_insert on public.fy_playlist_follows;
create policy fy_follows_insert on public.fy_playlist_follows for insert to authenticated
  with check (public.owns_character(character_id) and public.fy_can_see_playlist(playlist_id));
drop policy if exists fy_follows_delete on public.fy_playlist_follows;
create policy fy_follows_delete on public.fy_playlist_follows for delete to authenticated
  using (public.owns_character(character_id));

drop policy if exists fy_now_select on public.fy_now_playing;
create policy fy_now_select on public.fy_now_playing for select to authenticated
  using ((select public.is_member()));
drop policy if exists fy_now_insert on public.fy_now_playing;
create policy fy_now_insert on public.fy_now_playing for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists fy_now_update on public.fy_now_playing;
create policy fy_now_update on public.fy_now_playing for update to authenticated
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
drop policy if exists fy_now_delete on public.fy_now_playing;
create policy fy_now_delete on public.fy_now_playing for delete to authenticated
  using (public.owns_character(character_id));

-- ---------------------------------------------------------------------
-- 4. Funções usadas pelo app
-- ---------------------------------------------------------------------

-- Adiciona várias músicas no fim da playlist de uma vez (um álbum, uma seleção)
create or replace function public.fy_add_tracks(p_playlist uuid, p_tracks jsonb, p_added_by uuid default null)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_pos double precision;
  v_n int := 0;
  t jsonb;
begin
  if jsonb_typeof(p_tracks) <> 'array' or jsonb_array_length(p_tracks) > 100 then
    raise exception 'Envie de 1 a 100 músicas por vez';
  end if;
  select coalesce(max(position), 0) into v_pos from public.fy_playlist_tracks where playlist_id = p_playlist;
  for t in select * from jsonb_array_elements(p_tracks) loop
    v_pos := v_pos + 1;
    insert into public.fy_playlist_tracks (playlist_id, position, track_id, title, artist, album, album_id, artwork, duration_ms, explicit, added_by)
    values (
      p_playlist, v_pos, t->>'id', left(coalesce(t->>'title', 'Música'), 200), left(coalesce(t->>'artist', ''), 300),
      left(coalesce(t->>'album', ''), 200), nullif(t->>'album_id', ''), nullif(t->>'artwork', ''),
      greatest(0, least(coalesce((t->>'duration_ms')::int, 0), 14400000)), coalesce((t->>'explicit')::boolean, false), p_added_by
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Quanto o FargusFy ocupa no banco (aparece em Configurações)
create or replace function public.fy_usage()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_member() then jsonb_build_object(
    'playlists', (select count(*) from public.fy_playlists),
    'tracks', (select count(*) from public.fy_playlist_tracks),
    'saved', (select count(*) from public.fy_saved_tracks),
    'bytes', (
      select coalesce(sum(pg_total_relation_size(c.oid)), 0)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'fy\_%'
    ),
    'database_bytes', pg_database_size(current_database())
  ) end;
$$;

grant execute on function public.fy_add_tracks(uuid, jsonb, uuid) to authenticated;
grant execute on function public.fy_usage() to authenticated;
revoke execute on function public.fy_refresh_playlist(uuid) from public, anon, authenticated;

-- =====================================================================
-- 5. Retrospectiva (o "Wrapped" do FargusFy)
--
--    O app soma o tempo tocado de verdade e envia em lotes (uns a cada
--    5 minutos de música). O banco guarda só resumos, nunca cada vez que
--    uma música tocou:
--      fy_listening        uma linha por personagem, mês e música
--                          (até 1.000 músicas diferentes por mês)
--      fy_listening_days   uma linha por personagem e dia
--      fy_listening_hours  uma linha por personagem, mês e hora do dia
--    Um personagem que ouve 300 músicas diferentes por mês ocupa uns
--    100 KB por ano. Todo jogador logado vê a Retrospectiva de todos,
--    mas só o app (pela função fy_log_listening) grava, e só nos
--    personagens do próprio jogador.
-- =====================================================================

create table if not exists public.fy_listening (
  character_id uuid not null references public.characters (id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  track_id     text not null check (track_id ~ '^[A-Za-z0-9]{22}$'),
  title        text not null check (char_length(title) between 1 and 200),
  artist       text not null default '' check (char_length(artist) <= 300),
  artist_id    text check (artist_id is null or artist_id ~ '^[A-Za-z0-9]{22}$'),
  album_id     text check (album_id is null or album_id ~ '^[A-Za-z0-9]{22}$'),
  artwork      text check (artwork is null or (artwork ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$')),
  duration_ms  int not null default 0 check (duration_ms between 0 and 14400000),
  plays        int not null default 0 check (plays >= 0),
  ms           bigint not null default 0 check (ms >= 0),
  primary key (character_id, month, track_id)
);
create index if not exists fy_listening_month_idx on public.fy_listening (month);

create table if not exists public.fy_listening_days (
  character_id uuid not null references public.characters (id) on delete cascade,
  day          date not null,
  ms           bigint not null default 0 check (ms >= 0),
  primary key (character_id, day)
);

create table if not exists public.fy_listening_hours (
  character_id uuid not null references public.characters (id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  hour         smallint not null check (hour between 0 and 23),
  ms           bigint not null default 0 check (ms >= 0),
  primary key (character_id, month, hour)
);

alter table public.fy_listening       enable row level security;
alter table public.fy_listening_days  enable row level security;
alter table public.fy_listening_hours enable row level security;

-- ver: qualquer jogador logado; gravar: só pela função abaixo
drop policy if exists fy_listening_select on public.fy_listening;
create policy fy_listening_select on public.fy_listening for select to authenticated
  using ((select public.is_member()));
drop policy if exists fy_listening_days_select on public.fy_listening_days;
create policy fy_listening_days_select on public.fy_listening_days for select to authenticated
  using ((select public.is_member()));
drop policy if exists fy_listening_hours_select on public.fy_listening_hours;
create policy fy_listening_hours_select on public.fy_listening_hours for select to authenticated
  using ((select public.is_member()));
revoke insert, update, delete on public.fy_listening, public.fy_listening_days, public.fy_listening_hours from anon, authenticated;

-- Recebe um lote do que o personagem ouviu. Cada item:
--   { id, title, artist, artist_id, album_id, artwork, duration_ms, ms, plays, day, hour }
-- day e hour são do relógio do aparelho. Itens estranhos são ignorados
-- (não derrubam o lote inteiro).
create or replace function public.fy_log_listening(p_character uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  v_day date;
  v_month date;
  v_hour int;
  v_ms bigint;
  v_plays int;
  v_id text;
  v_n int := 0;
begin
  if not public.owns_character(p_character) then
    raise exception 'Este personagem não é seu';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'Envie até 200 registros por vez';
  end if;

  for t in select * from jsonb_array_elements(p_items) loop
    begin
      v_id := t->>'id';
      v_day := (t->>'day')::date;
      v_hour := coalesce((t->>'hour')::int, -1);
      v_ms := greatest(0, least(coalesce((t->>'ms')::bigint, 0), 3600000));
      v_plays := greatest(0, least(coalesce((t->>'plays')::int, 0), 50));
    exception when others then
      continue;
    end;
    if v_id is null or v_id !~ '^[A-Za-z0-9]{22}$' then continue; end if;
    if v_day is null or v_day > current_date + 1 or v_day < current_date - 60 then continue; end if;
    if v_ms = 0 and v_plays = 0 then continue; end if;
    v_month := date_trunc('month', v_day)::date;

    if exists (select 1 from public.fy_listening l where l.character_id = p_character and l.month = v_month and l.track_id = v_id)
       or (select count(*) from public.fy_listening l where l.character_id = p_character and l.month = v_month) < 1000 then
      insert into public.fy_listening as l (character_id, month, track_id, title, artist, artist_id, album_id, artwork, duration_ms, plays, ms)
      values (
        p_character, v_month, v_id,
        coalesce(nullif(left(btrim(coalesce(t->>'title', '')), 200), ''), 'Música'),
        left(coalesce(t->>'artist', ''), 300),
        case when t->>'artist_id' ~ '^[A-Za-z0-9]{22}$' then t->>'artist_id' end,
        case when t->>'album_id' ~ '^[A-Za-z0-9]{22}$' then t->>'album_id' end,
        case when t->>'artwork' ~ '^https://i\.scdn\.co/image/[A-Za-z0-9]+$' then t->>'artwork' end,
        case when t->>'duration_ms' ~ '^[0-9]{1,8}$' then least((t->>'duration_ms')::int, 14400000) else 0 end,
        v_plays, v_ms
      )
      on conflict (character_id, month, track_id) do update set
        plays = l.plays + excluded.plays,
        ms = l.ms + excluded.ms,
        title = excluded.title,
        artist = excluded.artist,
        artist_id = coalesce(excluded.artist_id, l.artist_id),
        album_id = coalesce(excluded.album_id, l.album_id),
        artwork = coalesce(excluded.artwork, l.artwork),
        duration_ms = greatest(excluded.duration_ms, l.duration_ms);
    end if;

    if v_ms > 0 then
      insert into public.fy_listening_days as d (character_id, day, ms) values (p_character, v_day, v_ms)
      on conflict (character_id, day) do update set ms = least(d.ms + excluded.ms, 86400000);
      if v_hour between 0 and 23 then
        insert into public.fy_listening_hours as h (character_id, month, hour, ms) values (p_character, v_month, v_hour, v_ms)
        on conflict (character_id, month, hour) do update set ms = least(h.ms + excluded.ms, 31 * 3600000::bigint);
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- A Retrospectiva de um personagem num período [p_from, p_to), contado por
-- mês (as músicas) e por dia (o dia favorito). Devolve tudo já somado, para
-- o app baixar poucos bytes.
create or replace function public.fy_wrapped(p_character uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := date_trunc('month', p_from)::date;
  v_total bigint;
  v_top_artist text;
  v_artist_ms bigint;
  v_result jsonb;
begin
  if not public.is_member() then
    raise exception 'Entre no FargusGram primeiro';
  end if;
  if p_to <= p_from or p_to - p_from > 400 then
    raise exception 'Período inválido';
  end if;

  select coalesce(sum(l.ms), 0) into v_total
  from public.fy_listening l
  where l.character_id = p_character and l.month >= v_from and l.month < p_to;

  select split_part(l.artist, ', ', 1), sum(l.ms) into v_top_artist, v_artist_ms
  from public.fy_listening l
  where l.character_id = p_character and l.month >= v_from and l.month < p_to and l.artist <> ''
  group by 1 order by 2 desc, 1 limit 1;

  select jsonb_build_object(
    'total_ms', v_total,
    'plays', (select coalesce(sum(l.plays), 0) from public.fy_listening l
              where l.character_id = p_character and l.month >= v_from and l.month < p_to),
    'track_count', (select count(distinct l.track_id) from public.fy_listening l
                    where l.character_id = p_character and l.month >= v_from and l.month < p_to),
    'artist_count', (select count(distinct split_part(l.artist, ', ', 1)) from public.fy_listening l
                     where l.character_id = p_character and l.month >= v_from and l.month < p_to and l.artist <> ''),
    'since', (select min(d.day) from public.fy_listening_days d where d.character_id = p_character),
    'top_tracks', coalesce((
      select jsonb_agg(x order by x.plays desc, x.ms desc, x.title) from (
        select l.track_id as id, max(l.title) as title, max(l.artist) as artist, max(l.artwork) as artwork,
               max(l.album_id) as album_id, max(l.duration_ms) as duration_ms,
               sum(l.plays)::int as plays, sum(l.ms)::bigint as ms
        from public.fy_listening l
        where l.character_id = p_character and l.month >= v_from and l.month < p_to
        group by l.track_id
        order by sum(l.plays) desc, sum(l.ms) desc, max(l.title)
        limit 50
      ) x
    ), '[]'::jsonb),
    'top_artists', coalesce((
      select jsonb_agg(x order by x.ms desc, x.name) from (
        select split_part(l.artist, ', ', 1) as name, max(l.artist_id) as artist_id, sum(l.ms)::bigint as ms,
               sum(l.plays)::int as plays, count(distinct l.track_id)::int as tracks,
               (array_agg(l.artwork order by l.ms desc) filter (where l.artwork is not null))[1] as artwork
        from public.fy_listening l
        where l.character_id = p_character and l.month >= v_from and l.month < p_to and l.artist <> ''
        group by 1
        order by sum(l.ms) desc, 1
        limit 10
      ) x
    ), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', x.month, 'ms', x.ms) order by x.month) from (
        select l.month, sum(l.ms)::bigint as ms from public.fy_listening l
        where l.character_id = p_character and l.month >= v_from and l.month < p_to
        group by l.month
      ) x
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', x.hour, 'ms', x.ms) order by x.hour) from (
        select h.hour, sum(h.ms)::bigint as ms from public.fy_listening_hours h
        where h.character_id = p_character and h.month >= v_from and h.month < p_to
        group by h.hour
      ) x
    ), '[]'::jsonb),
    'top_day', (
      select jsonb_build_object('day', d.day, 'ms', d.ms) from public.fy_listening_days d
      where d.character_id = p_character and d.day >= p_from and d.day < p_to
      order by d.ms desc, d.day limit 1
    ),
    'active_days', (select count(*) from public.fy_listening_days d
                    where d.character_id = p_character and d.day >= p_from and d.day < p_to and d.ms > 0),
    -- posição entre os personagens da campanha (minutos no período)
    'campaign', (
      select jsonb_build_object('rank', count(*) filter (where s.ms > v_total) + 1, 'listeners', count(*))
      from (
        select l.character_id, sum(l.ms) as ms from public.fy_listening l
        where l.month >= v_from and l.month < p_to
        group by l.character_id
      ) s
    ),
    -- posição entre quem ouviu o artista nº 1
    'top_artist_fans', case when v_top_artist is null then null else (
      select jsonb_build_object('rank', count(*) filter (where s.ms > v_artist_ms) + 1, 'listeners', count(*))
      from (
        select l.character_id, sum(l.ms) as ms from public.fy_listening l
        where l.month >= v_from and l.month < p_to and split_part(l.artist, ', ', 1) = v_top_artist
        group by l.character_id
      ) s
    ) end
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.fy_log_listening(uuid, jsonb) from public, anon;
revoke execute on function public.fy_wrapped(uuid, date, date) from public, anon;
grant execute on function public.fy_log_listening(uuid, jsonb) to authenticated;
grant execute on function public.fy_wrapped(uuid, date, date) to authenticated;
