-- =====================================================================
-- Word Puzzle (Royal Club) — daily words, progress, friends. Applied 18 Nov 2026.
-- Project: Royal club games (cveqalxcpenkncahnexd)
-- Adds new tables + functions only. Does NOT change any existing table,
-- policy or function used by EKAH / Ludo / Snakes & Ladders / sign-in.
-- =====================================================================

-- ---------- 1. Word data (hidden from players) ----------
create table if not exists public.word_valid (
  word text primary key check (word ~ '^[a-z]{4,5}$')
);

create table if not exists public.word_entries (
  word    text primary key check (word ~ '^[a-z]{4,5}$'),
  theme   text not null,
  meaning text not null,
  example text not null
);

create table if not exists public.word_puzzles (
  mode        text not null check (mode in ('easy','classic')),
  puzzle_date date not null,
  puzzle_no   int  not null,
  word        text not null references public.word_entries(word),
  festival    text,           -- e.g. 'Diwali'
  festival_emoji text,
  primary key (mode, puzzle_date)
);

-- RLS on, and NO policies: players can never read answers directly.
alter table public.word_valid   enable row level security;
alter table public.word_entries enable row level security;
alter table public.word_puzzles enable row level security;

-- ---------- 2. Player progress ----------
create table if not exists public.word_rounds (
  user_id      uuid not null references auth.users(id) on delete cascade,
  mode         text not null check (mode in ('easy','classic')),
  puzzle_date  date not null,
  guesses      text[] not null default '{}',
  hint_meaning boolean not null default false,
  hint_letters int[]  not null default '{}',
  solved       boolean not null default false,
  finished     boolean not null default false,
  coins_earned int not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, mode, puzzle_date)
);

create table if not exists public.word_stats (
  user_id  uuid not null references auth.users(id) on delete cascade,
  mode     text not null check (mode in ('easy','classic')),
  played   int not null default 0,
  wins     int not null default 0,
  streak   int not null default 0,
  best     int not null default 0,
  last_win date,
  dist     int[] not null default '{0,0,0,0,0,0}',
  primary key (user_id, mode)
);

alter table public.word_rounds enable row level security;
alter table public.word_stats  enable row level security;
-- Players may READ their own rows; all writes go through the functions below.
create policy "Players read own word rounds" on public.word_rounds
  for select using ((select auth.uid()) = user_id);
create policy "Players read own word stats" on public.word_stats
  for select using ((select auth.uid()) = user_id);

-- ---------- 3. Friends (shared by ALL Royal Club games) ----------
create table if not exists public.friendships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friendships enable row level security;
create policy "Players see their own friendships" on public.friendships
  for select using ((select auth.uid()) in (user_id, friend_id));

-- ---------- 4. Coins: server-side ledger ----------
-- Not used yet: coins stay in the app wallet (src/economy). Kept for a later server-side wallet.
create table if not exists public.coin_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     int  not null,
  reason     text not null,           -- 'royalword_win', 'royalword_hint', ...
  ref        text,
  created_at timestamptz not null default now()
);
alter table public.coin_ledger enable row level security;
create policy "Players read own coin history" on public.coin_ledger
  for select using ((select auth.uid()) = user_id);

-- =====================================================================
-- Functions (security definer = run with server rights, check the caller)
-- =====================================================================

create or replace function public._ist_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public._word_score(g text, a text) returns text[]
language plpgsql immutable as $$
declare res text[] := array_fill('miss'::text, array[length(a)]);
        pool text := '';  i int;  pos int;
begin
  for i in 1..length(a) loop
    if substr(g,i,1) = substr(a,i,1) then res[i] := 'hit'; else pool := pool || substr(a,i,1); end if;
  end loop;
  for i in 1..length(a) loop
    if res[i] <> 'hit' then
      pos := strpos(pool, substr(g,i,1));
      if pos > 0 then res[i] := 'near'; pool := overlay(pool placing '_' from pos for 1); end if;
    end if;
  end loop;
  return res;
end $$;

