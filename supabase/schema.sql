-- =====================================================================================
-- Pokémon Master Trainer HEX — schema do Supabase (v2)
-- Rode este arquivo inteiro em: Supabase > SQL Editor > New query > Run.
-- É idempotente (pode rodar de novo sem apagar dados). Não mexe na tabela antiga "accounts".
-- =====================================================================================

-- ---------------------------------------------------------------- perfis
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  trainer_name text not null default 'Treinador',
  avatar       int  not null default 1,
  is_admin     boolean not null default false,
  pokedex      jsonb not null default '[]'::jsonb,   -- espécies capturadas (todas as partidas online)
  vault        jsonb not null default '[]'::jsonb,   -- Cofre: Pokémon guardados entre partidas
  stats        jsonb not null default '{}'::jsonb,
  points       int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles add column if not exists rating int not null default 1000; -- competitivo (Elo)
create index if not exists profiles_points_idx on public.profiles (points desc);
create index if not exists profiles_rating_idx on public.profiles (rating desc);

-- Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, trainer_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'trainer_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- partidas
create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  name       text not null,
  host_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'abandoned')),
  is_public  boolean not null default true,
  has_pin    boolean not null default false,
  options    jsonb not null default '{}'::jsonb,
  lobby      jsonb not null default '[]'::jsonb,
  state      jsonb,
  chat       jsonb not null default '[]'::jsonb,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.matches add column if not exists chat jsonb not null default '[]'::jsonb;
create unique index if not exists matches_code_active_idx on public.matches (code) where status in ('lobby', 'playing');
create index if not exists matches_status_idx on public.matches (status, updated_at desc);

create table if not exists public.match_players (
  match_id  uuid not null references public.matches(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index if not exists match_players_user_idx on public.match_players (user_id);

-- PIN das salas fica numa tabela que o navegador NUNCA consegue ler
create table if not exists public.match_secrets (
  match_id uuid primary key references public.matches(id) on delete cascade,
  pin      text not null
);

-- ---------------------------------------------------------------- configuração
-- O projeto antigo tinha uma game_config com colunas config_key/config_value.
-- Se ela existir nesse formato, é renomeada para game_config_legacy e a nova é criada.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_config' and column_name = 'config_key')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_config' and column_name = 'key') then
    alter table public.game_config rename to game_config_legacy;
    if exists (select 1 from pg_constraint where conname = 'game_config_pkey') then
      alter table public.game_config_legacy rename constraint game_config_pkey to game_config_legacy_pkey;
    end if;
    if exists (select 1 from pg_class where relname = 'game_config_pkey') then
      alter index public.game_config_pkey rename to game_config_legacy_pkey;
    end if;
  end if;
end $$;

create table if not exists public.game_config (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- loja de diamantes
alter table public.profiles add column if not exists diamonds int not null default 0;
alter table public.profiles add column if not exists cosmetics jsonb not null default '{}'::jsonb;

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  package_id    text not null,
  diamonds      int not null,
  amount        numeric(10, 2) not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'credited', 'rejected', 'cancelled', 'expired')),
  provider      text not null default 'mercadopago',
  mp_payment_id text unique,
  created_at    timestamptz not null default now(),
  credited_at   timestamptz
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);

-- Soma/subtrai diamantes de forma atômica (nunca deixa ficar negativo)
create or replace function public.add_diamonds(uid uuid, amount int)
returns int language sql security definer set search_path = public as $$
  update public.profiles set diamonds = diamonds + amount, updated_at = now()
  where id = uid and diamonds + amount >= 0
  returning diamonds;
