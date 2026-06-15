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
