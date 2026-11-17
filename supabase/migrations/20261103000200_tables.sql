-- =====================================================================
-- テーブル（情報設計書 7章）
-- 型の決めごと：id は uuid、*_at は timestamptz、金額と枚数は integer、
-- 列挙の値は text ＋ check 制約。注文・明細・返金・同意・監査ログは物理削除しない。
-- =====================================================================

-- 学校・園 -------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  kind text not null check (kind in ('preschool', 'elementary')),
  address text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 年度ごとの学年・クラス ----------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  grade_label text not null check (length(btrim(grade_label)) > 0),
  grade_order integer not null default 0,
  name text not null check (length(btrim(name)) > 0),
  capacity integer not null default 0 check (capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, fiscal_year, grade_label, name)
);
create index classes_school_year_idx on public.classes (school_id, fiscal_year);

-- お子さま -------------------------------------------------------------
create table public.children (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  full_name_kana text not null check (length(btrim(full_name_kana)) > 0),
  -- 照合用に正規化したふりがな（9.9）。full_name_kana から自動で作る
  name_key text generated always as (public.kana_name_key(full_name_kana)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index children_name_key_idx on public.children (name_key);

-- 登録コード（9.8） ----------------------------------------------------
create sequence public.registration_code_serial_seq;

create table public.registration_codes (
  id uuid primary key default gen_random_uuid(),
  -- Crockford Base32 の12文字（0〜9と、I・L・O・U を除く英大文字）。ハイフンなしで持つ
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{12}$'),
  serial_no bigint not null unique default nextval('public.registration_code_serial_seq'),
  class_id uuid not null references public.classes (id),
  child_id uuid references public.children (id),
  status text not null default 'unused' check (status in ('unused', 'active', 'revoked')),
  purpose text not null default 'normal' check (purpose in ('normal', 'spare', 'review')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  replaced_by uuid references public.registration_codes (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (status <> 'active' or child_id is not null)
);
create index registration_codes_class_idx on public.registration_codes (class_id);
create index registration_codes_child_idx on public.registration_codes (child_id);

-- 年度ごとの在籍 ------------------------------------------------------
create table public.child_enrollments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id),
  fiscal_year integer not null,
  class_id uuid not null references public.classes (id),
  registration_code_id uuid references public.registration_codes (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, fiscal_year)
);
create index child_enrollments_class_idx on public.child_enrollments (class_id);

-- 会員 -------------------------------------------------------------------
create table public.members (
  id uuid primary key references auth.users (id),
  email text not null,
  full_name text not null check (length(btrim(full_name)) > 0),
  full_name_kana text not null check (length(btrim(full_name_kana)) > 0),
  phone text,
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{3}-?[0-9]{4}$'),
  address text,
  marketing_opt_in boolean not null default false,
  email_status text not null default 'ok' check (email_status in ('ok', 'bounced', 'complained')),
  email_status_at timestamptz,
  stripe_customer_id text unique,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_email_idx on public.members (lower(email));

-- 会員とお子さまの年度ごとのつながり ------------------------------------
create table public.member_children (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  child_id uuid not null references public.children (id),
  fiscal_year integer not null,
  registration_code_id uuid references public.registration_codes (id),
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid
);
create unique index member_children_active_uniq
  on public.member_children (member_id, child_id, fiscal_year)
  where revoked_at is null;
create index member_children_child_year_idx on public.member_children (child_id, fiscal_year);
create index member_children_member_idx on public.member_children (member_id);

-- お知らせの同意の記録（追記のみ） --------------------------------------
create table public.marketing_consents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  action text not null check (action in ('grant', 'revoke')),
  -- signup / settings / unsubscribe_link / complaint / withdrawal / admin
  source text not null,
  wording_version text,
  created_at timestamptz not null default now()
);
create index marketing_consents_member_idx on public.marketing_consents (member_id, created_at);

-- 行事 -------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  name text not null check (length(btrim(name)) > 0),
  held_on date,
  sale_starts_at timestamptz not null,
  deadline_at timestamptz not null,
  delivery_method text not null check (delivery_method in ('school', 'mail', 'either')),
  shipping_fee integer check (shipping_fee is null or shipping_fee >= 0),
  delivery_note text,
  late_enabled boolean not null default false,
  late_until timestamptz,
  late_delivery_note text,
  jacket_image_path text,
  contents text,
  status text not null default 'draft' check (status in ('draft', 'published', 'canceled')),
  sale_start_notified_at timestamptz,
  production_fixed_at timestamptz,
  late_production_fixed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline_at > sale_starts_at),
  check (not late_enabled or (late_until is not null and late_until > deadline_at)),
  check ((status = 'canceled') = (canceled_at is not null))
);
create index events_status_start_idx on public.events (status, sale_starts_at);
create index events_school_year_idx on public.events (school_id, fiscal_year);

