-- ジャケット画像のバケット（非公開）。お子さまが写ることがあるため公開せず、
-- 会員ページでだけ、サーバーが発行する期限つきの URL で出す（5章・14章）。
-- ローカルは config.toml でも作るが、本番は supabase db push でこのマイグレーションから作る
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jackets', 'jackets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
