-- Ludo token sets can be bought with coins (web/src/economy/rules.ts SHOP, ids "ludo-<set>"), as well as unlocked
-- with room wins against real players. save_wallet() only keeps looks it knows the price of, so the four token sets
-- join its shop list here. Coins only (level 999 is never reached). Nothing else in the function changes.
create or replace function public.save_wallet(p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  coins_per_day constant int := 3000;   -- daily reward 400 + chests ~320 + 40 paid games x 50 + missions 250, rounded up
  xp_per_day    constant int := 10000;
  welcome       constant int := 250;    -- rules.ts WELCOME_COINS
  free_looks    constant text[] := array['bg-emerald','bg-ruby','bg-indigo'];
  shop          constant jsonb := '{"bg-purple":{"price":1500,"level":10},"bg-peacock":{"price":1500,"level":15},'
                                  '"ludo-horse":{"price":500,"level":999},"ludo-tiger":{"price":1000,"level":999},'
                                  '"ludo-peacock":{"price":1500,"level":999},"ludo-chariot":{"price":2000,"level":999}}';
  old_row public.player_wallets;
  old_coins int := welcome; old_xp int := 0; old_owned text[] := free_looks;
  new_coins int; new_xp int; new_owned text[] := '{}'; kept text[] := '{}';
  has_old boolean; days int; coin_room int; xp_room int; look_cost int := 0; lvl int := 1; item text; earned int;
begin
  if uid is null then raise exception 'SIGN_IN_REQUIRED'; end if;
  if jsonb_typeof(p_state) <> 'object' or length(p_state::text) > 20000
     or (p_state->>'v') is distinct from '1'
     or jsonb_typeof(p_state->'coins') <> 'number' or jsonb_typeof(p_state->'xp') <> 'number' then
    raise exception 'BAD_WALLET';
  end if;

  select * into old_row from public.player_wallets where user_id = uid for update;
  has_old := found;
  if has_old then
    old_coins := greatest(0, coalesce((old_row.state->>'coins')::numeric, 0))::int;
    old_xp    := greatest(0, coalesce((old_row.state->>'xp')::numeric, 0))::int;
    select coalesce(array_agg(x), '{}') into old_owned from jsonb_array_elements_text(coalesce(old_row.state->'owned', '[]')) x;
    days := least(7, floor(extract(epoch from now() - old_row.updated_at) / 86400)::int);
  else
    days := 2;                                   -- first backup: may bring a few days of guest or offline play
  end if;

  new_coins := greatest(0, floor((p_state->>'coins')::numeric))::int;
  new_xp    := greatest(0, floor((p_state->>'xp')::numeric))::int;

  -- An older copy (less XP than the stored one) never replaces a newer one.
  if has_old and new_xp < old_xp then return old_row.state; end if;

  -- Room left in the last 24 hours, plus a day for every whole day since the last backup.
  select coalesce(sum(greatest(amount, 0)), 0), coalesce(sum(greatest(xp, 0)), 0) into earned, xp_room
    from public.coin_ledger where user_id = uid and reason = 'earn' and created_at > now() - interval '24 hours';
  coin_room := greatest(0, coins_per_day * (1 + days) - earned);
  xp_room   := greatest(0, xp_per_day * (1 + days) - xp_room);
  new_xp := least(new_xp, old_xp + xp_room);
  while 50 * (lvl + 1) * lvl <= new_xp loop lvl := lvl + 1; end loop;

  -- Looks: free ones always; shop looks already owned; new shop looks when the level is reached or coins paid.
  for item in select distinct x from jsonb_array_elements_text(coalesce(p_state->'owned', '[]')) x loop
    if item = any(free_looks) or item = any(old_owned) then kept := kept || item;
    elsif shop ? item then
      if lvl >= (shop->item->>'level')::int then kept := kept || item;
      else new_owned := new_owned || item; end if;    -- has to be paid for
    end if;
  end loop;
  for item in select unnest(new_owned) loop
    if old_coins + coin_room - look_cost >= (shop->item->>'price')::int then
      look_cost := look_cost + (shop->item->>'price')::int; kept := kept || item;
    end if;
  end loop;
  kept := array(select distinct unnest(kept || free_looks || old_owned));

  -- Coins: never more than the old balance plus what could be earned, minus looks bought.
  new_coins := least(new_coins, old_coins + coin_room - look_cost);
  new_coins := greatest(0, new_coins);

  p_state := p_state || jsonb_build_object('coins', new_coins, 'xp', new_xp, 'owned', to_jsonb(kept));
  insert into public.player_wallets (user_id, state, updated_at) values (uid, p_state, now())
    on conflict (user_id) do update set state = excluded.state, updated_at = excluded.updated_at;

  earned := new_coins - old_coins + look_cost;   -- coins earned in this save (spending on hints shows as less)
  if earned > 0 or new_xp > old_xp then
    insert into public.coin_ledger (user_id, amount, reason, ref, xp) values (uid, greatest(earned, 0), 'earn', 'sync', new_xp - old_xp);
  end if;
  if earned < 0 then
    insert into public.coin_ledger (user_id, amount, reason, ref) values (uid, earned, 'spend', 'app');     -- hints and other in-app spends
  end if;
  if look_cost > 0 then
    insert into public.coin_ledger (user_id, amount, reason, ref) values (uid, -look_cost, 'spend', 'looks');
  end if;
  return p_state;
end;
$$;

revoke all on function public.save_wallet(jsonb) from public, anon;
grant execute on function public.save_wallet(jsonb) to authenticated;
