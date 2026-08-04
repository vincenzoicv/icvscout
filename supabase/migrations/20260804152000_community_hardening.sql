-- Community launch hardening: keep trigger helpers private and index user-facing reads.
revoke execute on function public.create_icv_community_profile() from public, anon, authenticated;

create index if not exists idx_community_posts_user
  on public.community_posts(user_id, created_at desc);
create index if not exists idx_community_comments_user
  on public.community_comments(user_id, created_at desc);
create index if not exists idx_community_match_messages_user
  on public.community_match_messages(user_id, created_at desc);
create index if not exists idx_community_reactions_user
  on public.community_reactions(user_id);
create index if not exists idx_community_reposts_user
  on public.community_reposts(user_id, created_at desc);
create index if not exists idx_community_saves_user
  on public.community_saves(user_id, created_at desc);
create index if not exists idx_community_poll_votes_user
  on public.community_poll_votes(user_id);
create index if not exists idx_community_blocks_blocked
  on public.community_blocks(blocked_id);
create index if not exists idx_community_context_notes_news
  on public.community_context_notes(news_id) where news_id is not null;
create index if not exists idx_community_context_notes_author
  on public.community_context_notes(author_id);
create index if not exists idx_community_notifications_actor
  on public.community_notifications(actor_id);
create index if not exists idx_community_notifications_post
  on public.community_notifications(post_id) where post_id is not null;
create index if not exists idx_community_notifications_comment
  on public.community_notifications(comment_id) where comment_id is not null;
create index if not exists idx_community_notifications_news
  on public.community_notifications(news_id) where news_id is not null;
create index if not exists idx_community_reports_reporter
  on public.community_reports(reporter_id, created_at desc);
create index if not exists idx_community_reports_post
  on public.community_reports(post_id) where post_id is not null;
create index if not exists idx_community_reports_comment
  on public.community_reports(comment_id) where comment_id is not null;

drop policy if exists "community notifications own read" on public.community_notifications;
create policy "community notifications own read"
  on public.community_notifications for select
  using ((select auth.uid()) = user_id);

drop policy if exists "community blocks own read" on public.community_blocks;
create policy "community blocks own read"
  on public.community_blocks for select
  using ((select auth.uid()) = blocker_id);

drop policy if exists "community preferences own read" on public.community_notification_preferences;
create policy "community preferences own read"
  on public.community_notification_preferences for select
  using ((select auth.uid()) = user_id);

drop policy if exists "community muted words own read" on public.community_muted_words;
create policy "community muted words own read"
  on public.community_muted_words for select
  using ((select auth.uid()) = user_id);

drop policy if exists "community match room own write" on public.community_match_messages;
create policy "community match room own write"
  on public.community_match_messages for insert
  with check ((select auth.uid()) = user_id);
