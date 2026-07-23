-- Fastopoly schema. Applied to the live project via Supabase migrations:
--   public_rooms_last_active_and_rls, accounts_profiles_and_stats,
--   restrict_handle_new_user_execute
-- Kept here as the source-of-truth reference.

-- ── Profiles ────────────────────────────────────────────────────────────────
-- One row per Supabase auth user, created automatically by the trigger below.
-- Anonymous (guest) sign-ins get a profile too, so guests and full accounts share
-- one stats pipeline and a guest can upgrade to Google/email without losing history.
-- Display names are intentionally NOT unique (a unique constraint would fail OAuth
-- signups on collision); the auth uid is the identity.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  is_guest boolean not null default false,
  total_points integer not null default 0,
  games_played integer not null default 0,
  wins integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_total_points_idx on public.profiles (total_points desc);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create the profile on signup, pulling name/avatar from the OAuth provider
-- when present, falling back through guest metadata -> email local-part -> 'Player'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url, is_guest)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger-only function: must not be callable as a PostgREST RPC.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ── Game history ────────────────────────────────────────────────────────────
create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  placement integer not null,
  points_earned integer not null,
  bonuses jsonb default '[]',
  created_at timestamptz default now()
);

alter table public.game_results enable row level security;

create policy "Game results are viewable by everyone"
  on public.game_results for select using (true);

-- ── Lobby directory ─────────────────────────────────────────────────────────
create table public.public_rooms (
  id text primary key,
  host_username text not null,
  map_type text not null default 'classic',
  player_count integer default 1,
  max_players integer default 4,
  rules jsonb not null,
  status text default 'waiting',
  created_at timestamptz default now(),
  -- Bumped on room creation and game start; the join list hides rooms stale for hours.
  last_active_at timestamptz not null default now()
);

create index public_rooms_status_last_active_idx
  on public.public_rooms (status, last_active_at desc);

alter table public.public_rooms enable row level security;

create policy "Public rooms are viewable by everyone"
  on public.public_rooms for select using (true);

-- NOTE: no insert/update/delete policies anywhere. Every write goes through the
-- server's service-role key, which bypasses RLS. Reads are public so the browser
-- (anon key) can render the lobby list, leaderboard, and profiles.
