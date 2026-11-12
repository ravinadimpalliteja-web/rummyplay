// Supabase Edge Function: username-signin
//
// Players sign in with a username. Accounts without a recovery email sign in straight from the website (their
// sign-in address is private: <username>@players.royalclubgames.com). After a player adds a recovery email, that email
// becomes their sign-in address, so the website asks this function instead: it finds the account by username,
// checks the password with Supabase, and returns the session. The email is never sent back to the browser.
//
// Settings: deploy with "Verify JWT" OFF (players aren't signed in yet). Uses the built-in SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY secrets.
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVATE_DOMAIN = "@players.royalclubgames.com";
const ALLOWED = [/^https:\/\/(www\.|test\.)?royalclubgames\.com$/, /^https:\/\/([a-z0-9-]+-)?rummyplay\.ravi-nadimpalli-teja\.workers\.dev$/, /^http:\/\/localhost(:\d+)?$/];

function cors(origin: string | null) {
  const ok = origin && ALLOWED.some((r) => r.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://royalclubgames.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const reply = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, h);
  const denied = () => reply({ error: "Invalid login credentials" }, 401, h);

  let username = "", password = "";
  try { ({ username = "", password = "" } = await req.json()); } catch { return denied(); }
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username) || typeof password !== "string" || password.length < 6 || password.length > 200) return denied();

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  // ilike is case-insensitive; escape "_" so it matches only an underscore.
  const { data: rows } = await admin.from("player_profiles").select("user_id, username").ilike("username", username.replace(/_/g, "\\_")).limit(2);
  const row = (rows ?? []).find((r) => String(r.username).toLowerCase() === username.toLowerCase());
  if (!row) return denied();
  const { data: u } = await admin.auth.admin.getUserById(row.user_id);
  const email = u?.user?.email;
  if (!email || email.endsWith(PRIVATE_DOMAIN)) return denied();   // the website already tried this address

  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return res.status === 429 ? reply({ error: "Too many tries" }, 429, h) : denied();
  const s = await res.json();
  return reply({ access_token: s.access_token, refresh_token: s.refresh_token }, 200, h);
});
