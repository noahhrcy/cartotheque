-- Cartothèque — © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés (voir LICENSE).
-- ============================================================
-- Cartothèque — confiance et lutte contre la fraude (à exécuter une fois, après schema.sql)
-- Supabase : SQL Editor > New query > coller ce fichier > Run.
--   - confirmation de réception par les deux membres avant qu'un échange soit conclu
--   - litiges (signalés automatiquement à la modération)
--   - avis après un échange conclu, réputation publique
--   - limites anti-spam (propositions et messages), plus strictes pour les comptes récents
--   - photos de preuve des annonces (stockage Supabase, dossier personnel)
-- ============================================================

-- ---------- échanges : réception confirmée par chacun, litige ----------
alter table public.trades add column if not exists received jsonb not null default '{}'::jsonb;
alter table public.trades drop constraint if exists trades_status_check;
alter table public.trades add constraint trades_status_check
  check (status in ('open', 'accepted', 'refused', 'cancelled', 'done', 'disputed'));

create or replace function public.set_trade_status(p_trade uuid, p_status text, p_final_price numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.trades;
  me uuid := auth.uid();
  allowed boolean;
begin
  select * into t from public.trades where id = p_trade for update;
  if t.id is null or me is null or (me <> t.a and me <> t.b) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  allowed := case
    when p_status in ('accepted', 'refused') then t.status = 'open' and me = t.b
    when p_status = 'cancelled' then (t.status = 'open' and me = t.a) or (t.status = 'accepted' and t.received = '{}'::jsonb)
    else false                                  -- « conclu » passe par confirm_received, « litige » par open_dispute
  end;
  if not allowed then raise exception 'transition not allowed' using errcode = '22023'; end if;
  update public.trades
     set status = p_status,
         final_price = case when p_status = 'accepted' then coalesce(p_final_price, final_price) else final_price end,
         updated_at = now(), last_by = me,
         seen = seen || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint)
   where id = p_trade;
  insert into public.trade_messages (trade_id, author, kind, status) values (p_trade, me, 'event', p_status);
end $$;

create or replace function public.confirm_received(p_trade uuid, p_final_price numeric default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  t public.trades;
  me uuid := auth.uid();
  rec jsonb;
  v_final numeric;
begin
  select * into t from public.trades where id = p_trade for update;
  if t.id is null or me is null or (me <> t.a and me <> t.b) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if t.status <> 'accepted' then raise exception 'trade not accepted' using errcode = '22023'; end if;
  rec := t.received || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint);
  v_final := coalesce(p_final_price, t.final_price, nullif(t.price, 0));
  if rec ? t.a::text and rec ? t.b::text then
    update public.trades
       set received = rec, status = 'done', final_price = v_final, updated_at = now(), last_by = me,
           seen = seen || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint)
     where id = p_trade;
    insert into public.trade_messages (trade_id, author, kind, status) values (p_trade, me, 'event', 'received');
    insert into public.trade_messages (trade_id, author, kind, status) values (p_trade, me, 'event', 'done');
    if t.kind = 'buy' and jsonb_array_length(t."get") = 1 and coalesce(v_final, 0) > 0 then
      insert into public.sales (card_id, price, condition, trade_id) values (t."get" -> 0 ->> 'c', v_final, 'NM', t.id);
    end if;
    return 'done';
  end if;
  update public.trades
     set received = rec, final_price = v_final, updated_at = now(), last_by = me,
         seen = seen || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint)
   where id = p_trade;
  insert into public.trade_messages (trade_id, author, kind, status) values (p_trade, me, 'event', 'received');
  return 'waiting';
end $$;

create or replace function public.open_dispute(p_trade uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.trades;
  me uuid := auth.uid();
  other uuid;
begin
  select * into t from public.trades where id = p_trade for update;
  if t.id is null or me is null or (me <> t.a and me <> t.b) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if t.status not in ('accepted', 'done') then raise exception 'nothing to dispute' using errcode = '22023'; end if;
  other := case when me = t.a then t.b else t.a end;
  update public.trades
     set status = 'disputed', updated_at = now(), last_by = me,
         seen = seen || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint)
   where id = p_trade;
  insert into public.trade_messages (trade_id, author, kind, status, body) values (p_trade, me, 'event', 'disputed', left(coalesce(p_reason, ''), 500));
  insert into public.reports (reporter, target, reason, context)
  values (me, other, left('Litige : ' || coalesce(nullif(trim(p_reason), ''), 'sans précision'), 500), jsonb_build_object('trade', p_trade, 'dispute', true));