-- Today's puzzle for the caller: theme, festival, length, their progress.
-- The answer + word card are only included once the round is finished.
create or replace function public.word_today(p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pz word_puzzles; e word_entries; r word_rounds; s word_stats;
begin
  if uid is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  select * into pz from word_puzzles where mode = p_mode and puzzle_date = _ist_today();
  if not found then raise exception 'NO_PUZZLE_TODAY'; end if;
  select * into e from word_entries where word = pz.word;
  select * into r from word_rounds where user_id = uid and mode = p_mode and puzzle_date = pz.puzzle_date;
  select * into s from word_stats  where user_id = uid and mode = p_mode;
  return jsonb_build_object(
    'puzzle_no', pz.puzzle_no, 'date', pz.puzzle_date, 'length', length(pz.word),
    'theme', e.theme, 'festival', pz.festival, 'festival_emoji', pz.festival_emoji,
    'guesses', coalesce(to_jsonb(r.guesses), '[]'::jsonb),
    'scores', (select coalesce(jsonb_agg(to_jsonb(_word_score(g, pz.word))), '[]'::jsonb) from unnest(r.guesses) g),
    'hint_meaning', case when r.hint_meaning or r.finished then e.meaning end,
    'hint_letters', (select coalesce(jsonb_agg(jsonb_build_object('i', i, 'ch', substr(pz.word, i+1, 1))), '[]'::jsonb)
                     from unnest(r.hint_letters) i),
    'finished', coalesce(r.finished, false), 'solved', coalesce(r.solved, false),
    'card', case when r.finished then jsonb_build_object('word', e.word, 'theme', e.theme, 'meaning', e.meaning, 'example', e.example) end,
    'streak', case when s.last_win >= _ist_today() - 1 then s.streak else 0 end,
    'coins', (select coalesce((state->>'coins')::int, 100) from player_wallets where user_id = uid)
  );
end $$;

-- Submit a guess. Checks the word server-side, so the answer never reaches the phone early.
create or replace function public.word_guess(p_mode text, p_guess text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pz word_puzzles; r word_rounds; s word_stats; e word_entries;
        g text := lower(trim(p_guess)); sc text[]; earned int := 0; bonus int := 0; today date := _ist_today();
begin
  if uid is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  select * into pz from word_puzzles where mode = p_mode and puzzle_date = today;
  if not found then raise exception 'NO_PUZZLE_TODAY'; end if;
  if length(g) <> length(pz.word) then return jsonb_build_object('error','NOT_ENOUGH_LETTERS'); end if;
  if not exists (select 1 from word_valid where word = g) then return jsonb_build_object('error','NOT_IN_LIST'); end if;

  insert into word_rounds(user_id, mode, puzzle_date) values (uid, p_mode, today) on conflict do nothing;
  select * into r from word_rounds where user_id = uid and mode = p_mode and puzzle_date = today for update;
  if r.finished then return jsonb_build_object('error','ALREADY_FINISHED'); end if;

  sc := _word_score(g, pz.word);
  r.guesses := r.guesses || g;
  r.solved := (g = pz.word);
  r.finished := r.solved or array_length(r.guesses,1) >= 6;

  if r.finished then
    insert into word_stats(user_id, mode) values (uid, p_mode) on conflict do nothing;
    select * into s from word_stats where user_id = uid and mode = p_mode for update;
    s.played := s.played + 1;
    if r.solved then
      s.wins := s.wins + 1;
      s.dist[array_length(r.guesses,1)] := s.dist[array_length(r.guesses,1)] + 1;
      s.streak := case when s.last_win = today - 1 then s.streak + 1 else 1 end;
      s.last_win := today; s.best := greatest(s.best, s.streak);
      earned := (case when p_mode = 'classic' then array[60,50,40,30,20,10] else array[40,35,30,20,15,10] end)[array_length(r.guesses,1)];
      if s.streak % 7 = 0 then bonus := 100; end if;
      perform _coins_add(uid, earned + bonus, 'royalword_win', p_mode || ':' || today);
    else
      s.streak := 0;
    end if;
    update word_stats set played=s.played, wins=s.wins, streak=s.streak, best=s.best, last_win=s.last_win, dist=s.dist
      where user_id = uid and mode = p_mode;
    r.coins_earned := earned + bonus;
  end if;

  update word_rounds set guesses=r.guesses, solved=r.solved, finished=r.finished, coins_earned=r.coins_earned, updated_at=now()
    where user_id = uid and mode = p_mode and puzzle_date = today;

  select * into e from word_entries where word = pz.word;
  return jsonb_build_object('score', to_jsonb(sc), 'solved', r.solved, 'finished', r.finished,
    'earned', earned, 'bonus', bonus, 'streak', coalesce(s.streak, null),
    'card', case when r.finished then jsonb_build_object('word', e.word, 'theme', e.theme, 'meaning', e.meaning, 'example', e.example) end);
end $$;

-- Buy a hint: 'meaning' (15 coins) or 'letter' (25 coins, max 2 per puzzle).
create or replace function public.word_hint(p_mode text, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pz word_puzzles; r word_rounds; e word_entries; today date := _ist_today();
        idx int; bal int; open_idx int[];
begin
  if uid is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  select * into pz from word_puzzles where mode = p_mode and puzzle_date = today;
  insert into word_rounds(user_id, mode, puzzle_date) values (uid, p_mode, today) on conflict do nothing;
  select * into r from word_rounds where user_id = uid and mode = p_mode and puzzle_date = today for update;
  if r.finished then return jsonb_build_object('error','ALREADY_FINISHED'); end if;
  if p_kind = 'meaning' then
    if r.hint_meaning then return jsonb_build_object('error','ALREADY_USED'); end if;
    bal := _coins_add(uid, -15, 'royalword_hint', 'meaning:' || p_mode || ':' || today);
    update word_rounds set hint_meaning = true where user_id = uid and mode = p_mode and puzzle_date = today;
    select * into e from word_entries where word = pz.word;
    return jsonb_build_object('meaning', e.meaning, 'coins', bal);
  elsif p_kind = 'letter' then
    if coalesce(array_length(r.hint_letters,1),0) >= 2 then return jsonb_build_object('error','LIMIT'); end if;
    select array_agg(i) into open_idx from generate_series(0, length(pz.word)-1) i
      where not (i = any(r.hint_letters))
        and not exists (select 1 from unnest(r.guesses) g where substr(g, i+1, 1) = substr(pz.word, i+1, 1));
    if coalesce(array_length(open_idx,1),0) <= 1 then return jsonb_build_object('error','NOTHING_LEFT'); end if;
    idx := open_idx[1 + floor(random() * array_length(open_idx,1))::int];
    bal := _coins_add(uid, -25, 'royalword_hint', 'letter:' || p_mode || ':' || today);
    update word_rounds set hint_letters = hint_letters || idx where user_id = uid and mode = p_mode and puzzle_date = today;
    return jsonb_build_object('i', idx, 'ch', substr(pz.word, idx+1, 1), 'coins', bal);
  end if;
  return jsonb_build_object('error','BAD_KIND');
end $$;

-- Word Book: every finished puzzle's word card.
create or replace function public.word_book()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('word', e.word, 'theme', e.theme, 'meaning', e.meaning,
           'example', e.example, 'solved', r.solved, 'date', r.puzzle_date) order by r.puzzle_date desc), '[]'::jsonb)
  from word_rounds r join word_puzzles p using (mode, puzzle_date) join word_entries e on e.word = p.word
  where r.user_id = auth.uid() and r.finished;
$$;

-- Family Board: accepted friends' results for today. Hidden until YOU finish (no spoilers).
create or replace function public.word_friends_board(p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today date := _ist_today();
begin
  if uid is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  if not exists (select 1 from word_rounds where user_id = uid and mode = p_mode and puzzle_date = today and finished) then
    return jsonb_build_object('locked', true);
  end if;
  return jsonb_build_object('locked', false, 'players', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', coalesce(pp.display_name, pp.username), 'me', pp.user_id = uid,
             'tries', case when r.solved then array_length(r.guesses,1) end, 'finished', coalesce(r.finished,false))
           order by (case when r.solved then array_length(r.guesses,1) else 9 end)), '[]'::jsonb)
    from player_profiles pp
    left join word_rounds r on r.user_id = pp.user_id and r.mode = p_mode and r.puzzle_date = today
    where pp.user_id = uid or pp.user_id in (
      select case when f.user_id = uid then f.friend_id else f.user_id end
      from friendships f where f.status = 'accepted' and uid in (f.user_id, f.friend_id))));
