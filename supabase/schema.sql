-- ============================================================
-- Cartothèque — base de données de test (Supabase / PostgreSQL)
-- À coller une seule fois dans Supabase : SQL Editor > New query > Run.
-- Le premier compte créé devient automatiquement administrateur.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profils (un par compte) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text check (pseudo is null or char_length(pseudo) <= 30),
  pub jsonb,                                   -- projection publique : wishlist, cartes à l'échange / en vente, stats
  is_admin boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pub_size check (pub is null or octet_length(pub::text) < 400000)
);
alter table public.profiles enable row level security;
create policy "profils lisibles par les membres" on public.profiles for select to authenticated using (true);
create policy "chacun modifie son profil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (pseudo, pub, updated_at) on public.profiles to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, pseudo, is_admin)
  values (new.id,
          nullif(left(coalesce(new.raw_user_meta_data ->> 'pseudo', ''), 30), ''),
          not exists (select 1 from public.profiles where is_admin));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- données privées (collection, wishlist, classeurs, scellés, réglages) ----------
create table public.user_docs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9.-]{1,40}$'),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, name),
  constraint doc_size check (octet_length(data::text) < 2000000)
);
alter table public.user_docs enable row level security;
create policy "documents strictement privés" on public.user_docs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- échanges ----------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.profiles(id) on delete cascade,      -- auteur de la proposition
  b uuid not null references public.profiles(id) on delete cascade,      -- destinataire
  give jsonb not null default '[]'::jsonb,
  get jsonb not null default '[]'::jsonb,
  kind text not null default 'trade' check (kind in ('trade', 'buy')),
  price numeric(10, 2) not null default 0,
  final_price numeric(10, 2),
  status text not null default 'open' check (status in ('open', 'accepted', 'refused', 'cancelled', 'done')),
  last_by uuid,
  seen jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (a <> b),
  check (jsonb_array_length(give) <= 100 and jsonb_array_length(get) <= 100)
);
create index trades_a on public.trades (a);
create index trades_b on public.trades (b);
alter table public.trades enable row level security;
create policy "participants et modération lisent" on public.trades for select to authenticated
  using (auth.uid() = a or auth.uid() = b or public.is_admin());
create policy "proposer un échange" on public.trades for insert to authenticated
  with check (a = auth.uid() and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.banned));
revoke update, delete on public.trades from anon, authenticated;

create table public.trade_messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  author uuid references public.profiles(id) on delete set null,
  kind text not null default 'msg' check (kind in ('msg', 'event')),
  body text check (body is null or char_length(body) <= 1000),
  status text,
  created_at timestamptz not null default now()
);
create index trade_messages_trade on public.trade_messages (trade_id, created_at);
alter table public.trade_messages enable row level security;
create policy "participants et modération lisent les messages" on public.trade_messages for select to authenticated
  using (exists (select 1 from public.trades t where t.id = trade_id and (auth.uid() = t.a or auth.uid() = t.b or public.is_admin())));
revoke insert, update, delete on public.trade_messages from anon, authenticated;

create table public.sales (
  id bigint generated always as identity primary key,
  card_id text not null,
  price numeric(10, 2) not null check (price > 0),
  condition text,
  trade_id uuid references public.trades(id) on delete set null,
  created_at timestamptz not null default now()
);
create index sales_card on public.sales (card_id, created_at desc);
alter table public.sales enable row level security;
create policy "ventes conclues lisibles" on public.sales for select to authenticated using (true);
revoke insert, update, delete on public.sales from anon, authenticated;

create or replace function public.trades_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.status := 'open';
  new.final_price := null;
  new.last_by := new.a;
  new.seen := jsonb_build_object(new.a::text, (extract(epoch from now()) * 1000)::bigint);
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;
create trigger trades_before_insert before insert on public.trades
  for each row execute function public.trades_before_insert();

create or replace function public.trades_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trade_messages (trade_id, author, kind, status) values (new.id, new.a, 'event', 'open');
  return new;
end $$;
create trigger trades_after_insert after insert on public.trades
  for each row execute function public.trades_after_insert();

create or replace function public.post_trade_message(p_trade uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.trades;
  me uuid := auth.uid();
begin
  select * into t from public.trades where id = p_trade;
  if t.id is null or me is null or (me <> t.a and me <> t.b) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  if t.status in ('refused', 'cancelled') then raise exception 'trade closed' using errcode = '22023'; end if;
  if coalesce(trim(p_body), '') = '' then return; end if;
  insert into public.trade_messages (trade_id, author, kind, body) values (p_trade, me, 'msg', left(p_body, 1000));
  update public.trades
     set updated_at = now(), last_by = me,
         seen = seen || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint)
   where id = p_trade;
end $$;

