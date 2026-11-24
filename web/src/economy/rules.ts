/* Royal Club coins, XP and daily rewards: the rules, as pure functions over one Wallet object.
   Coins are virtual and earn-only: they come from playing, the daily calendar, the free chest and missions, and are
   spent only on looks (background colours now; boards, dice and frames later). They can't be bought, cashed out
   or used as a stake in any game. Store and sync: ./wallet.ts. Dates use the phone's local calendar day. */

export const WALLET_VERSION = 1;

export interface DayLog {
  day: string;                          // YYYY-MM-DD
  played: Record<string, number>;       // games finished today, by game
  wins: Record<string, number>;
  total: number;
  totalWins: number;
  rewarded: number;                     // games that paid coins today (daily cap)
  claimed: string[];                    // mission ids (and "bonus") claimed today
}
export interface Wallet {
  v: number;
  coins: number;
  xp: number;
  owned: string[];                      // unlocked looks, e.g. "bg-purple"
  streak: number;                       // days in a row the daily reward was collected
  lastDaily: string | null;             // day the daily reward was last collected
  shieldWeek: string | null;            // week the free streak shield was last used
  chestAt: number;                      // the chest timer runs from here (ms)
  today: DayLog;
  life: { played: number; wins: number; games: Record<string, { p: number; w: number }> };
  updatedAt: number;
}

/* ---------- numbers (tune here) ---------- */
export const WELCOME_COINS = 250;
export const DAILY_REWARDS = [50, 75, 100, 125, 150, 200, 400];      // day 1 … day 7, then the week starts again
export const CHEST_EVERY = 4 * 60 * 60 * 1000;
export const CHEST_MAX = 2;                                           // chests that can wait unopened
export const CHEST_COINS = 40;
export const DAILY_GAME_CAP = 40;                                     // games per day that pay coins (XP has no cap)
export const MISSION_COINS = 50;
export const MISSION_BONUS = 100;                                     // all three missions done
const GAME_PAY: Record<string, { coins: number; xp: number }> = {
  win: { coins: 25, xp: 50 }, lose: { coins: 10, xp: 20 }, draw: { coins: 15, xp: 30 }, done: { coins: 10, xp: 20 }, daily: { coins: 50, xp: 60 },
};
/* Free looks. bg-cream (Festive Cream) is free in the app only: the database's save_wallet() list doesn't have it, so it
   drops it from the saved copy, and readWallet() adds every free look back on load. */
export const FREE_LOOKS = ["bg-emerald", "bg-ruby", "bg-cream", "bg-indigo"];

export interface ShopItem { id: string; name: string; price: number; level: number }
/** Looks that cost coins, or come free at a level. Ludo token sets ("ludo-…") are bought with coins only (level 999
    is never reached); they also unlock with room wins against real players (src/ludo/pieces.tsx UNLOCK). Keep the
    prices in step with the database's save_wallet() shop list (supabase/migrations). */
export const SHOP: ShopItem[] = [
  { id: "bg-purple", name: "Royal Purple", price: 1500, level: 10 },
  { id: "bg-peacock", name: "Peacock Teal", price: 1500, level: 15 },
  { id: "ludo-horse", name: "Royal horses", price: 500, level: 999 },
  { id: "ludo-tiger", name: "Toy tigers", price: 1000, level: 999 },
  { id: "ludo-peacock", name: "Peacocks", price: 1500, level: 999 },
  { id: "ludo-chariot", name: "Chariots", price: 2000, level: 999 },
];

/* ---------- days ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const prevDay = (day: string) => { const [y, m, d] = day.split("-").map(Number); return dayKey(new Date(y, m - 1, d - 1).getTime()); };
const weekKey = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d.getTime()); };
const emptyDay = (day: string): DayLog => ({ day, played: {}, wins: {}, total: 0, totalWins: 0, rewarded: 0, claimed: [] });

export function newWallet(now: number): Wallet {
  return { v: WALLET_VERSION, coins: WELCOME_COINS, xp: 0, owned: [...FREE_LOOKS], streak: 0, lastDaily: null, shieldWeek: null,
    chestAt: now - CHEST_EVERY, today: emptyDay(dayKey(now)), life: { played: 0, wins: 0, games: {} }, updatedAt: now };
}

/** A stored wallet, checked and brought up to date (new day). Anything unreadable starts a new wallet. */
export function readWallet(x: unknown, now: number): Wallet {
  const w = x as Partial<Wallet> | null;
  if (!w || typeof w !== "object" || w.v !== WALLET_VERSION || typeof w.coins !== "number" || typeof w.xp !== "number") return newWallet(now);
  const base = newWallet(now);
  const out: Wallet = { ...base, ...w, owned: Array.from(new Set([...FREE_LOOKS, ...(Array.isArray(w.owned) ? w.owned : [])])),
    today: w.today && typeof w.today.day === "string" ? { ...emptyDay(w.today.day), ...w.today } : base.today,
    life: w.life && typeof w.life.played === "number" ? w.life : base.life } as Wallet;
  return newDay(out, now);
}
function newDay(w: Wallet, now: number): Wallet {
  const day = dayKey(now);
  return w.today.day === day ? w : { ...w, today: emptyDay(day) };
}
const touch = (w: Wallet, now: number): Wallet => ({ ...w, updatedAt: now });

