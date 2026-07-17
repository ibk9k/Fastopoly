create table users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  total_points integer default 0,
  games_played integer default 0,
  wins integer default 0,
  created_at timestamptz default now()
);

create table game_results (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  user_id uuid references users(id),
  placement integer not null,
  points_earned integer not null,
  bonuses jsonb default '[]',
  created_at timestamptz default now()
);

create table public_rooms (
  id text primary key,
  host_username text not null,
  map_type text not null default 'classic',
  player_count integer default 1,
  max_players integer default 4,
  rules jsonb not null,
  status text default 'waiting',
  created_at timestamptz default now(),
  -- Bumped on room creation and game start; the join list hides rooms stale for hours.
  last_active_at timestamptz default now()
);

-- Migration for existing databases (safe to run repeatedly):
--   alter table public_rooms add column if not exists last_active_at timestamptz default now();
