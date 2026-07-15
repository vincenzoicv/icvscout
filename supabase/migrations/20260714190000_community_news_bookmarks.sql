alter table public.community_saves
  drop constraint if exists community_saves_pkey;

alter table public.community_saves
  alter column post_id drop not null,
  add column if not exists id bigserial,
  add column if not exists news_id bigint references public.news(id) on delete cascade;

alter table public.community_saves
  add constraint community_saves_pkey primary key (id);

create unique index if not exists community_saves_post_user_unique
  on public.community_saves(post_id, user_id) where post_id is not null;
create unique index if not exists community_saves_news_user_unique
  on public.community_saves(news_id, user_id) where news_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_saves_single_target'
      and conrelid = 'public.community_saves'::regclass
  ) then
    alter table public.community_saves
      add constraint community_saves_single_target
      check ((post_id is not null)::integer + (news_id is not null)::integer = 1);
  end if;
end
$$;