-- 行事の対象クラス（学年で選んだらその学年の全クラスを入れる） ---------
create table public.event_targets (
  event_id uuid not null references public.events (id) on delete cascade,
  class_id uuid not null references public.classes (id),
  primary key (event_id, class_id)
);
create index event_targets_class_idx on public.event_targets (class_id);

-- 締切の延長の履歴 ------------------------------------------------------
create table public.event_deadline_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  old_deadline_at timestamptz not null,
  new_deadline_at timestamptz not null,
  notify boolean not null default false,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index event_deadline_changes_event_idx on public.event_deadline_changes (event_id);

-- 商品 -------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('disc', 'data')),
  media text not null check (media in ('dvd', 'bluray', 'photo_data')),
  name text not null check (length(btrim(name)) > 0),
  price integer not null check (price > 0),
  second_price integer check (second_price is null or second_price > 0),
  late_price integer check (late_price is null or late_price > 0),
  status text not null default 'on_sale' check (status in ('on_sale', 'canceled')),
  sort_order integer not null default 0,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'disc' and media in ('dvd', 'bluray')) or (kind = 'data' and media = 'photo_data')),
  check ((status = 'canceled') = (canceled_at is not null))
);
create index products_event_idx on public.products (event_id);

-- 商品の対象クラス（行がない商品は、行事の対象と同じ） ------------------
create table public.product_targets (
  product_id uuid not null references public.products (id) on delete cascade,
  class_id uuid not null references public.classes (id),
  primary key (product_id, class_id)
);

-- 注文 -------------------------------------------------------------------
create sequence public.order_no_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- 人が読む注文番号：T＋7桁（案）
  order_no text not null unique
    default ('T' || lpad(nextval('public.order_no_seq')::text, 7, '0')),
  event_id uuid not null references public.events (id),
  member_id uuid references public.members (id),
  channel text not null check (channel in ('web', 'proxy')),
  is_late boolean not null default false,
  delivery_method text not null check (delivery_method in ('school', 'mail')),
  ship_name text,
  ship_postal_code text,
  ship_address text,
  ship_phone text,
  buyer_name text,
  buyer_kana text,
  buyer_phone text,
  buyer_email text,
  payment_method text not null
    check (payment_method in ('card', 'konbini', 'paypay', 'bank_transfer', 'cash')),
  payment_status text not null default 'draft'
    check (payment_status in ('draft', 'pending', 'paid', 'partially_refunded', 'refunded', 'canceled')),
  -- 今の内容（明細の取り消し後は計算し直した値）
  subtotal integer not null check (subtotal >= 0),
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  total integer not null check (total >= 0),
  -- 支払われた金額（paid になった時点の total）。paid_amount − 返金 ＝ total
  paid_amount integer check (paid_amount is null or paid_amount >= 0),
  -- 銀行振込の入金済み額
  amount_received integer not null default 0 check (amount_received >= 0),
  payment_due_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  -- 払込票のURL・振込先など、支払いの案内に使う値
  payment_details jsonb,
  -- 管理画面で「要対応」に出す理由（取り消し後の入金など）
  needs_attention text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  created_by uuid,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel = 'proxy' or member_id is not null),
  check (channel = 'proxy' or payment_method <> 'cash'),
  check (delivery_method <> 'mail'
         or (ship_name is not null and ship_postal_code is not null and ship_address is not null)),
  check (total = subtotal + shipping_fee),
  check ((payment_status = 'canceled') = (canceled_at is not null))
);
create index orders_event_status_idx on public.orders (event_id, payment_status);
create index orders_member_idx on public.orders (member_id);
create index orders_status_due_idx on public.orders (payment_status, payment_due_at);