$$;
revoke execute on function public.add_diamonds(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- economia: ouro da conta + Mercado Global
alter table public.profiles add column if not exists gold int not null default 0;          -- ouro da conta (ganho nas partidas)
alter table public.profiles add column if not exists rev int not null default 0;           -- controle de concorrência da Coleção
alter table public.profiles add column if not exists pokedex_seen jsonb not null default '[]'::jsonb; -- espécies vistas

-- Soma/subtrai ouro e diamantes juntos, de forma atômica (falha se algum ficaria negativo)
create or replace function public.wallet_add(uid uuid, d_diamonds int, d_gold int)
returns table (diamonds int, gold int) language sql security definer set search_path = public as $$
  update public.profiles p set diamonds = p.diamonds + d_diamonds, gold = p.gold + d_gold, updated_at = now()
  where p.id = uid and p.diamonds + d_diamonds >= 0 and p.gold + d_gold >= 0
  returning p.diamonds, p.gold;
$$;
revoke execute on function public.wallet_add(uuid, int, int) from public, anon, authenticated;

create table if not exists public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references auth.users(id) on delete cascade,
  seller_name    text not null default '',
  mon            jsonb not null,
  sp             text not null,
  tier           int  not null default 1,
  lvl            int  not null default 1,
  shiny          boolean not null default false,
  price_gold     int  not null default 0 check (price_gold >= 0),
  price_diamonds int  not null default 0 check (price_diamonds >= 0),
  accept_offers  boolean not null default true,
  status         text not null default 'open' check (status in ('open', 'locked', 'sold', 'cancelled')),
  buyer_id       uuid,
  buyer_name     text,
  sold_gold      int,
  sold_diamonds  int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists market_listings_open_idx on public.market_listings (status, created_at desc);
create index if not exists market_listings_seller_idx on public.market_listings (seller_id, created_at desc);

create table if not exists public.market_offers (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.market_listings(id) on delete cascade,
  seller_id   uuid not null,
  buyer_id    uuid not null references auth.users(id) on delete cascade,
  buyer_name  text not null default '',
  gold        int  not null default 0 check (gold >= 0),
  diamonds    int  not null default 0 check (diamonds >= 0),
  mons        jsonb not null default '[]'::jsonb,
  status      text not null default 'pending' check (status in ('pending', 'locked', 'accepted', 'declined', 'cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists market_offers_listing_idx on public.market_offers (listing_id, status);
create index if not exists market_offers_buyer_idx on public.market_offers (buyer_id, created_at desc);
create index if not exists market_offers_seller_idx on public.market_offers (seller_id, status);

-- ---------------------------------------------------------------- social: online, chat global e amigos
alter table public.profiles add column if not exists last_seen timestamptz;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen desc);

create table if not exists public.global_chat (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default '',
  avatar     int  not null default 1,
  text       text not null check (char_length(text) between 1 and 240),
  created_at timestamptz not null default now()
);
create index if not exists global_chat_user_idx on public.global_chat (user_id, id desc);

create table if not exists public.friendships (
  user_id    uuid not null references auth.users(id) on delete cascade, -- quem pediu
  friend_id  uuid not null references auth.users(id) on delete cascade, -- quem recebeu
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

-- ---------------------------------------------------------------- avisos globais (capturas lendárias/shiny, anúncios)
create table if not exists public.global_feed (
  id         bigserial primary key,
  kind       text not null,
  text       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================================
-- Segurança (RLS). O servidor (funções /api da Vercel) usa a service role e ignora RLS.
-- O navegador usa a anon key e só consegue LER o que as políticas abaixo permitem.
-- Nenhuma escrita direta do navegador: toda jogada passa pelo motor no servidor.
-- =====================================================================================
alter table public.profiles      enable row level security;
alter table public.matches       enable row level security;
alter table public.match_players enable row level security;
alter table public.match_secrets enable row level security;
alter table public.game_config   enable row level security;
alter table public.payments      enable row level security;
alter table public.global_feed   enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_offers   enable row level security;

drop policy if exists "mercado publico" on public.market_listings;
create policy "mercado publico" on public.market_listings for select to authenticated using (true);
drop policy if exists "minhas ofertas" on public.market_offers;
create policy "minhas ofertas" on public.market_offers for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "minhas compras" on public.payments;
create policy "minhas compras" on public.payments for select to authenticated using (user_id = auth.uid());

alter table public.global_chat enable row level security;
alter table public.friendships enable row level security;
drop policy if exists "chat global" on public.global_chat;
create policy "chat global" on public.global_chat for select to authenticated using (true);
drop policy if exists "minhas amizades" on public.friendships;
create policy "minhas amizades" on public.friendships for select to authenticated using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists "feed publico" on public.global_feed;
create policy "feed publico" on public.global_feed for select to anon, authenticated using (true);

drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles for select to authenticated using (true);

-- Função auxiliar (security definer evita recursão de RLS entre matches <-> match_players)
create or replace function public.is_match_member(mid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.match_players where match_id = mid and user_id = auth.uid());
$$;

drop policy if exists "ver partidas" on public.matches;
create policy "ver partidas" on public.matches for select to authenticated
  using ((status = 'lobby' and is_public) or public.is_match_member(id));

drop policy if exists "ver membros" on public.match_players;
create policy "ver membros" on public.match_players for select to authenticated
  using (user_id = auth.uid() or public.is_match_member(match_id));

drop policy if exists "config publica" on public.game_config;
create policy "config publica" on public.game_config for select to anon, authenticated using (true);

-- match_secrets: sem política = ninguém além da service role lê.

-- ---------------------------------------------------------------- Realtime
-- O navegador recebe as mudanças da partida em tempo real (respeitando as políticas acima).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'global_feed'
  ) then
    alter publication supabase_realtime add table public.global_feed;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'global_chat'
  ) then
    alter publication supabase_realtime add table public.global_chat;
  end if;
end $$;

-- ---------------------------------------------------------------- limpeza (opcional)
-- Apaga salas abandonadas/terminadas há mais de 7 dias. Rode manualmente ou agende com pg_cron.
-- delete from public.matches where status in ('finished','abandoned') and updated_at < now() - interval '7 days';
-- delete from public.global_feed where created_at < now() - interval '3 days';

-- ---------------------------------------------------------------- admin
-- Para virar administrador, rode (trocando o e-mail):
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'seu@email.com');

-- Faz a API do Supabase enxergar as colunas/tabelas novas na hora (evita "could not find ... in the schema cache")
notify pgrst, 'reload schema';
