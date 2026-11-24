-- Player stats: running totals only, one row per account, game and mode. No game is ever stored: when a game ends
-- the numbers go up by one and the game itself is thrown away. The row stays the same size however many games are
-- played, so storage grows only with the number of players (about 150 bytes per row).
--
--   mode 'friends'  room games against at least one other real, signed-in player. Only the room server writes these
--                   (record_game_result, with the project's secret key), so they can't be faked.
--   mode 'practice' games against the computer, reported by the player's own device (record_my_practice). Shown
--                   apart as practice and never used for rewards.
--
-- Any game id works (ludo, snakes, spades, ekah, chess, sudoku, wordpuzzle and future games): a new game needs no
-- database change, it only reports its results.
create table if not exists public.player_game_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game ~ '^[a-z][a-z0-9]{1,19}$'),
  mode text not null check (mode in ('friends', 'practice')),
  played integer not null default 0 check (played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  second_places integer not null default 0 check (second_places >= 0),
  third_places integer not null default 0 check (third_places >= 0),
  streak integer not null default 0 check (streak >= 0),            -- wins in a row right now
  best_streak integer not null default 0 check (best_streak >= 0),
  best_score integer check (best_score >= 0),                       -- highest score in one game (games with scores)
  best_time_ms integer check (best_time_ms > 0),                    -- fastest win (timed games, e.g. Sudoku)
  updated_at timestamptz not null default now(),
  primary key (user_id, game, mode)
);

alter table public.player_game_stats enable row level security;

drop policy if exists "Players read their own stats" on public.player_game_stats;
create policy "Players read their own stats" on public.player_game_stats
  for select to authenticated using ((select auth.uid()) = user_id);

-- Browsers can read their own rows but never write: all writes go through the functions below.
revoke insert, update, delete on public.player_game_stats from anon, authenticated;
grant select on public.player_game_stats to authenticated;

-- Adds one finished game to a player's totals.
--   p_outcome  'win', 'loss' or 'draw' (in games with places, only 1st is a win)
--   p_place    finishing place in games of 3 or more players (2nd and 3rd are counted), else null
--   p_score    the player's score, for games that have one; p_time_ms how long a win took, for timed games
create or replace function public.record_game_result(
  p_user uuid, p_game text, p_mode text, p_outcome text,
  p_place integer default null, p_score integer default null, p_time_ms integer default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w integer := case when p_outcome = 'win' then 1 else 0 end;
  bad_score boolean := p_score is not null and (p_score < 0 or p_score > 10000000);
  bad_time boolean := p_time_ms is not null and (p_time_ms < 1000 or p_time_ms > 86400000);
begin
  if p_user is null or p_outcome not in ('win', 'loss', 'draw') or p_mode not in ('friends', 'practice')
     or (p_place is not null and (p_place < 1 or p_place > 10)) then
    raise exception 'invalid game result';
  end if;
  if bad_score then p_score := null; end if;
  if bad_time or w = 0 then p_time_ms := null; end if;
  insert into public.player_game_stats as s (user_id, game, mode, played, wins, losses, draws, second_places,
    third_places, streak, best_streak, best_score, best_time_ms)
  values (p_user, p_game, p_mode, 1, w, (p_outcome = 'loss')::int, (p_outcome = 'draw')::int,
    coalesce((p_place = 2)::int, 0), coalesce((p_place = 3)::int, 0), w, w, p_score, p_time_ms)
  on conflict (user_id, game, mode) do update set
    played = s.played + 1,
    wins = s.wins + w,
    losses = s.losses + (p_outcome = 'loss')::int,
    draws = s.draws + (p_outcome = 'draw')::int,
    second_places = s.second_places + coalesce((p_place = 2)::int, 0),
    third_places = s.third_places + coalesce((p_place = 3)::int, 0),
    streak = case when w = 1 then s.streak + 1 else 0 end,
    best_streak = greatest(s.best_streak, case when w = 1 then s.streak + 1 else 0 end),
    best_score = case when p_score is null then s.best_score else greatest(coalesce(s.best_score, 0), p_score) end,
    best_time_ms = case when p_time_ms is null then s.best_time_ms else least(coalesce(s.best_time_ms, p_time_ms), p_time_ms) end,
    updated_at = now();
end;
$$;

revoke execute on function public.record_game_result(uuid, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.record_game_result(uuid, text, text, text, integer, integer, integer) to service_role;

-- A signed-in player's own practice game (against the computer), reported by their device.
create or replace function public.record_my_practice(
  p_game text, p_outcome text, p_place integer default null, p_score integer default null, p_time_ms integer default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'sign in to save stats'; end if;
  perform public.record_game_result(uid, p_game, 'practice', p_outcome, p_place, p_score, p_time_ms);
end;
$$;

revoke execute on function public.record_my_practice(text, text, integer, integer, integer) from public, anon;
grant execute on function public.record_my_practice(text, text, integer, integer, integer) to authenticated;
