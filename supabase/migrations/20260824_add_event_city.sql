-- Add verified metro city to cached events and saved events.
-- Run this in the Supabase SQL Editor before deploying code that writes normalized_city.
-- search_cache.city remains the preferred-area string for backward compatibility.

alter table events
  add column if not exists normalized_city text;

alter table events
  drop constraint if exists events_normalized_city_check;
alter table events
  add constraint events_normalized_city_check
  check (normalized_city in ('mumbai', 'navi_mumbai', 'thane'));

create index if not exists events_month_year_hobby_city_idx
  on events (month, year, hobby, normalized_city);

alter table saved_events
  add column if not exists normalized_city text,
  add column if not exists venue text;

alter table saved_events
  drop constraint if exists saved_events_normalized_city_check;
alter table saved_events
  add constraint saved_events_normalized_city_check
  check (normalized_city is null or normalized_city in ('mumbai', 'navi_mumbai', 'thane'));

-- Derived search cache only. Do not truncate saved_events or user_preferences.
truncate table search_cache;
delete from events where normalized_city is null;
