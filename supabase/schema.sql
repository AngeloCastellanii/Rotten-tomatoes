-- Rotten Tomatoes · esquema Supabase
-- 1) Crea un proyecto nuevo en https://supabase.com (no uses el de recetas)
-- 2) SQL Editor → pega este archivo → Run
-- 3) Authentication → Providers → Email → desactiva "Confirm email"
-- 4) Copia URL y anon key a .env y vuelve a compilar

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'audience' check (role in ('audience', 'critic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.titles (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  name text not null,
  overview text not null default '',
  release_date date,
  poster_url text,
  backdrop_url text,
  genres text[] not null default '{}',
  cast jsonb not null default '[]'::jsonb,
  runtime_minutes integer,
  original_language text,
  tmdb_score numeric(4, 1),
  audience_score numeric(5, 1),
  critic_score numeric(5, 1),
  audience_count integer not null default 0,
  critic_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists titles_tmdb_media_idx
  on public.titles (tmdb_id, media_type);

create index if not exists titles_name_idx
  on public.titles (lower(name));

create index if not exists titles_release_idx
  on public.titles (release_date);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references public.titles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  score integer not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title_id, author_id)
);

create index if not exists reviews_title_idx
  on public.reviews (title_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    case
      when new.raw_user_meta_data->>'role' = 'critic' then 'critic'
      else 'audience'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.refresh_title_scores(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.titles as title
  set
    audience_score = scores.audience_score,
    audience_count = scores.audience_count,
    critic_score = scores.critic_score,
    critic_count = scores.critic_count,
    updated_at = now()
  from (
    select
      round(avg(review.score) filter (where profile.role = 'audience'), 1) as audience_score,
      count(review.id) filter (where profile.role = 'audience')::integer as audience_count,
      round(avg(review.score) filter (where profile.role = 'critic'), 1) as critic_score,
      count(review.id) filter (where profile.role = 'critic')::integer as critic_count
    from public.reviews as review
    join public.profiles as profile on profile.id = review.author_id
    where review.title_id = target
  ) as scores
  where title.id = target;
end;
$$;

create or replace function public.on_review_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_title_scores(coalesce(new.title_id, old.title_id));
  if tg_op = 'UPDATE' and old.title_id is distinct from new.title_id then
    perform public.refresh_title_scores(old.title_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reviews_refresh_scores on public.reviews;
create trigger reviews_refresh_scores
  after insert or update or delete on public.reviews
  for each row execute function public.on_review_change();

create or replace function public.on_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title uuid;
begin
  if new.role is distinct from old.role then
    for title in
      select review.title_id from public.reviews as review where review.author_id = new.id
    loop
      perform public.refresh_title_scores(title);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_refresh_scores on public.profiles;
create trigger profiles_refresh_scores
  after update of role on public.profiles
  for each row execute function public.on_profile_role_change();

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

alter table public.profiles enable row level security;
alter table public.titles enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "titles_select" on public.titles;
create policy "titles_select" on public.titles
  for select to authenticated using (true);

drop policy if exists "titles_insert" on public.titles;
create policy "titles_insert" on public.titles
  for insert to authenticated
  with check (true);

drop policy if exists "reviews_select" on public.reviews;
create policy "reviews_select" on public.reviews
  for select to authenticated using (true);

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews
  for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews
  for delete to authenticated
  using (auth.uid() = author_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.titles to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
