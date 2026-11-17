-- =====================================================================
-- 関数の実行権限を最後にそろえ直す（3章）。
-- 関数を足すマイグレーションを作ったら、このファイルと同じ内容を末尾に入れること。
-- anon・authenticated が呼べるのは RLS の条件に使う関数だけで、
-- 注文の作成・状態の変更などは service_role（サーバー）しか呼べない。
-- =====================================================================

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

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