-- 注文の明細（お子さま単位） --------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- 明細を作った順（9.2 の配分の順番）
  line_no integer not null check (line_no > 0),
  product_id uuid not null references public.products (id),
  child_id uuid not null references public.children (id),
  class_id uuid not null references public.classes (id),
  grade_label_snapshot text not null,
  class_name_snapshot text not null,
  quantity integer not null check (quantity between 1 and 99),
  -- 注文時点の商品名と価格（取り消し後の計算し直し（9.5）は、この価格で行う）
  product_name_snapshot text not null,
  price_snapshot integer not null check (price_snapshot > 0),
  second_price_snapshot integer check (second_price_snapshot is null or second_price_snapshot > 0),
  late_price_snapshot integer check (late_price_snapshot is null or late_price_snapshot > 0),
  amount integer not null check (amount >= 0),
  -- 取り消した時点の行の金額（取り消した行の amount は 0 にする）
  canceled_amount integer check (canceled_amount is null or canceled_amount >= 0),
  fulfillment_status text check (fulfillment_status in
    ('accepted', 'in_production', 'delivered', 'shipped', 'canceled', 'provided')),
  canceled_at timestamptz,
  exchange_note text,
  exchange_shipped_at timestamptz,
  photo_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, line_no),
  unique (order_id, product_id, child_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_child_idx on public.order_items (child_id);
create index order_items_product_idx on public.order_items (product_id);

-- 返金 -------------------------------------------------------------------
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  amount integer not null check (amount > 0),
  reason text not null,
  item_ids uuid[] not null default '{}',
  method text not null check (method in ('stripe', 'manual')),
  stripe_refund_id text unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  failure_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);

-- 発送 -------------------------------------------------------------------
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  kind text not null default 'original' check (kind in ('original', 'exchange')),
  shipped_at timestamptz not null default now(),
  tracking_no text,
  carrier text,
  created_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments (order_id);

-- メールの文面（11章） --------------------------------------------------
create table public.email_templates (
  key text primary key,
  subject text not null,
  body text not null,
  is_marketing boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- メールの送信（1通1行。dedupe_key で二重送信を防ぐ） ----------------
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  to_email text not null,
  member_id uuid references public.members (id),
  order_id uuid references public.orders (id) on delete set null,
  event_id uuid references public.events (id),
  dedupe_key text not null unique,
  subject text not null,
  body text not null,
  is_marketing boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  ses_message_id text unique,
  error text,
  attempts integer not null default 0,
  locked_until timestamptz,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index email_messages_queue_idx on public.email_messages (status, queued_at);
create index email_messages_member_idx on public.email_messages (member_id);
create index email_messages_order_idx on public.email_messages (order_id);

-- 管理者・保守 ----------------------------------------------------------
create table public.staff (
  user_id uuid primary key references auth.users (id),
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'maintainer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 操作の記録（追記のみ） ------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_type text not null default 'staff' check (actor_type in ('staff', 'member', 'system')),
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

-- 設定 -------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Stripe の Webhook の受信記録（二重処理を防ぐ） ------------------------
create table public.stripe_events (
  id text primary key,
  type text not null,
  object_id text,
  attempts integer not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index stripe_events_error_idx on public.stripe_events (received_at) where error is not null;

-- 登録コードの入力の記録（総当たり対策。IPはハッシュで持つ） -----------
create table public.code_attempts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members (id),
  ip_hash text,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index code_attempts_member_idx on public.code_attempts (member_id, created_at);
create index code_attempts_ip_idx on public.code_attempts (ip_hash, created_at);

-- 定期処理の同時実行を防ぐリース（12章。PostgREST 経由ではセッション単位の
-- アドバイザリーロックが使えないため、期限つきの行ロックにする） ------
create table public.job_locks (
  name text primary key,
  locked_until timestamptz not null default 'epoch',
  holder text,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_error text
);

-- =====================================================================
-- トリガー
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'schools', 'classes', 'children', 'registration_codes', 'child_enrollments', 'members',
    'events', 'products', 'orders', 'order_items', 'refunds', 'email_messages', 'staff'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

create trigger marketing_consents_append_only
  before update or delete on public.marketing_consents
  for each row execute function public.forbid_modification();

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.forbid_modification();

-- 在籍のクラスは、その年度のクラスであること
create or replace function public.check_enrollment_year()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.classes c where c.id = new.class_id and c.fiscal_year = new.fiscal_year
  ) then
    raise exception 'class % is not in fiscal year %', new.class_id, new.fiscal_year
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger child_enrollments_check_year
  before insert or update on public.child_enrollments
  for each row execute function public.check_enrollment_year();

-- 行事の対象クラスは、行事と同じ学校・園・年度のクラスであること
create or replace function public.check_event_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.events e
    join public.classes c on c.id = new.class_id
    where e.id = new.event_id and c.school_id = e.school_id and c.fiscal_year = e.fiscal_year
  ) then
    raise exception 'class % does not belong to the school and year of event %', new.class_id, new.event_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger event_targets_check
  before insert or update on public.event_targets
  for each row execute function public.check_event_target();

-- 商品の対象クラスは、行事の対象クラスの中から選ぶこと
create or replace function public.check_product_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.products p
    join public.event_targets et on et.event_id = p.event_id and et.class_id = new.class_id
    where p.id = new.product_id
  ) then
    raise exception 'class % is not a target of the event of product %', new.class_id, new.product_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_targets_check
  before insert or update on public.product_targets
  for each row execute function public.check_product_target();

