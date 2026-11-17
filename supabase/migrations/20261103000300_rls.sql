-- =====================================================================
-- 権限と RLS（情報設計書 3章）
-- ・全テーブルで RLS を有効にする
-- ・会員（authenticated）に許すのは SELECT だけ。書き込みはサーバーが secret key で行う
-- ・anon ロールにはどのテーブルも開けない
-- =====================================================================

-- まず既定の権限を外し、必要なものだけを付け直す
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- これから作るオブジェクトも、既定では anon・authenticated に開けない。
-- 関数の EXECUTE は PostgreSQL の既定で PUBLIC に付くため、スキーマを指定しない形でも外す
-- （スキーマ単位の REVOKE では全体の既定を外せない）
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS で使う関数（security definer。会員は auth.uid() でしか指定できない）
-- ---------------------------------------------------------------------

-- 9.1 見られる条件：行事が published で、会員にその年度のつながり（revoked_at が空）があり、
-- そのお子さまの同じ年度の在籍クラスが行事の対象に入っている
create or replace function public.can_view_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.event_targets et on et.event_id = e.id
    join public.child_enrollments ce
      on ce.class_id = et.class_id and ce.fiscal_year = e.fiscal_year
    join public.member_children mc
      on mc.child_id = ce.child_id and mc.fiscal_year = e.fiscal_year and mc.revoked_at is null
    join public.members m on m.id = mc.member_id and m.withdrawn_at is null
    where e.id = p_event_id
      and e.status = 'published'
      and mc.member_id = (select auth.uid())
  );
$$;

-- 自分の注文がある行事（中止になった行事も、注文履歴では名前を出す）
create or replace function public.has_order_for_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.event_id = p_event_id
      and o.member_id = (select auth.uid())
      and o.payment_status <> 'draft'
  );
$$;

create or replace function public.can_read_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_event(p_event_id) or public.has_order_for_event(p_event_id);
$$;

create or replace function public.is_my_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_children mc
    where mc.child_id = p_child_id
      and mc.member_id = (select auth.uid())
      and mc.revoked_at is null
  );
$$;

create or replace function public.is_my_child_year(p_child_id uuid, p_fiscal_year integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_children mc
    where mc.child_id = p_child_id
      and mc.fiscal_year = p_fiscal_year
      and mc.member_id = (select auth.uid())
      and mc.revoked_at is null
  );
$$;

create or replace function public.is_my_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.child_enrollments ce
    join public.member_children mc
      on mc.child_id = ce.child_id and mc.fiscal_year = ce.fiscal_year and mc.revoked_at is null
    where ce.class_id = p_class_id
      and mc.member_id = (select auth.uid())
  );
$$;

create or replace function public.is_my_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes c
    where c.school_id = p_school_id and public.is_my_class(c.id)
  ) or exists (
    select 1 from public.events e
    where e.school_id = p_school_id and public.has_order_for_event(e.id)
  );
$$;

create or replace function public.is_my_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.member_id = (select auth.uid())
      and o.payment_status <> 'draft'
  );
$$;

grant execute on function
  public.can_view_event(uuid),
  public.has_order_for_event(uuid),
  public.can_read_event(uuid),
  public.is_my_child(uuid),
  public.is_my_child_year(uuid, integer),
  public.is_my_class(uuid),
  public.is_my_school(uuid),
  public.is_my_order(uuid),
  public.kana_name_key(text),
  public.jst_date(timestamptz),
  public.jst_end_of_day(date)
to authenticated;

-- ---------------------------------------------------------------------
-- 会員が SELECT できる行（3章の表）
-- ---------------------------------------------------------------------

grant select on
  public.members,
  public.member_children,
  public.children,
  public.child_enrollments,
  public.schools,
  public.classes,
  public.events,
  public.products,
  public.orders,
  public.order_items,
  public.shipments,
  public.refunds
to authenticated;

create policy members_select_self on public.members
  for select to authenticated
  using (id = (select auth.uid()));

create policy member_children_select_own on public.member_children
  for select to authenticated
  using (member_id = (select auth.uid()) and revoked_at is null);

create policy children_select_linked on public.children
  for select to authenticated
  using (public.is_my_child(id));

create policy child_enrollments_select_linked on public.child_enrollments
  for select to authenticated
  using (public.is_my_child_year(child_id, fiscal_year));

create policy schools_select_linked on public.schools
  for select to authenticated
  using (public.is_my_school(id));

create policy classes_select_linked on public.classes
  for select to authenticated
  using (public.is_my_class(id));

create policy events_select_viewable on public.events
  for select to authenticated
  using (public.can_read_event(id));

create policy products_select_viewable on public.products
  for select to authenticated
  using (public.can_read_event(event_id));

create policy orders_select_own on public.orders
  for select to authenticated
  using (member_id = (select auth.uid()) and payment_status <> 'draft');

create policy order_items_select_own on public.order_items
  for select to authenticated
  using (public.is_my_order(order_id));

create policy shipments_select_own on public.shipments
  for select to authenticated
  using (public.is_my_order(order_id));

create policy refunds_select_own on public.refunds
  for select to authenticated
  using (public.is_my_order(order_id));

-- staff, audit_logs, email_messages, email_templates, marketing_consents, settings,
-- stripe_events, code_attempts, event_targets, product_targets, event_deadline_changes,
-- job_locks には会員向けのポリシーを作らない（見られない）