/* ---------- levels: reaching level L takes 50·L·(L−1) XP (L2 100, L5 1,000, L10 4,500) ---------- */
export const xpFor = (level: number) => 50 * level * (level - 1);
export function levelOf(xp: number) {
  let level = 1;
  while (xpFor(level + 1) <= xp) level++;
  const from = xpFor(level), to = xpFor(level + 1);
  return { level, into: xp - from, need: to - from, pct: Math.min(1, (xp - from) / (to - from)) };
}

/* ---------- daily calendar ---------- */
export function dailyStatus(w: Wallet, now: number) {
  const today = dayKey(now), yesterday = prevDay(today);
  const done = w.lastDaily === today;
  let next: number, shield = false;
  if (done) next = w.streak;
  else if (w.lastDaily === yesterday) next = w.streak + 1;
  else if (w.lastDaily && w.lastDaily === prevDay(yesterday) && w.shieldWeek !== weekKey(now)) { next = w.streak + 1; shield = true; }   // missed one day: the weekly shield keeps the streak
  else next = 1;
  const index = (next - 1) % DAILY_REWARDS.length;            // which calendar day is today's (0–6)
  return { done, streak: next, index, coins: DAILY_REWARDS[index], shield };
}
export function claimDaily(w: Wallet, now: number): { w: Wallet; coins: number } {
  w = newDay(w, now);
  const s = dailyStatus(w, now);
  if (s.done) return { w, coins: 0 };
  return { w: touch({ ...w, coins: w.coins + s.coins, streak: s.streak, lastDaily: dayKey(now), shieldWeek: s.shield ? weekKey(now) : w.shieldWeek }, now), coins: s.coins };
}

/* ---------- free chest ---------- */
export function chestStatus(w: Wallet, now: number) {
  const ready = Math.max(0, Math.min(CHEST_MAX, Math.floor((now - w.chestAt) / CHEST_EVERY)));
  return { ready, nextAt: ready >= CHEST_MAX ? null : w.chestAt + (ready + 1) * CHEST_EVERY };
}
export function claimChest(w: Wallet, now: number): { w: Wallet; coins: number } {
  const { ready } = chestStatus(w, now);
  if (!ready) return { w, coins: 0 };
  const start = ready >= CHEST_MAX ? now - CHEST_MAX * CHEST_EVERY : w.chestAt;   // a full shelf stopped the clock
  return { w: touch({ ...w, coins: w.coins + CHEST_COINS, chestAt: start + CHEST_EVERY }, now), coins: CHEST_COINS };
}

/* ---------- finished games ---------- */
export interface GameEvent { g: string; r: string; at: number; c?: number }   // c: coins, only on "spend"
const GAMES = ["ekah", "ludo", "snakes", "chess", "sudoku", "words"];
export const MAX_SPEND = 100;                                          // one in-game purchase (Word Puzzle hints cost 15 or 25)
export function applyGames(w: Wallet, events: GameEvent[], now: number): { w: Wallet; coins: number; xp: number; games: number; wins: number; spent: number } {
  w = newDay(w, now);
  let coins = 0, xp = 0, games = 0, wins = 0, spent = 0;
  const today = { ...w.today, played: { ...w.today.played }, wins: { ...w.today.wins } };
  const life = { ...w.life, games: { ...w.life.games } };
  for (const e of events) {
    if (e.r === "spend") {                                     // coins a game took for a hint; never more than the wallet holds
      if (GAMES.includes(e.g) && e.at <= now + 60_000 && now - e.at <= 7 * 86_400_000) spent += Math.max(0, Math.min(MAX_SPEND, Math.floor(Number(e.c) || 0)));
      continue;
    }
    const pay = GAME_PAY[e.r];
    if (!pay || !GAMES.includes(e.g) || e.at > now + 60_000 || now - e.at > 7 * 86_400_000) continue;
    const win = e.r === "win" || e.r === "daily";
    games++; if (win) wins++;
    xp += pay.xp;
    if (dayKey(e.at) === today.day) {                         // today's games count for missions and the daily cap
      today.played[e.g] = (today.played[e.g] ?? 0) + 1;
      today.total++;
      if (win) { today.wins[e.g] = (today.wins[e.g] ?? 0) + 1; today.totalWins++; }
      if (today.rewarded < DAILY_GAME_CAP) { today.rewarded++; coins += pay.coins; }
    } else coins += pay.coins;
    const g = life.games[e.g] ?? { p: 0, w: 0 };
    life.games[e.g] = { p: g.p + 1, w: g.w + (win ? 1 : 0) };
    life.played++; if (win) life.wins++;
  }
  if (!games && !spent) return { w, coins: 0, xp: 0, games: 0, wins: 0, spent: 0 };
  const balance = Math.max(0, w.coins + coins - spent);
  return { w: touch(games ? { ...w, coins: balance, xp: w.xp + xp, today, life } : { ...w, coins: balance }, now), coins, xp, games, wins, spent };
}