create or replace function public.set_trade_status(p_trade uuid, p_status text, p_final_price numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.trades;
  me uuid := auth.uid();
  allowed boolean;
  v_final numeric;
begin
  select * into t from public.trades where id = p_trade for update;
  if t.id is null or me is null or (me <> t.a and me <> t.b) then
    raise exception 'not a participant' using errcode = '42501';
  end if;
  allowed := case
    when p_status in ('accepted', 'refused') then t.status = 'open' and me = t.b
    when p_status = 'cancelled' then (t.status = 'open' and me = t.a) or t.status = 'accepted'
    when p_status = 'done' then t.status = 'accepted'
    else false
  end;
  if not allowed then raise exception 'transition not allowed' using errcode = '22023'; end if;
  v_final := case when p_status = 'done' then coalesce(p_final_price, nullif(t.price, 0)) else t.final_price end;
  update public.trades
     set status = p_status, final_price = v_final, updated_at = now(), last_by = me,
         seen = seen || jsonb_build_object(me::text, (extract(epoch from now()) * 1000)::bigint)
   where id = p_trade;
  insert into public.trade_messages (trade_id, author, kind, status) values (p_trade, me, 'event', p_status);
  if p_status = 'done' and t.kind = 'buy' and jsonb_array_length(t."get") = 1 and coalesce(v_final, 0) > 0 then
    insert into public.sales (card_id, price, condition, trade_id) values (t."get" -> 0 ->> 'c', v_final, 'NM', t.id);
  end if;
end $$;

create or replace function public.mark_trade_seen(p_trade uuid) returns void
language sql security definer set search_path = '' as $$
  update public.trades
     set seen = seen || jsonb_build_object(auth.uid()::text, (extract(epoch from now()) * 1000)::bigint)
   where id = p_trade and (auth.uid() = a or auth.uid() = b);
$$;

-- ---------- signalements ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid default auth.uid() references public.profiles(id) on delete set null,
  target uuid references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  context jsonb not null default '{}'::jsonb,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy "signaler" on public.reports for insert to authenticated with check (reporter = auth.uid());
create policy "voir ses signalements ou modérer" on public.reports for select to authenticated using (reporter = auth.uid() or public.is_admin());
create policy "traiter un signalement" on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke delete on public.reports from anon, authenticated;

-- ---------- réglages de l'application ----------
create table public.app_config (
  id int primary key default 1 check (id = 1),
  scan_quota int not null default 20 check (scan_quota > 0),
  enforce_quota boolean not null default false,
  banner text not null default '' check (char_length(banner) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.app_config (id) values (1);
alter table public.app_config enable row level security;
create policy "réglages lisibles" on public.app_config for select to anon, authenticated using (true);
create policy "réglages administrateur" on public.app_config for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.app_config from anon, authenticated;

-- ---------- corrections du catalogue (avec historique) ----------
create table public.catalog_overrides (
  card_id text primary key,
  name text,
  rarity text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.catalog_overrides enable row level security;
create policy "corrections lisibles" on public.catalog_overrides for select to anon, authenticated using (true);
create policy "corrections administrateur" on public.catalog_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.catalog_log (
  id bigint generated always as identity primary key,
  card_id text not null,
  before jsonb,
  after jsonb,
  note text,
  author uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.catalog_log enable row level security;
create policy "journal administrateur" on public.catalog_log for select to authenticated using (public.is_admin());
create policy "journaliser" on public.catalog_log for insert to authenticated with check (public.is_admin());

-- ---------- scanner : quota et anti-abus ----------
create table public.scan_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index scan_log_user on public.scan_log (user_id, created_at);
alter table public.scan_log enable row level security;
create policy "mes scans" on public.scan_log for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.scan_log from anon, authenticated;

create or replace function public.register_scan() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  used int;
  recent int;
  cfg public.app_config;
begin
  if me is null then return jsonb_build_object('allowed', false, 'reason', 'auth'); end if;
  if exists (select 1 from public.profiles where id = me and banned) then
    return jsonb_build_object('allowed', false, 'reason', 'banned');
  end if;
  select * into cfg from public.app_config where id = 1;
  select count(*) into used from public.scan_log where user_id = me and created_at >= date_trunc('month', now());
  if cfg.enforce_quota and used >= cfg.scan_quota then
    return jsonb_build_object('allowed', false, 'reason', 'quota', 'used', used, 'quota', cfg.scan_quota);
  end if;
  select count(*) into recent from public.scan_log where user_id = me and created_at > now() - interval '10 minutes';
  if recent >= 40 then return jsonb_build_object('allowed', false, 'reason', 'rate'); end if;
  insert into public.scan_log (user_id) values (me);
  return jsonb_build_object('allowed', true, 'used', used + 1, 'quota', cfg.scan_quota);
end $$;

-- ---------- modération et suppression de compte ----------
create or replace function public.admin_moderate(p_user uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_action = 'ban' then
    update public.profiles set banned = true where id = p_user;
  elsif p_action = 'unban' then
    update public.profiles set banned = false where id = p_user;
  elsif p_action = 'hide_listings' then
    update public.profiles
       set pub = coalesce(pub, '{}'::jsonb) || jsonb_build_object('sell', '{}'::jsonb, 'sellIds', '[]'::jsonb, 'trade', '{}'::jsonb, 'tradeIds', '[]'::jsonb)
     where id = p_user;
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- temps réel pour les échanges ----------
alter publication supabase_realtime add table public.trades, public.trade_messages;
