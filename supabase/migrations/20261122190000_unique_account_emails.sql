-- WebExpoSyn: one account per email inbox
--
-- Supabase already refuses the exact same email twice. This also refuses
-- variations that reach the same inbox:
--   * letter case:          Dayo@Example.com      = dayo@example.com
--   * "+tag" addressing:     dayo+test@example.com = dayo@example.com
--   * Gmail dots/domains:    d.a.y.o@gmail.com     = dayo@googlemail.com
--
-- It applies to new sign-ups and to email changes. Existing accounts are not
-- touched; see the query at the bottom to find any duplicates already there.
--
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to re-run.

create or replace function public.normalize_email(addr text)
returns text
language sql
immutable
set search_path = ''
as $$
  with parts as (
    select split_part(split_part(lower(trim(addr)), '@', 1), '+', 1) as local_part,
           split_part(lower(trim(addr)), '@', 2) as domain
  )
  select case
    when domain in ('gmail.com', 'googlemail.com') then replace(local_part, '.', '') || '@gmail.com'
    else local_part || '@' || domain
  end
  from parts
$$;

create or replace function public.prevent_duplicate_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text;
begin
  if new.email is null or new.email = '' then
    return new;
  end if;
  normalized := public.normalize_email(new.email);

  -- Serialise sign-ups for the same inbox so two at once can't both get through.
  perform pg_advisory_xact_lock(hashtext('webexposyn-email:' || normalized));

  if exists (
    select 1 from auth.users u
    where u.id <> new.id
      and u.email is not null
      and public.normalize_email(u.email) = normalized
  ) then
    raise exception 'An account with this email already exists'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_email on auth.users;
create trigger prevent_duplicate_email
  before insert or update of email on auth.users
  for each row execute function public.prevent_duplicate_email();

-- Not callable from the browser (functions in "public" are otherwise exposed via the API).
revoke all on function public.normalize_email(text) from public, anon, authenticated;
revoke all on function public.prevent_duplicate_email() from public, anon, authenticated;

-- To list accounts that already share an inbox (run separately, then delete the
-- extras in Authentication → Users):
--
--   select public.normalize_email(email) as inbox, array_agg(email order by created_at) as accounts
--   from auth.users where email is not null
--   group by 1 having count(*) > 1;
