-- Tip Tap Games — Postgres schema (Supabase).
-- The app currently persists everything client-side; apply this and set
-- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to move accounts,
-- scores, signals, published games and DMs server-side.
-- lib/accounts.ts, lib/storage.ts, lib/library.ts and lib/social.ts are the
-- four swap points; every call site above them stays as it is.
--
-- On a real backend, passwords are Supabase Auth's problem, not ours: map a
-- player row to auth.users(id) and drop the local password columns entirely.

create table players (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  display_name text not null default '',
  bio text not null default '',
  avatar_hue smallint not null default 210,
  xp integer not null default 0,
  provider text check (provider in ('google','discord','guest','local')) not null,
  device_id text,
  created_at timestamptz default now()
);

create table follows (
  follower_id uuid references players(id) on delete cascade,
  followee_id uuid references players(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table games (
  slug text primary key,
  title text not null,
  rule_text text not null,
  tags text[] not null default '{}',
  intensity real not null,
  luck real not null,
  nostalgia real not null,
  session_length real not null,
  score_unit text not null default 'pts',
  max_score_per_second real not null,
  is_active boolean not null default true
);

-- Player-made games. A spec never carries code: it names one of our engines
-- and restyles it, so publishing is safe by construction and the base slug is
-- constrained to the built-in catalog.
create table player_games (
  slug text primary key,
  author_id uuid references players(id) on delete cascade,
  base_slug text references games(slug) not null,
  title text not null,
  rule_text text not null,
  description text not null default '',
  history text not null default '',
  accent text not null check (accent ~ '^#[0-9a-fA-F]{6}$'),
  tags text[] not null default '{}',
  intensity real not null default 0.5,
  luck real not null default 0.3,
  nostalgia real not null default 0.2,
  source text check (source in ('ai','studio','import')) not null default 'studio',
  created_at timestamptz default now()
);
create index on player_games (author_id, created_at desc);

create table scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  game_slug text not null,
  score integer not null check (score >= 0),
  duration_ms integer not null,
  created_at timestamptz default now()
);
create index on scores (game_slug, score desc);
create index on scores (player_id, game_slug, score desc);

create table player_signals (
  player_id uuid references players(id) on delete cascade,
  game_slug text not null,
  dwell_ms bigint default 0,
  runs integer default 0,
  fast_swipes integer default 0,
  replays integer default 0,
  primary key (player_id, game_slug)
);

create table algorithm_prefs (
  player_id uuid primary key references players(id) on delete cascade,
  vector jsonb not null,
  updated_at timestamptz default now()
);

-- ---- direct messages ----

create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table conversation_members (
  conversation_id uuid references conversations(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (conversation_id, player_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references players(id) on delete cascade,
  body text not null default '',
  -- a message can carry a playable card; the client queues it as the next one
  game_slug text,
  created_at timestamptz default now(),
  check (body <> '' or game_slug is not null)
);
create index on messages (conversation_id, created_at);

-- anti-cheat: a score is only accepted against an open, unconsumed run
create table runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id),
  game_slug text not null,
  nonce text not null,
  started_at timestamptz default now(),
  consumed boolean default false
);
