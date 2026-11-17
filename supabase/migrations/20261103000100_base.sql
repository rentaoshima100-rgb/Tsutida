-- =====================================================================
-- 基本の関数（情報設計書 1章・9.9）
-- =====================================================================

-- updated_at を自動で更新する
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 追記のみのテーブルで UPDATE・DELETE を止める（同意の記録・監査ログ）
create or replace function public.forbid_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end;
$$;

-- ふりがなの照合キー（9.9）：NFKC → カタカナをひらがなに → 空白を除く
-- TypeScript の nameKey()（src/lib/domain/kana.ts）と同じ結果になることをテストで確かめる
create or replace function public.kana_name_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    translate(
      normalize(coalesce(p, ''), nfkc),
      'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶヽヾ',
      'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖゝゞ'
    ),
    '[[:space:]]', '', 'g'
  );
$$;

-- 日本時間の日付（年度・締切日の判定に使う）
create or replace function public.jst_date(p timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p at time zone 'Asia/Tokyo')::date;
$$;

-- 日本時間のある日の 23:59:00（支払い期限・本数の確定の判定に使う）
create or replace function public.jst_end_of_day(p date)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (p::timestamp + interval '23 hours 59 minutes') at time zone 'Asia/Tokyo';
$$;