/* ---------- daily missions: three a day, the same for everyone that day ---------- */
export interface Mission { id: string; text: string; goal: number; progress: (d: DayLog) => number }
const POOL: Mission[] = [
  { id: "play3", text: "Play 3 games", goal: 3, progress: d => d.total },
  { id: "win1", text: "Win a game", goal: 1, progress: d => d.totalWins },
  { id: "win3", text: "Win 3 games", goal: 3, progress: d => d.totalWins },
  { id: "ludo", text: "Finish a game of Ludo", goal: 1, progress: d => d.played.ludo ?? 0 },
  { id: "snakes", text: "Finish a game of Snakes & Ladders", goal: 1, progress: d => d.played.snakes ?? 0 },
  { id: "chess", text: "Finish a game of Chess", goal: 1, progress: d => d.played.chess ?? 0 },
  { id: "ekah", text: "Finish a game of EKAH", goal: 1, progress: d => d.played.ekah ?? 0 },
  { id: "sudoku", text: "Solve a Sudoku", goal: 1, progress: d => d.wins.sudoku ?? 0 },
  { id: "play5", text: "Play 5 games", goal: 5, progress: d => d.total },
];
export function missionsFor(day: string): Mission[] {
  let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const easy = [POOL[0], POOL[1]][h % 2];                                     // one easy mission every day
  const rest = POOL.filter(m => m !== easy && !(easy.id === "win1" && m.id === "win3"));
  const a = rest[(h >>> 3) % rest.length];
  const rest2 = rest.filter(m => m !== a && !(a.id.startsWith("play") && m.id.startsWith("play")) && !(a.id.startsWith("win") && m.id.startsWith("win")));
  return [easy, a, rest2[(h >>> 7) % rest2.length]];
}
export function missionView(w: Wallet, now: number) {
  const d = newDay(w, now).today;
  const list = missionsFor(d.day).map(m => {
    const p = Math.min(m.goal, m.progress(d));
    return { id: m.id, text: m.text, goal: m.goal, progress: p, done: p >= m.goal, claimed: d.claimed.includes(m.id) };
  });
  return { list, bonusReady: list.every(m => m.claimed) && !d.claimed.includes("bonus"), bonusClaimed: d.claimed.includes("bonus") };
}
export function claimMission(w: Wallet, id: string, now: number): { w: Wallet; coins: number } {
  w = newDay(w, now);
  const v = missionView(w, now);
  let coins = 0;
  if (id === "bonus") { if (v.bonusReady) coins = MISSION_BONUS; }
  else { const m = v.list.find(x => x.id === id); if (m && m.done && !m.claimed) coins = MISSION_COINS; }
  if (!coins) return { w, coins: 0 };
  return { w: touch({ ...w, coins: w.coins + coins, today: { ...w.today, claimed: [...w.today.claimed, id] } }, now), coins };
}

/* ---------- looks ---------- */
export function unlockStatus(w: Wallet, id: string) {
  const item = SHOP.find(s => s.id === id);
  if (w.owned.includes(id) || FREE_LOOKS.includes(id)) return { owned: true, item, free: false, afford: true };
  if (!item) return { owned: false, item, free: false, afford: false };
  const free = levelOf(w.xp).level >= item.level;
  return { owned: false, item, free, afford: free || w.coins >= item.price };
}
export function unlock(w: Wallet, id: string, now: number): { w: Wallet; ok: boolean; spent: number } {
  const s = unlockStatus(w, id);
  if (s.owned || !s.item || !s.afford) return { w, ok: s.owned, spent: 0 };
  const spent = s.free ? 0 : s.item.price;
  return { w: touch({ ...w, coins: w.coins - spent, owned: [...w.owned, id] }, now), ok: true, spent };
}

/** Two copies of one player's wallet (this phone and the cloud backup): keep the one that has played more. */
export function pickWallet(a: Wallet, b: Wallet): Wallet {
  if (a.xp !== b.xp) return a.xp > b.xp ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}
