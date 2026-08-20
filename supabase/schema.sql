-- HobbyMap Supabase schema
-- Run once in Supabase SQL Editor

create table if not exists events (
  url text not null,
  month int not null,
  year int not null,
  name text not null,
  venue text,
  platform text,
  days jsonb not null default '[]',
  time text,
  price text,
  hobby text,
  enrich_tier text,
  event_payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (url, month, year)
);

create table if not exists search_cache (
  cache_key text primary key,
  hobbies jsonb not null,
  city text not null default 'Mumbai',
  month int not null,
  year int not null,
  event_urls jsonb not null default '[]',
  refreshed_at timestamptz not null default now()
);

create table if not exists event_changelog (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  event_name text,
  old_days jsonb,
  new_days jsonb,
  month int,
  year int,
  detected_at timestamptz not null default now()
);

create index if not exists event_changelog_detected_at_idx
  on event_changelog (detected_at desc);

create index if not exists search_cache_refreshed_at_idx
  on search_cache (refreshed_at);

-- User account tables (optional accounts feature)

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hobbies jsonb not null default '[]',
  city text not null default 'Mumbai',
  default_month int,
  default_year int,
  updated_at timestamptz not null default now()
);

create table if not exists saved_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_url text not null,
  month int not null,
  year int not null,
  status text not null default 'interested',
  event_name text,
  platform text,
  created_at timestamptz not null default now(),
  unique (user_id, event_url, month, year)
);

-- If saved_events already exists without name/platform, run:
-- alter table saved_events add column if not exists event_name text;
-- alter table saved_events add column if not exists platform text;

create index if not exists saved_events_user_id_idx
  on saved_events (user_id, created_at desc);

alter table profiles enable row level security;
alter table user_preferences enable row level security;
alter table saved_events enable row level security;

create policy "Users read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users read own preferences"
  on user_preferences for select
  using (auth.uid() = user_id);

create policy "Users insert own preferences"
  on user_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users update own preferences"
  on user_preferences for update
  using (auth.uid() = user_id);

create policy "Users read own saved events"
  on saved_events for select
  using (auth.uid() = user_id);

create policy "Users insert own saved events"
  on saved_events for insert
  with check (auth.uid() = user_id);

create policy "Users delete own saved events"
  on saved_events for delete
  using (auth.uid() = user_id);
