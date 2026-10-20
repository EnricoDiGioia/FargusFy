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

create or replace function public.fy_can_see_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fy_playlists p
    where p.id = p_playlist
      and public.is_member()
      and (p.is_public or public.owns_character(p.character_id) or public.is_admin())
  );
$$;

create or replace function public.fy_owns_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fy_playlists p
    where p.id = p_playlist and public.owns_character(p.character_id)
  );
$$;

drop policy if exists fy_playlists_select on public.fy_playlists;
create policy fy_playlists_select on public.fy_playlists for select to authenticated
  using ((select public.is_member()) and (is_public or public.owns_character(character_id) or (select public.is_admin())));
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
  with check (public.fy_owns_playlist(playlist_id) and (added_by is null or public.owns_character(added_by)));
drop policy if exists fy_tracks_update on public.fy_playlist_tracks;
create policy fy_tracks_update on public.fy_playlist_tracks for update to authenticated
  using (public.fy_owns_playlist(playlist_id)) with check (public.fy_owns_playlist(playlist_id));
drop policy if exists fy_tracks_delete on public.fy_playlist_tracks;
create policy fy_tracks_delete on public.fy_playlist_tracks for delete to authenticated
  using (public.fy_owns_playlist(playlist_id) or (select public.is_admin()));

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
