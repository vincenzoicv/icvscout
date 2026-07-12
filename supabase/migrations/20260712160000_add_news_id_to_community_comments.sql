-- Permette ai commenti Community di riferirsi a un post oppure a una news ICV.
-- Questa prima migrazione adotta in sicurezza anche database gia aggiornati a mano.

do $$
begin
  if to_regclass('public.community_comments') is null then
    raise exception 'Tabella public.community_comments non trovata: applicare prima lo schema base';
  end if;

  if to_regclass('public.news') is null then
    raise exception 'Tabella public.news non trovata: applicare prima lo schema base';
  end if;
end
$$;

alter table public.community_comments
  alter column post_id drop not null;

alter table public.community_comments
  add column if not exists news_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.community_comments'::regclass
      and contype = 'f'
      and conname = 'community_comments_news_id_fkey'
  ) then
    alter table public.community_comments
      add constraint community_comments_news_id_fkey
      foreign key (news_id) references public.news(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.community_comments'::regclass
      and conname = 'community_comments_target_check'
  ) then
    alter table public.community_comments
      add constraint community_comments_target_check
      check (
        (post_id is not null and news_id is null)
        or (post_id is null and news_id is not null)
      );
  end if;
end
$$;

create index if not exists idx_community_comments_news
  on public.community_comments(news_id, status, created_at asc);