end $$;

-- Weekly crown: fewest total guesses over the last 7 days among friends (unsolved = 7).
create or replace function public.word_weekly_crown(p_mode text)
returns jsonb language sql security definer set search_path = public as $$
  with circle as (
    select auth.uid() as id
    union select case when f.user_id = auth.uid() then f.friend_id else f.user_id end
      from friendships f where f.status = 'accepted' and auth.uid() in (f.user_id, f.friend_id)
  ), totals as (
    select c.id, sum(case when r.solved then array_length(r.guesses,1) else 7 end) as total, count(r.*) as days
    from circle c join word_rounds r on r.user_id = c.id and r.mode = p_mode and r.finished
      and r.puzzle_date > _ist_today() - 7
    group by c.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(pp.display_name, pp.username), 'total', t.total, 'days', t.days)
           order by t.days desc, t.total asc), '[]'::jsonb)
  from totals t join player_profiles pp on pp.user_id = t.id;
$$;

-- Friends (shared): send / accept a request by username.
create or replace function public.friend_request(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); other uuid;
begin
  select user_id into other from player_profiles where lower(username) = lower(p_username);
  if other is null then return 'NOT_FOUND'; end if;
  if other = uid then return 'SELF'; end if;
  if exists (select 1 from friendships where user_id = other and friend_id = uid) then
    update friendships set status = 'accepted' where user_id = other and friend_id = uid;  -- they asked first
    return 'ACCEPTED';
  end if;
  insert into friendships(user_id, friend_id) values (uid, other) on conflict do nothing;
  return 'SENT';
end $$;

create or replace function public.friend_accept(p_from uuid)
returns void language sql security definer set search_path = public as $$
  update friendships set status = 'accepted' where user_id = p_from and friend_id = auth.uid();
$$;

-- Only signed-in players may call these.
revoke all on function public.word_today(text), public.word_guess(text,text), public.word_hint(text,text),
  public.word_book(), public.word_friends_board(text), public.word_weekly_crown(text),
  public.friend_request(text), public.friend_accept(uuid) from public, anon;
grant execute on function public.word_today(text), public.word_guess(text,text), public.word_hint(text,text),
  public.word_book(), public.word_friends_board(text), public.word_weekly_crown(text),
  public.friend_request(text), public.friend_accept(uuid) to authenticated;
