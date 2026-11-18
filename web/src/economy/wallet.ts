/* The player's wallet (coins, XP, daily rewards, unlocked looks): kept on this phone in localStorage and, for a
   signed-in player, backed up to Supabase (table player_wallets, one row per account, readable only by its owner and
   written only through the server-checked save_wallet() function) so it follows them to a new phone. Rules: ./rules.ts. Finished games arrive through src/lib/report.ts. */
import { useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";
import { getAccount, subscribe as onAccount } from "../auth/account";
import { takeGameEvents } from "../lib/report";
import * as R from "./rules";

const GUEST = "guest";
const keyFor = (owner: string) => `rc-wallet:${owner}`;
const readLocal = (owner: string): R.Wallet | null => {
  try { const raw = window.localStorage.getItem(keyFor(owner)); return raw ? R.readWallet(JSON.parse(raw), Date.now()) : null; } catch { return null; }
};
const writeLocal = (owner: string, w: R.Wallet) => { try { window.localStorage.setItem(keyFor(owner), JSON.stringify(w)); } catch { /* storage off */ } };

let owner = GUEST;
let wallet: R.Wallet = readLocal(GUEST) ?? R.newWallet(Date.now());
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export const subscribeWallet = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getWallet = () => wallet;
export const useWallet = () => useSyncExternalStore(subscribeWallet, getWallet, getWallet);

/* ---------- cloud backup (signed-in players) ----------
   The cloud copy only changes through the save_wallet() function in Supabase, which checks the new copy against the
   stored one (coins and XP within what can be earned, looks paid for) and sends back what it kept. This phone then
   takes the server's copy, so the balance is the same on every phone and can't be raised by editing this one. */
let saveTimer = 0;
const same = (a: R.Wallet, b: R.Wallet) => a.coins === b.coins && a.xp === b.xp && a.owned.length === b.owned.length && a.owned.every(x => b.owned.includes(x));
function scheduleCloudSave() {
  const c = supabase;
  if (!c || owner === GUEST) return;
  window.clearTimeout(saveTimer);
  const who = owner, state = wallet;
  saveTimer = window.setTimeout(() => {
    void c.rpc("save_wallet", { p_state: state }).then(({ data, error }) => {
      if (error) { console.warn("Wallet backup failed:", error.message); return; }
      if (owner !== who || wallet !== state || !data) return;          // changed meanwhile: the next save settles it
      const kept = R.readWallet(data, Date.now());
      if (same(kept, state)) return;
      wallet = kept; writeLocal(who, kept); emit();                    // the server's copy wins (no new save needed)
    });
  }, 1500);
}
async function loadCloud(who: string): Promise<R.Wallet | null> {
  const c = supabase;
  if (!c) return null;
  const { data, error } = await c.from("player_wallets").select("state").eq("user_id", who).maybeSingle();
  if (error || !data) return null;
  return R.readWallet(data.state, Date.now());
}

function commit(w: R.Wallet) {
  wallet = w;
  writeLocal(owner, w);
  scheduleCloudSave();
  emit();
}

/* Follow the account: each player (and the guest on this phone) has their own wallet. A guest who signs in for the
   first time brings the guest wallet along, and the guest wallet starts over. */
let lastUid: string | null | undefined;
let ready = false;                                        // the right wallet for this account is loaded (and the cloud copy checked)
const readySubs = new Set<() => void>();
export const useWalletReady = () => useSyncExternalStore(f => { readySubs.add(f); return () => { readySubs.delete(f); }; }, () => ready, () => ready);
const setReady = (v: boolean) => { if (ready !== v) { ready = v; readySubs.forEach(f => f()); } };
async function follow() {
  const a = getAccount();
  if (!a.ready) return;
  const uid = a.session?.user.id ?? null;
  if (uid === lastUid) return;
  lastUid = uid;
  setReady(false);
  if (!uid) { owner = GUEST; wallet = readLocal(GUEST) ?? R.newWallet(Date.now()); emit(); setReady(true); return; }
  owner = uid;
  const local = readLocal(uid);
  let w = local;
  if (!w) {
    const guest = readLocal(GUEST);
    if (guest && (guest.xp > 0 || guest.lastDaily || guest.owned.length > R.FREE_LOOKS.length)) { w = guest; writeLocal(GUEST, R.newWallet(Date.now())); }
  }
  wallet = w ?? R.newWallet(Date.now()); emit();
  const cloud = await loadCloud(uid);
  if (owner !== uid) return;
  const pick = cloud ? R.pickWallet(wallet, cloud) : wallet;
  commit(pick);
  setReady(true);
}
onAccount(() => { void follow(); });
void follow();

/* ---------- actions: each returns what was earned, for the "+coins" toast ---------- */
export interface Earned { coins: number; xp: number; games: number; wins: number; levelUp: number | null }
const none: Earned = { coins: 0, xp: 0, games: 0, wins: 0, levelUp: null };

/** Count the games finished since last time (call when the home screen opens). */
export function collectGames(): Earned {
  if (!ready) return none;                                // wait until the right wallet is loaded
  const events = takeGameEvents();
  if (!events.length) return none;
  const before = R.levelOf(wallet.xp).level;
  const r = R.applyGames(wallet, events, Date.now());
  if (!r.games && !r.spent) return none;
  commit(r.w);
  if (!r.games) return none;                             // only hints bought: nothing to celebrate
  const after = R.levelOf(r.w.xp).level;
  return { coins: r.coins, xp: r.xp, games: r.games, wins: r.wins, levelUp: after > before ? after : null };
}
const simple = (f: (w: R.Wallet, now: number) => { w: R.Wallet; coins: number }) => (): number => {
  const r = f(wallet, Date.now());
  if (r.coins) commit(r.w);
  return r.coins;
};
export const claimDaily = simple(R.claimDaily);
export const claimChest = simple(R.claimChest);
export function claimMission(id: string): number {
  const r = R.claimMission(wallet, id, Date.now());
  if (r.coins) commit(r.w);
  return r.coins;
}
export function unlockLook(id: string): boolean {
  const r = R.unlock(wallet, id, Date.now());
  if (r.ok && r.w !== wallet) commit(r.w);
  return r.ok;
}
/** Bring the day forward (new missions, chest timer) without other changes. */
export function refreshDay() {
  const w = R.readWallet(wallet, Date.now());
  if (w.today.day !== wallet.today.day) commit(w);
}
