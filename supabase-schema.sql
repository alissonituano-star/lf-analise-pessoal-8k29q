create table if not exists public.played_games (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_key text not null,
  numbers integer[] not null,
  score numeric,
  mode text,
  strategy text,
  cost numeric,
  target_contest integer,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_key)
);

create index if not exists played_games_user_id_idx
  on public.played_games (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists played_games_set_updated_at on public.played_games;

create trigger played_games_set_updated_at
before update on public.played_games
for each row
execute function public.set_updated_at();

alter table public.played_games enable row level security;

drop policy if exists "Users read own played games" on public.played_games;
drop policy if exists "Users insert own played games" on public.played_games;
drop policy if exists "Users update own played games" on public.played_games;
drop policy if exists "Users delete own played games" on public.played_games;

create policy "Users read own played games"
on public.played_games
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users insert own played games"
on public.played_games
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users update own played games"
on public.played_games
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users delete own played games"
on public.played_games
for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.lotofacil_results (
  contest integer primary key,
  weekday text,
  draw_date date not null,
  numbers integer[] not null,
  sum_total integer not null,
  odd_count integer not null,
  even_count integer not null,
  low_count integer not null,
  high_count integer not null,
  source text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lotofacil_results_draw_date_idx
  on public.lotofacil_results (draw_date desc);

drop trigger if exists lotofacil_results_set_updated_at on public.lotofacil_results;

create trigger lotofacil_results_set_updated_at
before update on public.lotofacil_results
for each row
execute function public.set_updated_at();

alter table public.lotofacil_results enable row level security;

drop policy if exists "Anyone can read lotofacil results" on public.lotofacil_results;

create policy "Anyone can read lotofacil results"
on public.lotofacil_results
for select
to anon, authenticated
using (true);
