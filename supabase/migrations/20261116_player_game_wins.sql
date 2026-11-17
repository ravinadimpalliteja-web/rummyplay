-- Room wins against real players, per account and game (server/results.js).
-- A row counts 1st-place finishes in room games where at least one other real, signed-in player was seated.
-- Ludo uses the count to unlock token sets. Players can read only their own counts and cannot change them;
-- only the room server adds wins, through record_game_win(), using the project's secret key.
create table if not exists public.player_game_wins (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game ~ '^[a-z]{2,20}$'),
  wins integer not null default 0 check (wins >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table public.player_game_wins enable row level security;

drop policy if exists "Players read their own game wins" on public.player_game_wins;
create policy "Players read their own game wins" on public.player_game_wins
  for select to authenticated using ((select auth.uid()) = user_id);

-- No insert, update or delete policies: browsers can't write here.
revoke insert, update, delete on public.player_game_wins from anon, authenticated;

create or replace function public.record_game_win(p_user uuid, p_game text)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.player_game_wins (user_id, game, wins)
  values (p_user, p_game, 1)
  on conflict (user_id, game) do update
    set wins = public.player_game_wins.wins + 1, updated_at = now()
  returning wins;
$$;

revoke execute on function public.record_game_win(uuid, text) from public, anon, authenticated;
grant execute on function public.record_game_win(uuid, text) to service_role;
