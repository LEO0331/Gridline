-- Apply before releasing the expanded account watchlist UI. Existing rows and RLS are preserved.
begin;
alter table public.user_preferences drop constraint if exists user_preferences_watchlist_check;
alter table public.user_preferences add constraint user_preferences_watchlist_check
  check (watchlist <@ array['NBIS','CRWV','ORCL','AVGO','APLD','IREN','CIFR','CORZ','GDS','VNET','EQIX','DLR','IRM','VRT','ETN','ANET','PWR','GEV','CEG','BE']::text[]);
commit;
