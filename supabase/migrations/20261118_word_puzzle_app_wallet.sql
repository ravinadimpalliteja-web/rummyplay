-- Word Puzzle: coins stay in the app's own wallet (src/economy). The game reports results with rcReport like every
-- other game and pays for hints with "spend" events, so these functions no longer touch player_wallets.
-- Also: today's stats come back with word_today, and friend_list feeds the Family Board's friends box.
drop function if exists public._coins_add(uuid,int,text,text);

create or replace function public.word_guess(p_mode text, p_guess text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pz word_puzzles; r word_rounds; s word_stats; e word_entries;
        g text := lower(trim(p_guess)); sc text[]; today date := _ist_today();
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
    else
      s.streak := 0;
    end if;
    update word_stats set played=s.played, wins=s.wins, streak=s.streak, best=s.best, last_win=s.last_win, dist=s.dist
      where user_id = uid and mode = p_mode;
  end if;

  update word_rounds set guesses=r.guesses, solved=r.solved, finished=r.finished, updated_at=now()
    where user_id = uid and mode = p_mode and puzzle_date = today;

  select * into e from word_entries where word = pz.word;
  return jsonb_build_object('score', to_jsonb(sc), 'solved', r.solved, 'finished', r.finished, 'streak', s.streak,
    'card', case when r.finished then jsonb_build_object('word', e.word, 'theme', e.theme, 'meaning', e.meaning, 'example', e.example) end);
end $$;

create or replace function public.word_hint(p_mode text, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pz word_puzzles; r word_rounds; e word_entries; today date := _ist_today();
        idx int; open_idx int[];
begin
  if uid is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  select * into pz from word_puzzles where mode = p_mode and puzzle_date = today;
  if not found then raise exception 'NO_PUZZLE_TODAY'; end if;
  insert into word_rounds(user_id, mode, puzzle_date) values (uid, p_mode, today) on conflict do nothing;
  select * into r from word_rounds where user_id = uid and mode = p_mode and puzzle_date = today for update;
  if r.finished then return jsonb_build_object('error','ALREADY_FINISHED'); end if;
  if p_kind = 'meaning' then
    if r.hint_meaning then return jsonb_build_object('error','ALREADY_USED'); end if;
    update word_rounds set hint_meaning = true where user_id = uid and mode = p_mode and puzzle_date = today;
    select * into e from word_entries where word = pz.word;
    return jsonb_build_object('meaning', e.meaning);
  elsif p_kind = 'letter' then
    if coalesce(array_length(r.hint_letters,1),0) >= 2 then return jsonb_build_object('error','LIMIT'); end if;
    select array_agg(i) into open_idx from generate_series(0, length(pz.word)-1) i
      where not (i = any(r.hint_letters))
        and not exists (select 1 from unnest(r.guesses) g where substr(g, i+1, 1) = substr(pz.word, i+1, 1));
    if coalesce(array_length(open_idx,1),0) <= 1 then return jsonb_build_object('error','NOTHING_LEFT'); end if;
    idx := open_idx[1 + floor(random() * array_length(open_idx,1))::int];
    update word_rounds set hint_letters = hint_letters || idx where user_id = uid and mode = p_mode and puzzle_date = today;
    return jsonb_build_object('i', idx, 'ch', substr(pz.word, idx+1, 1));
  end if;
  return jsonb_build_object('error','BAD_KIND');
end $$;

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
    'stats', jsonb_build_object('played', coalesce(s.played,0), 'wins', coalesce(s.wins,0), 'best', coalesce(s.best,0),
               'streak', case when s.last_win >= _ist_today() - 1 then s.streak else 0 end,
               'dist', coalesce(to_jsonb(s.dist), '[0,0,0,0,0,0]'::jsonb))
  );
end $$;

create or replace function public.friend_list()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', case when f.user_id = auth.uid() then f.friend_id else f.user_id end,
           'name', coalesce(pp.username, pp.display_name, 'Player'),
           'status', case when f.status = 'accepted' then 'friend' when f.friend_id = auth.uid() then 'incoming' else 'sent' end)
         order by f.status, pp.username), '[]'::jsonb)
  from friendships f
  join player_profiles pp on pp.user_id = case when f.user_id = auth.uid() then f.friend_id else f.user_id end
  where auth.uid() in (f.user_id, f.friend_id);
$$;

revoke all on function public.friend_list() from public, anon;
grant execute on function public.friend_list() to authenticated;
revoke all on function public.word_guess(text,text), public.word_hint(text,text), public.word_today(text) from public, anon;
grant execute on function public.word_guess(text,text), public.word_hint(text,text), public.word_today(text) to authenticated;
