-- Coins, XP and daily rewards backup for signed-in players (web/src/economy/wallet.ts).
-- One row per account. Coins are virtual and earn-only: never bought, cashed out or staked.
-- Each player can read and write only their own row.
create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.player_wallets enable row level security;

drop policy if exists "Players read their own wallet" on public.player_wallets;
create policy "Players read their own wallet" on public.player_wallets
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Players add their own wallet" on public.player_wallets;
create policy "Players add their own wallet" on public.player_wallets
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Players update their own wallet" on public.player_wallets;
create policy "Players update their own wallet" on public.player_wallets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
