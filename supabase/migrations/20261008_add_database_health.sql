-- A public health probe exposes only a constant response, never account data.
begin;
create or replace function public.gridline_health()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select 'ok'::text; $$;

revoke all on function public.gridline_health() from public;
grant execute on function public.gridline_health() to anon, authenticated;
notify pgrst, 'reload schema';
commit;