-- 支払いの状態は、8章の遷移だけを許す（条件付き UPDATE の裏の守り）
create or replace function public.check_payment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  if new.payment_status = old.payment_status then
    return new;
  end if;
  ok := case old.payment_status
    when 'draft' then new.payment_status in ('paid', 'pending')
    when 'pending' then new.payment_status in ('paid', 'canceled')
    when 'paid' then new.payment_status in ('partially_refunded', 'refunded')
    when 'partially_refunded' then new.payment_status in ('refunded')
    else false
  end;
  if not ok then
    raise exception 'payment_status % -> % is not allowed', old.payment_status, new.payment_status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger orders_check_payment_transition
  before update of payment_status on public.orders
  for each row execute function public.check_payment_transition();

-- お届けの状態は、8章の遷移だけを許す
create or replace function public.check_fulfillment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  if new.fulfillment_status is not distinct from old.fulfillment_status then
    return new;
  end if;
  ok := case
    when old.fulfillment_status is null then new.fulfillment_status in ('accepted', 'provided')
    when old.fulfillment_status = 'accepted' then new.fulfillment_status in ('in_production', 'canceled')
    when old.fulfillment_status = 'in_production' then new.fulfillment_status in ('delivered', 'shipped', 'canceled')
    else false
  end;
  if not ok then
    raise exception 'fulfillment_status % -> % is not allowed', old.fulfillment_status, new.fulfillment_status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger order_items_check_fulfillment_transition
  before update of fulfillment_status on public.order_items
  for each row execute function public.check_fulfillment_transition();

-- 注文は draft のときだけ削除できる（決済前に消える注文だけ）
create or replace function public.check_order_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.payment_status <> 'draft' then
    raise exception 'only draft orders can be deleted (order %)', old.order_no using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger orders_check_delete
  before delete on public.orders
  for each row execute function public.check_order_delete();

-- 明細の削除は、注文ごと消すとき（draft の注文の削除）だけ
create or replace function public.check_order_item_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders o where o.id = old.order_id and o.payment_status <> 'draft'
  ) then
    raise exception 'order items cannot be deleted once the order is placed' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger order_items_check_delete
  before delete on public.order_items
  for each row execute function public.check_order_item_delete();

create trigger refunds_no_delete
  before delete on public.refunds
  for each row execute function public.forbid_modification();
