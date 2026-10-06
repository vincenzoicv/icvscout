alter table public.news_drafts
  add column if not exists approved_news_id bigint references public.news(id) on delete set null;

create or replace function public.icv_approve_news_draft(p_draft_id bigint, p_news jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  draft public.news_drafts%rowtype;
  published public.news%rowtype;
  reused boolean := false;
begin
  select * into draft from public.news_drafts where id = p_draft_id for update;
  if not found then raise exception 'ICV_DRAFT_NOT_FOUND'; end if;
  if draft.review_status = 'discarded' then raise exception 'ICV_DRAFT_DISCARDED'; end if;

  if draft.approved_news_id is not null then
    select * into published from public.news where id = draft.approved_news_id;
    return jsonb_build_object('news', to_jsonb(published), 'already_approved', true);
  end if;

  -- Serializes approvals of separate drafts pointing to the same source article.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(nullif(draft.source_url, ''), 'draft:' || draft.id), 0));
  select * into published from public.news
    where title = draft.title and source is not distinct from draft.source_name
      and source_url is not distinct from draft.source_url
    order by id desc limit 1;
  reused := found;
  if draft.review_status = 'approved' then
    return jsonb_build_object('news', to_jsonb(published), 'already_approved', true);
  end if;
  if not reused then
    insert into public.news(title, body, category, urgency, source, source_url, visible, auto_fetched, reliability, editorial_status)
    values(p_news->>'title', p_news->>'body', p_news->>'category', p_news->>'urgency',
      draft.source_name, draft.source_url, true, true, p_news->>'reliability', p_news->>'editorial_status')
    returning * into published;
  end if;
  update public.news_drafts set review_status = 'approved', approved_news_id = published.id,
    updated_at = now() where id = draft.id;
  return jsonb_build_object('news', to_jsonb(published), 'already_approved', reused);
end;
$$;

revoke all on function public.icv_approve_news_draft(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.icv_approve_news_draft(bigint, jsonb) to service_role;
notify pgrst, 'reload schema';
