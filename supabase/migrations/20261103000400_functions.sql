-- =====================================================================
-- サーバー（service_role）から呼ぶ処理。複数の行を1つのトランザクションで変える
-- ものだけを SQL の関数にする。金額の計算（calcOrder）は TypeScript 側の1か所で行う。
-- どれも anon・authenticated からは呼べない（20261103000300_rls.sql の既定の権限）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 登録コードの入力（6.1・9.8・9.9・14章）
-- 戻り値の result：
--   linked          つながった
--   already_linked  すでにつながっている
--   needs_name      1人目の登録なのに、お子さまの氏名・ふりがながない
--   invalid         コードが存在しない（失敗として数える）
--   revoked         無効にされたコード（失敗として数える）
--   name_mismatch   ふりがなが一致しない（失敗として数える）
--   limit_reached   つなげるアカウントの上限に達している
--   already_enrolled 選んだお子さまに、その年度の別の在籍がある
--   child_not_linked 選んだお子さまに、この会員がつながっていない
--   locked          失敗が続いたため、しばらく受け付けない
--   member_not_found 会員がいない・退会済み
-- ---------------------------------------------------------------------
create or replace function public.register_code(
  p_member_id uuid,
  p_code text,
  p_full_name text,
  p_full_name_kana text,
  p_target_child_id uuid,
  p_ip_hash text,
  p_max_accounts integer,
  p_max_failures integer default 5,
  p_window interval default interval '15 minutes'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_code public.registration_codes%rowtype;
  v_class public.classes%rowtype;
  v_key text := public.kana_name_key(p_full_name_kana);
  v_child_id uuid;
  v_enrollment_id uuid;
  v_enrollment_class uuid;
  v_enrollment_code uuid;
  v_candidates uuid[];
  v_failures integer;
  v_count integer;
  v_notify uuid[];
  v_created_child boolean := false;
begin
  select * into v_member from public.members where id = p_member_id;
  if not found or v_member.withdrawn_at is not null then
    return jsonb_build_object('result', 'member_not_found');
  end if;

  -- 総当たり対策：会員ごと・IPごとに、直近の失敗が上限に達していたら受け付けない
  select count(*) into v_failures
  from public.code_attempts a
  where a.succeeded = false
    and a.created_at > now() - p_window
    and (a.member_id = p_member_id or (p_ip_hash is not null and a.ip_hash = p_ip_hash));
  if v_failures >= p_max_failures then
    return jsonb_build_object('result', 'locked');
  end if;

  select * into v_code from public.registration_codes where code = p_code for update;
  if not found then
    insert into public.code_attempts (member_id, ip_hash, succeeded) values (p_member_id, p_ip_hash, false);
    return jsonb_build_object('result', 'invalid');
  end if;
  if v_code.status = 'revoked' then
    insert into public.code_attempts (member_id, ip_hash, succeeded) values (p_member_id, p_ip_hash, false);
    return jsonb_build_object('result', 'revoked');
  end if;

  select * into v_class from public.classes where id = v_code.class_id;

  if v_code.status = 'active' then
    -- 使用中のコード（家族の2人目以降）：ふりがなが、コードのお子さまと一致すること
    if v_key = '' then
      return jsonb_build_object('result', 'needs_name');
    end if;
    select c.id into v_child_id from public.children c where c.id = v_code.child_id and c.name_key = v_key;
    if v_child_id is null then
      insert into public.code_attempts (member_id, ip_hash, succeeded) values (p_member_id, p_ip_hash, false);
      return jsonb_build_object('result', 'name_mismatch');
    end if;
  else
    -- 未使用のコード（1人目）
    if p_target_child_id is not null then
      -- 新年度のコード：会員がつながっているお子さまを選んだ
      if not exists (
        select 1 from public.member_children mc
        where mc.member_id = p_member_id and mc.child_id = p_target_child_id and mc.revoked_at is null
      ) then
        return jsonb_build_object('result', 'child_not_linked');
      end if;
      v_child_id := p_target_child_id;
    else
      if coalesce(btrim(p_full_name), '') = '' or v_key = '' then
        return jsonb_build_object('result', 'needs_name');
      end if;

      -- 同じお子さまを2件作らないための照合（9.9・6.4）
      -- (a) 同じクラス・年度に、代理注文で作った（コードのない）同じふりがなのお子さまが1人だけいる
      select array_agg(ce.child_id) into v_candidates
      from public.child_enrollments ce
      join public.children ch on ch.id = ce.child_id
      where ce.class_id = v_class.id
        and ce.fiscal_year = v_class.fiscal_year
        and ce.registration_code_id is null
        and ch.name_key = v_key;
      if coalesce(array_length(v_candidates, 1), 0) = 1 then
        v_child_id := v_candidates[1];
      else
        -- (b) 同じ学校・園の前年度に同じふりがなのお子さまが1人だけいて、今年度の在籍がまだない
        select array_agg(distinct ce.child_id) into v_candidates
        from public.child_enrollments ce
        join public.classes c on c.id = ce.class_id
        join public.children ch on ch.id = ce.child_id
        where c.school_id = v_class.school_id
          and ce.fiscal_year = v_class.fiscal_year - 1
          and ch.name_key = v_key
          and not exists (
            select 1 from public.child_enrollments ce2
            where ce2.child_id = ce.child_id and ce2.fiscal_year = v_class.fiscal_year
          );
        if coalesce(array_length(v_candidates, 1), 0) = 1 then
          v_child_id := v_candidates[1];
        else
          insert into public.children (full_name, full_name_kana)
          values (btrim(p_full_name), btrim(p_full_name_kana))
          returning id into v_child_id;
          v_created_child := true;
        end if;
      end if;
    end if;

    -- その年度の在籍を作る（代理注文で作った同じクラスの在籍には、コードを付ける）
    select ce.id, ce.class_id, ce.registration_code_id
      into v_enrollment_id, v_enrollment_class, v_enrollment_code
    from public.child_enrollments ce
    where ce.child_id = v_child_id and ce.fiscal_year = v_class.fiscal_year
    for update;
    if v_enrollment_id is null then
      insert into public.child_enrollments (child_id, fiscal_year, class_id, registration_code_id)
      values (v_child_id, v_class.fiscal_year, v_class.id, v_code.id);
    elsif v_enrollment_class = v_class.id and v_enrollment_code is null then
      update public.child_enrollments set registration_code_id = v_code.id where id = v_enrollment_id;
    else
      return jsonb_build_object('result', 'already_enrolled', 'child_id', v_child_id);
    end if;

    update public.registration_codes set status = 'active', child_id = v_child_id where id = v_code.id;
  end if;

  if exists (
    select 1 from public.member_children mc
    where mc.member_id = p_member_id and mc.child_id = v_child_id
      and mc.fiscal_year = v_class.fiscal_year and mc.revoked_at is null
  ) then
    return jsonb_build_object(
      'result', 'already_linked', 'child_id', v_child_id, 'fiscal_year', v_class.fiscal_year
    );
  end if;

  -- 上限：同じお子さま・年度の有効なつながりが上限に達していたら、つながない
  select count(*), coalesce(array_agg(mc.member_id), '{}')
    into v_count, v_notify
  from public.member_children mc
  where mc.child_id = v_child_id and mc.fiscal_year = v_class.fiscal_year and mc.revoked_at is null;
  if v_count >= p_max_accounts then
    return jsonb_build_object('result', 'limit_reached', 'child_id', v_child_id);
  end if;

  insert into public.member_children (member_id, child_id, fiscal_year, registration_code_id)
  values (p_member_id, v_child_id, v_class.fiscal_year, v_code.id);

  insert into public.code_attempts (member_id, ip_hash, succeeded) values (p_member_id, p_ip_hash, true);

  return jsonb_build_object(
    'result', 'linked',
    'child_id', v_child_id,
    'fiscal_year', v_class.fiscal_year,
    'class_id', v_class.id,
    'created_child', v_created_child,
    'notify_member_ids', to_jsonb(v_notify)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 注文の作成（6.2・6.4）。金額は TypeScript の calcOrder で計算した値を受け取り、
-- 合計が明細と合っていることだけをここで確かめる。
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns table (order_id uuid, order_no text)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_no text;
  v_item jsonb;
  v_line integer := 0;
  v_member uuid := nullif(p_order ->> 'member_id', '')::uuid;
  v_sum integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order has no items' using errcode = 'P0001';
  end if;

  select coalesce(sum((i ->> 'amount')::integer), 0) into v_sum from jsonb_array_elements(p_items) i;
  if v_sum <> (p_order ->> 'subtotal')::integer
     or (p_order ->> 'total')::integer <> v_sum + (p_order ->> 'shipping_fee')::integer then
    raise exception 'order amounts do not add up' using errcode = 'P0001';
  end if;

  if v_member is not null then
    -- 同じ会員の同時の注文を順に処理する
    perform 1 from public.members where id = v_member for update;
    if p_order ->> 'payment_method' = 'bank_transfer' and exists (
      select 1 from public.orders o
      where o.member_id = v_member and o.payment_method = 'bank_transfer' and o.payment_status = 'pending'
    ) then
      raise exception 'pending_bank_transfer_exists' using errcode = 'P0001';
    end if;
  end if;

  insert into public.orders (
    event_id, member_id, channel, is_late, delivery_method,
    ship_name, ship_postal_code, ship_address, ship_phone,
    buyer_name, buyer_kana, buyer_phone, buyer_email,
    payment_method, payment_status, subtotal, shipping_fee, total,
    payment_due_at, created_by, memo
  ) values (
    (p_order ->> 'event_id')::uuid,
    v_member,
    p_order ->> 'channel',
    coalesce((p_order ->> 'is_late')::boolean, false),
    p_order ->> 'delivery_method',
    p_order ->> 'ship_name',
    p_order ->> 'ship_postal_code',
    p_order ->> 'ship_address',
    p_order ->> 'ship_phone',
    p_order ->> 'buyer_name',
    p_order ->> 'buyer_kana',
    p_order ->> 'buyer_phone',
    p_order ->> 'buyer_email',
    p_order ->> 'payment_method',
    coalesce(p_order ->> 'payment_status', 'draft'),
    (p_order ->> 'subtotal')::integer,
    (p_order ->> 'shipping_fee')::integer,
    (p_order ->> 'total')::integer,
    nullif(p_order ->> 'payment_due_at', '')::timestamptz,
    nullif(p_order ->> 'created_by', '')::uuid,
    p_order ->> 'memo'
  )
  returning orders.id, orders.order_no into v_id, v_no;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_line := v_line + 1;
    insert into public.order_items (
      order_id, line_no, product_id, child_id, class_id,
      grade_label_snapshot, class_name_snapshot, quantity,
      product_name_snapshot, price_snapshot, second_price_snapshot, late_price_snapshot, amount
    )
    select
      v_id,
      v_line,
      p.id,
      (v_item ->> 'child_id')::uuid,
      (v_item ->> 'class_id')::uuid,
      v_item ->> 'grade_label_snapshot',
      v_item ->> 'class_name_snapshot',
      (v_item ->> 'quantity')::integer,
      p.name, p.price, p.second_price, p.late_price,
      (v_item ->> 'amount')::integer
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid
      and p.event_id = (p_order ->> 'event_id')::uuid
      and p.status = 'on_sale';
    if not found then
      raise exception 'product is not on sale for this event' using errcode = 'P0001';
    end if;
  end loop;

  return query select v_id, v_no;
end;
$$;

-- ---------------------------------------------------------------------
-- 支払いの状態の遷移（8章）。どれも今の状態が合うときだけ進み、進んだかを返す
-- ---------------------------------------------------------------------

-- draft・pending → paid。明細を accepted（データ商品は provided）にする
create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_from text[],
  p_paid_at timestamptz default now(),
  p_payment_intent_id text default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.orders o
  set payment_status = 'paid',
      paid_at = coalesce(p_paid_at, now()),
      paid_amount = o.total,
      amount_received = case when o.payment_method = 'bank_transfer' then o.total else o.amount_received end,
      stripe_payment_intent_id = coalesce(p_payment_intent_id, o.stripe_payment_intent_id)
  where o.id = p_order_id and o.payment_status = any (p_from);
  if not found then
    return false;
  end if;

  update public.order_items oi
  set fulfillment_status = case when p.kind = 'data' then 'provided' else 'accepted' end
  from public.products p
  where oi.order_id = p_order_id
    and p.id = oi.product_id
    and oi.fulfillment_status is null
    and oi.canceled_at is null;
  return true;
end;
$$;

-- draft → pending（コンビニ払い・銀行振込で、払込票・振込先が発行された）
create or replace function public.mark_order_pending(
  p_order_id uuid,
  p_payment_intent_id text,
  p_details jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.orders o
  set payment_status = 'pending',
      stripe_payment_intent_id = coalesce(p_payment_intent_id, o.stripe_payment_intent_id),
      payment_details = coalesce(p_details, o.payment_details)
  where o.id = p_order_id and o.payment_status = 'draft';
  return found;
end;
$$;

-- pending → canceled（支払期限切れ・会員や管理者の取り消し）。明細もまとめて取り消す
create or replace function public.cancel_unpaid_order(p_order_id uuid, p_reason text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.orders o
  set payment_status = 'canceled', canceled_at = now(), cancel_reason = p_reason
  where o.id = p_order_id and o.payment_status = 'pending';
  if not found then
    return false;
  end if;
  update public.order_items set canceled_at = now()
  where order_id = p_order_id and canceled_at is null;
  return true;
end;
$$;

-- 支払い済みの注文の明細の取り消しと差額の返金（9.5）
-- p_lines：残る明細の新しい金額 [{ "id": uuid, "amount": int }]（calcOrder で計算し直した値）
-- p_expected_total：計算に使った時点の total。ほかの処理と重なったら止める
create or replace function public.apply_paid_cancellation(
  p_order_id uuid,
  p_item_ids uuid[],
  p_lines jsonb,
  p_subtotal integer,
  p_shipping_fee integer,
  p_expected_total integer,
  p_reason text,
  p_method text,
  p_actor uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_new_total integer := p_subtotal + p_shipping_fee;
  v_refund_amount integer;
  v_refund_id uuid;
  v_n integer;
  v_remaining integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'order is not refundable' using errcode = 'P0001';
  end if;
  if v_order.total <> p_expected_total then
    raise exception 'order changed while cancelling' using errcode = '40001';
  end if;

  select count(*) into v_n
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.id = any (p_item_ids)
    and oi.canceled_at is null
    and oi.fulfillment_status in ('accepted', 'in_production', 'provided');
  if v_n <> coalesce(array_length(p_item_ids, 1), 0) or v_n = 0 then
    raise exception 'items cannot be cancelled' using errcode = 'P0001';
  end if;

  v_refund_amount := v_order.total - v_new_total;
  if v_refund_amount <= 0 then
    raise exception 'nothing to refund' using errcode = 'P0001';
  end if;

  update public.order_items oi
  set canceled_amount = oi.amount,
      amount = 0,
      fulfillment_status = case when oi.fulfillment_status = 'provided' then 'provided' else 'canceled' end,
      canceled_at = now()
  where oi.order_id = p_order_id and oi.id = any (p_item_ids);

  update public.order_items oi
  set amount = (l ->> 'amount')::integer
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
  where oi.order_id = p_order_id and oi.id = (l ->> 'id')::uuid and oi.canceled_at is null;

  select count(*) into v_remaining
  from public.order_items where order_id = p_order_id and canceled_at is null;

  if (select coalesce(sum(amount), 0) from public.order_items where order_id = p_order_id and canceled_at is null)
     <> p_subtotal then
    raise exception 'remaining line amounts do not add up' using errcode = 'P0001';
  end if;

  update public.orders
  set subtotal = p_subtotal,
      shipping_fee = p_shipping_fee,
      total = v_new_total,
      payment_status = case when v_remaining = 0 then 'refunded' else 'partially_refunded' end
  where id = p_order_id;

  insert into public.refunds (order_id, amount, reason, item_ids, method, status, created_by)
  values (
    p_order_id, v_refund_amount, p_reason, p_item_ids, p_method,
    case when p_method = 'manual' then 'succeeded' else 'pending' end,
    p_actor
  )
  returning id into v_refund_id;

  return v_refund_id;
end;
$$;

-- 決済前に消える draft の注文の削除（Checkout の期限切れ・途中でやめた注文）
create or replace function public.delete_draft_order(p_order_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  delete from public.orders where id = p_order_id and payment_status = 'draft';
  return found;
end;
$$;

-- ---------------------------------------------------------------------
-- メールの送信キュー（12章 S1）：送る行を期限つきで取る
-- ---------------------------------------------------------------------
create or replace function public.claim_email_batch(p_limit integer, p_lease interval default interval '5 minutes')
returns setof public.email_messages
language sql
set search_path = ''
as $$
  update public.email_messages m
  set locked_until = now() + p_lease, attempts = m.attempts + 1
  where m.id in (
    select q.id from public.email_messages q
    where q.status = 'queued' and (q.locked_until is null or q.locked_until < now())
    order by q.queued_at
    limit p_limit
    for update skip locked
  )
  returning m.*;
$$;

-- ---------------------------------------------------------------------
-- 定期処理の同時実行を防ぐ（12章）
-- ---------------------------------------------------------------------
create or replace function public.acquire_job_lock(p_name text, p_holder text, p_ttl interval)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.job_locks (name) values (p_name) on conflict (name) do nothing;
  update public.job_locks
  set locked_until = now() + p_ttl, holder = p_holder, last_started_at = now()
  where name = p_name and locked_until < now();
  return found;
end;
$$;

create or replace function public.release_job_lock(p_name text, p_holder text, p_error text default null)
returns void
language sql
set search_path = ''
as $$
  update public.job_locks
  set locked_until = 'epoch', last_finished_at = now(), last_error = p_error
  where name = p_name and holder = p_holder;
$$;

-- ---------------------------------------------------------------------
-- お知らせの宛先（9.7・11章）
-- ---------------------------------------------------------------------

-- 行事の対象のお子さまにつながる会員。p_unordered_only なら「まだ注文していない」お子さまが
-- 1人でもいる会員だけ。お知らせなので、同意があり、メールが届いている会員に限る
create or replace function public.event_audience(p_event_id uuid, p_unordered_only boolean)
returns table (member_id uuid, email text, full_name text, child_names text[], unordered_child_names text[])
language sql
stable
set search_path = ''
as $$
  with ev as (
    select e.id, e.fiscal_year from public.events e where e.id = p_event_id
  ),
  target_children as (
    select distinct ce.child_id
    from public.child_enrollments ce
    join ev on ce.fiscal_year = ev.fiscal_year
    join public.event_targets et on et.class_id = ce.class_id and et.event_id = ev.id
  ),
  ordered as (
    select distinct oi.child_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.event_id = p_event_id
      and o.payment_status in ('pending', 'paid', 'partially_refunded')
      and oi.canceled_at is null
  ),
  links as (
    select mc.member_id, mc.child_id,
           not exists (select 1 from ordered od where od.child_id = mc.child_id) as unordered
    from public.member_children mc
    join ev on mc.fiscal_year = ev.fiscal_year
    where mc.revoked_at is null
      and mc.child_id in (select tc.child_id from target_children tc)
  )
  select m.id, m.email, m.full_name,
         array_agg(c.full_name order by c.full_name_kana),
         coalesce(array_agg(c.full_name order by c.full_name_kana) filter (where l.unordered), '{}')
  from links l
  join public.members m on m.id = l.member_id
  join public.children c on c.id = l.child_id
  where m.marketing_opt_in
    and m.email_status = 'ok'
    and m.withdrawn_at is null
  group by m.id, m.email, m.full_name
  having (not p_unordered_only) or bool_or(l.unordered);
$$;

-- ---------------------------------------------------------------------
-- 本数の確定（9.4・12章 J5）：締切日（締切後の注文は受付期限の日）の2日後の23:59を過ぎた行事
-- ---------------------------------------------------------------------
create or replace function public.fix_production_counts(p_now timestamptz default now())
returns table (event_id uuid, kind text)
language plpgsql
set search_path = ''
as $$
begin
  return query
  update public.events e
  set production_fixed_at = p_now
  where e.status = 'published'
    and e.production_fixed_at is null
    and public.jst_end_of_day(public.jst_date(e.deadline_at) + 2) < p_now
  returning e.id, 'normal'::text;

  return query
  update public.events e
  set late_production_fixed_at = p_now
  where e.status = 'published'
    and e.late_enabled
    and e.late_production_fixed_at is null
    and public.jst_end_of_day(public.jst_date(e.late_until) + 2) < p_now
  returning e.id, 'late'::text;
end;
$$;

grant execute on all functions in schema public to service_role;
