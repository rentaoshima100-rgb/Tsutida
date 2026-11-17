-- =====================================================================
-- 管理画面の処理のうち、複数の行を1つのトランザクションで変えるもの
-- =====================================================================

-- 登録コードの再発行（9.8：紛失）。古いコードを無効にし、同じお子さま・年度の新しいコードを発行する。
-- すでにつながっている会員はそのまま
create or replace function public.reissue_code(p_code_id uuid, p_new_code text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_old public.registration_codes%rowtype;
  v_new uuid;
begin
  select * into v_old from public.registration_codes where id = p_code_id for update;
  if not found or v_old.status = 'revoked' then
    raise exception 'code cannot be reissued' using errcode = 'P0001';
  end if;
  insert into public.registration_codes (code, class_id, child_id, status, purpose)
  values (p_new_code, v_old.class_id, v_old.child_id, v_old.status, v_old.purpose)
  returning id into v_new;
  update public.registration_codes
  set status = 'revoked', revoked_at = now(), replaced_by = v_new
  where id = p_code_id;
  return v_new;
end;
$$;

-- 年度の切り替え（6.3）：前年のクラスを、新しい年度にコピーする（すでにあるクラスはそのまま）
create or replace function public.copy_classes(p_school_id uuid, p_from_year integer, p_to_year integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.classes (school_id, fiscal_year, grade_label, grade_order, name, capacity)
  select c.school_id, p_to_year, c.grade_label, c.grade_order, c.name, c.capacity
  from public.classes c
  where c.school_id = p_school_id and c.fiscal_year = p_from_year
  on conflict (school_id, fiscal_year, grade_label, name) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 代理注文のお子さま（6.4）：同じクラス・年度でふりがなが一致するお子さまがいればそれを使い、
-- なければ会員とつながらないお子さまと在籍を作る
create or replace function public.resolve_proxy_child(p_class_id uuid, p_full_name text, p_full_name_kana text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_class public.classes%rowtype;
  v_ids uuid[];
  v_child uuid;
begin
  select * into v_class from public.classes where id = p_class_id;
  if not found then
    raise exception 'class not found' using errcode = 'P0001';
  end if;
  select array_agg(ce.child_id) into v_ids
  from public.child_enrollments ce
  join public.children ch on ch.id = ce.child_id
  where ce.class_id = p_class_id
    and ce.fiscal_year = v_class.fiscal_year
    and ch.name_key = public.kana_name_key(p_full_name_kana);
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    return v_ids[1];
  end if;
  insert into public.children (full_name, full_name_kana) values (btrim(p_full_name), btrim(p_full_name_kana))
  returning id into v_child;
  insert into public.child_enrollments (child_id, fiscal_year, class_id) values (v_child, v_class.fiscal_year, p_class_id);
  return v_child;
end;
$$;