end $$;

-- ---------- avis après un échange conclu ----------
create table if not exists public.trade_reviews (
  id bigint generated always as identity primary key,
  trade_id uuid not null references public.trades(id) on delete cascade,
  author uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating in (-1, 0, 1)),
  comment text check (comment is null or char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (trade_id, author)
);
create index if not exists trade_reviews_target on public.trade_reviews (target);
alter table public.trade_reviews enable row level security;
drop policy if exists "avis lisibles" on public.trade_reviews;
create policy "avis lisibles" on public.trade_reviews for select to authenticated using (true);
drop policy if exists "noter après un échange conclu" on public.trade_reviews;
create policy "noter après un échange conclu" on public.trade_reviews for insert to authenticated
  with check (
    author = auth.uid()
    and exists (
      select 1 from public.trades t
       where t.id = trade_id and t.status = 'done'
         and ((t.a = auth.uid() and target = t.b) or (t.b = auth.uid() and target = t.a))
    )
  );
revoke update, delete on public.trade_reviews from anon, authenticated;

-- réputation publique : uniquement des agrégats, jamais le détail des échanges
create or replace function public.member_trust(p_ids uuid[]) returns table (
  id uuid, member_since timestamptz, done_trades int, disputes int, positive int, neutral int, negative int
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.created_at,
         (select count(*)::int from public.trades t where t.status = 'done' and (t.a = p.id or t.b = p.id)),
         (select count(*)::int from public.trades t where t.status = 'disputed' and (t.a = p.id or t.b = p.id)),
         (select count(*)::int from public.trade_reviews r where r.target = p.id and r.rating = 1),
         (select count(*)::int from public.trade_reviews r where r.target = p.id and r.rating = 0),
         (select count(*)::int from public.trade_reviews r where r.target = p.id and r.rating = -1)
    from public.profiles p
   where p.id = any(p_ids) and auth.uid() is not null;
$$;

-- ---------- limites anti-spam ----------
create or replace function public.trades_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent int;
  young boolean;
  max_per_day int;
begin
  select count(*) into recent from public.trades where a = new.a and created_at > now() - interval '24 hours';
  select created_at > now() - interval '7 days' into young from public.profiles where id = new.a;
  -- PL/pgSQL coupe une condition « if » au premier « then » : la limite est calculée à part
  max_per_day := case when young then 8 else 40 end;
  if recent >= max_per_day then
    raise exception 'too many proposals today' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists trades_rate_limit on public.trades;
create trigger trades_rate_limit before insert on public.trades for each row execute function public.trades_rate_limit();

create or replace function public.post_trade_message(p_trade uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.trades;
  me uuid := auth.uid();
  recent int;
begin
  select * into t from public.trades where id = p_trade;
  if t.id is null or me is null or (me <> t.a and me <> t.b) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if t.status in ('refused', 'cancelled') then raise exception 'trade closed' using errcode = '22023'; end if;
  if coalesce(trim(p_body), '') = '' then return; end if;
  select count(*) into recent from public.trade_messages where author = me and kind = 'msg' and created_at > now() - interval '10 minutes';
  if recent >= 30 then raise exception 'too many messages' using errcode = '54000'; end if;
  insert into public.trade_messages (trade_id, author, kind, body) values (p_trade, me, 'msg', left(p_body, 1000));
  update public.trades
     set updated_at = now(), last_by = me,
         seen = seen || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint)
   where id = p_trade;
end $$;

-- ---------- photos de preuve des annonces ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "preuves : déposer dans son dossier" on storage.objects;
create policy "preuves : déposer dans son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "preuves : supprimer les siennes" on storage.objects;
create policy "preuves : supprimer les siennes" on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
