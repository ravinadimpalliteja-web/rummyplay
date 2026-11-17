-- Signed-in players need the SELECT privilege to read their own wins (the row policy still limits them to their
-- own row). This project doesn't grant table privileges to the app's roles automatically.
grant select on public.player_game_wins to authenticated;
