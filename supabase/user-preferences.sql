create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en' check (language in ('en','zh-TW')),
  weight integer not null default 100 check (weight between 40 and 130),
  watchlist text[] not null default '{}' constraint user_preferences_watchlist_check check (watchlist <@ array['NBIS','CRWV','ORCL','AVGO','APLD','IREN','CIFR','CORZ','GDS','VNET','EQIX','DLR','IRM','VRT','ETN','ANET','PWR','GEV','CEG','BE']::text[])
);

alter table public.user_preferences enable row level security;

revoke all on public.user_preferences from anon;
grant select, insert, update, delete on public.user_preferences to authenticated;

drop policy if exists "Own preferences only" on public.user_preferences;
create policy "Own preferences only" on public.user_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
