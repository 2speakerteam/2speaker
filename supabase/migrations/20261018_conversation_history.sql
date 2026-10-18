-- Per-account storage. Browser/site-data clearing cannot remove these rows.
begin;

create table if not exists public.conversation_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  stream text not null check (stream in ('guide_ai', 'guide_translation', 'roadview_ai', 'roadview_translation')),
  message_id text not null check (message_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 120000),
  sort_key bigint not null check (sort_key between 0 and 9007199254740991),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, stream, message_id)
);

alter table public.conversation_events enable row level security;
revoke all on public.conversation_events from public, anon, authenticated;
grant select, insert, update on public.conversation_events to authenticated;

create policy "Read own conversation history" on public.conversation_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own conversation history" on public.conversation_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own conversation history" on public.conversation_events
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.save_conversation_events(events jsonb)
returns setof public.conversation_events
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 50 then
    raise exception 'Invalid conversation batch' using errcode = '22023';
  end if;
  return query
    insert into public.conversation_events as saved
      (user_id, stream, message_id, payload, sort_key, deleted_at)
    select auth.uid(), e->>'stream', e->>'message_id',
      case when coalesce((e->>'deleted')::boolean, false) then '{}'::jsonb else e->'payload' end,
      (e->>'sort_key')::bigint,
      case when coalesce((e->>'deleted')::boolean, false) then now() else null end
    from jsonb_array_elements(events) e
    on conflict (user_id, stream, message_id) do update set
      payload = case when saved.deleted_at is not null or excluded.deleted_at is not null
        then '{}'::jsonb else excluded.payload end,
      deleted_at = coalesce(saved.deleted_at, excluded.deleted_at),
      updated_at = now()
    returning saved.*;
end;
$$;

revoke all on function public.save_conversation_events(jsonb) from public, anon;
grant execute on function public.save_conversation_events(jsonb) to authenticated;

commit;
