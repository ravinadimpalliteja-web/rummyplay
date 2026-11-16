/* Room wins against real players for the signed-in account (Supabase table player_game_wins, written only by the
   room server). Ludo unlocks token sets with them. Guests and signed-out players have none. The last count seen is
   kept on this device so the right tokens show straight away while the account is checked. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../auth/account";

const cacheKey = (uid: string, game: string) => `rc-realwins:${game}:${uid}`;
const readCache = (uid: string | null, game: string) => {
  if (!uid) return 0;
  try { return Number(window.localStorage.getItem(cacheKey(uid, game))) || 0; } catch { return 0; }
};

export function useRealWins(game: string) {
  const acc = useAccount();
  const uid = acc.session && !acc.guest ? acc.session.user.id : null;
  const [wins, setWins] = useState(() => readCache(uid, game));
  useEffect(() => { setWins(readCache(uid, game)); }, [uid, game]);

  /** Reads the count from the account; resolves the new count (or null if it couldn't be read). */
  const refresh = useCallback(async (): Promise<number | null> => {
    const c = supabase;
    if (!c || !uid) { setWins(0); return 0; }
    const { data, error } = await c.from("player_game_wins").select("wins").eq("user_id", uid).eq("game", game).maybeSingle();
    if (error) return null;
    const n = Number(data?.wins) || 0;
    setWins(n);
    try { window.localStorage.setItem(cacheKey(uid, game), String(n)); } catch { /* storage off */ }
    return n;
  }, [uid, game]);
  useEffect(() => { void refresh(); }, [refresh]);

  return { wins, signedIn: !!uid, refresh };
}
