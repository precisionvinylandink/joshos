import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * joshos-plaid — the server side of Major Goals' bank linking.
 *
 *   DEPLOY to joshos-sync (lavbxjegicshhfvytapb) as function `joshos-plaid`.
 *   This file is the source of truth; keep it identical to what is deployed.
 *
 *   POST /link_token     -> { link_token }            open Plaid Link
 *   POST /exchange       -> { item, accounts }        public_token -> access_token (server-side)
 *   POST /accounts       -> { accounts }              cached, from our own DB
 *   POST /refresh        -> { accounts, errors }      pull live balances from the bank
 *   POST /transactions   -> { transactions }          inflow-positive cents, one account
 *   POST /unlink         -> { ok }                    remove the item at Plaid and here
 *   POST /status         -> { configured, items }     is the service set up at all
 *   POST /webhook        -> Plaid calls this          item + transaction updates
 *
 * READ-ONLY BY CONSTRUCTION
 * ─────────────────────────
 * The only Plaid endpoints this function will ever call are listed in
 * READ_ONLY_ENDPOINTS below, and callPlaid() refuses anything else. There is
 * no code path here that can move money: no /transfer, no /payment_initiation,
 * no ACH, no auth-for-debit. A future edit that tries to add one fails the
 * guard rather than shipping quietly.
 *
 * SECRETS
 * ───────
 * PLAID_CLIENT_ID / PLAID_SECRET exist only in this process's environment.
 * They are never returned, never logged, and never reach a browser. The access
 * token is encrypted (AES-GCM) before it touches Postgres with a key that also
 * lives only here — so a database dump alone is not bank access.
 *
 * AUTH
 * ────
 * verify_jwt is DISABLED at the gateway because Plaid's webhook is unauthenticated
 * by JWT. Every OTHER route authenticates here, explicitly, by validating the
 * caller's Supabase session server-side and scoping every query to that uid.
 * The webhook authenticates by verifying Plaid's ES256 signature instead.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID") ?? "";
const PLAID_SECRET = Deno.env.get("PLAID_SECRET") ?? "";
const PLAID_ENV = (Deno.env.get("PLAID_ENV") ?? "sandbox").toLowerCase();
/** base64 of 32 random bytes. Without it we refuse to store a token at all. */
const PLAID_TOKEN_KEY = Deno.env.get("PLAID_TOKEN_KEY") ?? "";
/**
 * Least privilege. `transactions` is the minimum that supports both the
 * balance (authoritative) and the deposit history that savings pace and the
 * forecast are built from. Set PLAID_PRODUCTS=balance to drop transaction
 * access entirely — the goals still work, and pace/forecast degrade honestly
 * to "not enough contribution history".
 */
const PLAID_PRODUCTS = (Deno.env.get("PLAID_PRODUCTS") ?? "transactions")
  .split(",").map((s) => s.trim()).filter(Boolean);
const PLAID_WEBHOOK_URL = Deno.env.get("PLAID_WEBHOOK_URL") ?? "";
const PLAID_REDIRECT_URI = Deno.env.get("PLAID_REDIRECT_URI") ?? "";

const PLAID_HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};
const PLAID_HOST = PLAID_HOSTS[PLAID_ENV] ?? PLAID_HOSTS.sandbox;

/**
 * The complete set of Plaid endpoints this service may call. Every one is a
 * read or a link-lifecycle operation. Nothing here moves money.
 */
const READ_ONLY_ENDPOINTS = new Set([
  "/link/token/create",
  "/item/public_token/exchange",
  "/item/get",
  "/item/remove",
  "/institutions/get_by_id",
  "/accounts/get",
  "/accounts/balance/get",
  "/transactions/get",
  "/webhook_verification_key/get",
]);

/**
 * "null" is the Origin an Electron renderer sends from a file:// page — the
 * JoshOS desktop app. CORS is not the access control here: every route needs a
 * validated Supabase session, so a page without one gets 401 whatever its
 * origin. JOSHOS_ALLOWED_ORIGINS extends this for the deployed web app.
 */
const ALLOWED_ORIGINS = [
  "null",
  "https://joshos-timelog.vercel.app",
  ...(Deno.env.get("JOSHOS_ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── plumbing ───────────────────────────────────────────────────────────────

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "authorization, content-type, apikey";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return h;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

/** Money as integer cents. Bank figures arrive as decimal dollars. */
function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || !isFinite(amount)) return null;
  return Math.round(amount * 100);
}

// ── token encryption ───────────────────────────────────────────────────────
// AES-GCM. The key is an environment secret; the ciphertext is all Postgres
// ever sees. Fails closed: no key configured means no token is stored.

async function aesKey(): Promise<CryptoKey> {
  if (!PLAID_TOKEN_KEY) throw new Error("PLAID_TOKEN_KEY is not configured");
  const raw = Uint8Array.from(atob(PLAID_TOKEN_KEY), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("PLAID_TOKEN_KEY must be base64 of exactly 32 bytes");
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function sealToken(token: string): Promise<string> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return `${b64(iv)}.${b64(ct)}`;
}

async function openToken(sealed: string): Promise<string> {
  const key = await aesKey();
  const [ivB64, ctB64] = sealed.split(".");
  if (!ivB64 || !ctB64) throw new Error("malformed sealed token");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivB64) }, key, unb64(ctB64),
  );
  return new TextDecoder().decode(pt);
}

// ── Plaid client ───────────────────────────────────────────────────────────

class PlaidError extends Error {
  code: string;
  httpStatus: number;
  /** Plaid says the user must re-authenticate at their bank. */
  reauth: boolean;
  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.reauth = code === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION" ||
      code === "ITEM_LOCKED" || code === "USER_PERMISSION_REVOKED";
  }
}

async function callPlaid(endpoint: string, body: Record<string, unknown>): Promise<any> {
  // The read-only guard. Adding a money-movement endpoint requires editing
  // READ_ONLY_ENDPOINTS above, which is exactly the review moment we want.
  if (!READ_ONLY_ENDPOINTS.has(endpoint)) {
    throw new PlaidError("ENDPOINT_NOT_PERMITTED", `${endpoint} is not a permitted read-only endpoint`, 500);
  }
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new PlaidError("NOT_CONFIGURED", "Plaid credentials are not configured on the server", 503);
  }
  let r: Response;
  try {
    r = await fetch(PLAID_HOST + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, ...body }),
    });
  } catch (_e) {
    // Never let a network message carry request detail into a log.
    throw new PlaidError("NETWORK_ERROR", "Could not reach Plaid", 502);
  }
  const text = await r.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }
  if (!r.ok) {
    throw new PlaidError(
      payload.error_code ?? "PLAID_ERROR",
      payload.error_message ?? `Plaid ${r.status}`,
      r.status,
    );
  }
  return payload;
}

// ── auth ───────────────────────────────────────────────────────────────────

/**
 * Validates the caller's Supabase session against the auth server. This is a
 * real signature + expiry check, not a decode: an attacker cannot hand us a
 * self-made JWT. Returns the uid every query is then scoped to.
 */
async function requireUser(req: Request): Promise<{ id: string }> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) throw new HttpError(401, "sign in required");
  const scoped = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await scoped.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, "sign in required");
  return { id: data.user.id };
}

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── item helpers ───────────────────────────────────────────────────────────

/** Loads an item ROW SCOPED TO THE USER and decrypts its token. */
async function itemToken(userId: string, itemId: string): Promise<{ token: string; row: any }> {
  const { data, error } = await db
    .from("plaid_items")
    .select("id, item_id, access_token_enc, institution_name, status")
    .eq("user_id", userId)          // ownership, enforced on every read
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) throw new HttpError(500, "item lookup failed");
  if (!data) throw new HttpError(404, "no such bank connection");
  return { token: await openToken(data.access_token_enc), row: data };
}

async function markItem(userId: string, itemId: string, status: string, errorCode: string | null) {
  await db.from("plaid_items")
    .update({ status, error_code: errorCode })
    .eq("user_id", userId).eq("item_id", itemId);
}

async function audit(userId: string, e: {
  itemId?: string | null; accountId?: string | null; goalId?: string | null;
  startedAt: string; status: string; errorCode?: string | null; lastKnown?: number | null;
}) {
  await db.from("plaid_syncs").insert({
    user_id: userId,
    item_id: e.itemId ?? null,
    account_id: e.accountId ?? null,
    goal_id: e.goalId ?? null,
    sync_started_at: e.startedAt,
    sync_completed_at: new Date().toISOString(),
    status: e.status,
    error_code: e.errorCode ?? null,
    last_known_balance_cents: e.lastKnown ?? null,
  });
}

/**
 * The account shape the browser is allowed to see. Deliberately narrow: a
 * display name, the last four Plaid already masks, a balance and when it was
 * taken. No account number, no routing number, no access token, no item
 * internals — see §19 of the brief.
 */
function publicAccount(row: any) {
  return {
    accountId: row.account_id,
    itemId: row.item_id,
    name: row.name,
    mask: row.mask,
    type: row.type,
    subtype: row.subtype,
    institution: row.institution_name ?? null,
    balance: row.balance_cents,
    balanceAt: row.balance_at,
    lastSyncedAt: row.last_synced_at,
    lastErrorCode: row.last_error_code ?? null,
    currency: row.currency ?? "USD",
  };
}

// ── routes ─────────────────────────────────────────────────────────────────

async function routeStatus(userId: string) {
  const { data } = await db.from("plaid_items")
    .select("item_id, institution_name, status, error_code")
    .eq("user_id", userId);
  return {
    configured: !!(PLAID_CLIENT_ID && PLAID_SECRET && PLAID_TOKEN_KEY),
    env: PLAID_ENV,
    products: PLAID_PRODUCTS,
    items: (data ?? []).map((i) => ({
      itemId: i.item_id, institution: i.institution_name,
      status: i.status, errorCode: i.error_code,
    })),
  };
}

async function routeLinkToken(userId: string, body: any) {
  // Re-linking an existing item for reauth: Plaid wants the access token and
  // no products.
  let accessToken: string | undefined;
  if (body?.itemId) accessToken = (await itemToken(userId, String(body.itemId))).token;

  const payload: Record<string, unknown> = {
    client_name: "JoshOS",
    // Plaid requires a stable, non-PII user id. The Supabase uid is exactly
    // that — no email, no name.
    user: { client_user_id: userId },
    language: "en",
    country_codes: ["US"],
    // Only depository savings/checking may even be offered. A brokerage or
    // credit card cannot be selected for a savings goal, and Plaid never shows
    // the accounts we did not ask for.
    account_filters: { depository: { account_subtypes: ["savings", "checking"] } },
  };
  if (accessToken) payload.access_token = accessToken;
  else payload.products = PLAID_PRODUCTS;
  if (PLAID_WEBHOOK_URL) payload.webhook = PLAID_WEBHOOK_URL;
  if (PLAID_REDIRECT_URI) payload.redirect_uri = PLAID_REDIRECT_URI;

  const r = await callPlaid("/link/token/create", payload);
  // Only the short-lived link token crosses to the browser.
  return { link_token: r.link_token, expiration: r.expiration };
}

async function routeExchange(userId: string, body: any) {
  const publicToken = body?.publicToken;
  if (!publicToken) throw new HttpError(400, "publicToken required");
  const startedAt = new Date().toISOString();

  const ex = await callPlaid("/item/public_token/exchange", { public_token: publicToken });
  const accessToken: string = ex.access_token;
  const itemId: string = ex.item_id;

  // Resolve the institution for display. Best-effort: a nameless bank is a
  // cosmetic problem, not a reason to fail the link.
  let institutionId: string | null = null;
  let institutionName: string | null = null;
  try {
    const item = await callPlaid("/item/get", { access_token: accessToken });
    institutionId = item?.item?.institution_id ?? null;
    if (institutionId) {
      const inst = await callPlaid("/institutions/get_by_id", {
        institution_id: institutionId, country_codes: ["US"],
      });
      institutionName = inst?.institution?.name ?? null;
    }
  } catch { /* display only */ }

  // Encrypt BEFORE the token can reach Postgres. If PLAID_TOKEN_KEY is missing
  // this throws and we store nothing — failing closed is the correct outcome.
  const sealed = await sealToken(accessToken);

  const { error } = await db.from("plaid_items").upsert({
    user_id: userId,
    item_id: itemId,
    institution_id: institutionId,
    institution_name: institutionName,
    access_token_enc: sealed,
    status: "ok",
    error_code: null,
  }, { onConflict: "user_id,item_id" });
  if (error) throw new HttpError(500, "could not save the bank connection");

  const accounts = await pullAccounts(userId, itemId, accessToken, institutionName);
  await audit(userId, { itemId, startedAt, status: "ok" });

  // Note what is NOT here: access_token. It never leaves this function.
  return {
    item: { itemId, institution: institutionName },
    accounts: accounts.map(publicAccount),
  };
}

/** Fetches balances from the bank and writes them to our own table. */
async function pullAccounts(
  userId: string, itemId: string, accessToken: string, institutionName: string | null,
): Promise<any[]> {
  const r = await callPlaid("/accounts/balance/get", { access_token: accessToken });
  const now = new Date().toISOString();
  const rows = (r.accounts ?? []).map((a: any) => ({
    user_id: userId,
    item_id: itemId,
    account_id: a.account_id,
    name: a.name ?? a.official_name ?? "Account",
    // Plaid's mask is already the last four. Truncated again defensively.
    mask: a.mask ? String(a.mask).slice(-4) : null,
    type: a.type ?? null,
    subtype: a.subtype ?? null,
    // `available` is what is actually spendable toward a car; `current`
    // includes pending activity. Prefer available, fall back to current.
    balance_cents: toCents(a.balances?.available ?? a.balances?.current),
    currency: a.balances?.iso_currency_code ?? "USD",
    balance_at: now,
    last_synced_at: now,
    last_error_code: null,
  }));
  if (rows.length) {
    const { error } = await db.from("plaid_accounts").upsert(rows, { onConflict: "user_id,account_id" });
    if (error) throw new HttpError(500, "could not save account balances");
  }
  return rows.map((row) => ({ ...row, institution_name: institutionName }));
}

async function routeAccounts(userId: string) {
  const [{ data: accounts }, { data: items }] = await Promise.all([
    db.from("plaid_accounts").select("*").eq("user_id", userId),
    db.from("plaid_items").select("item_id, institution_name, status, error_code").eq("user_id", userId),
  ]);
  type ItemRow = { item_id: string; institution_name: string | null; status: string; error_code: string | null };
  const byItem = new Map<string, ItemRow>(
    ((items ?? []) as ItemRow[]).map((i) => [i.item_id, i] as const),
  );
  return {
    accounts: (accounts ?? []).map((a: any) => {
      const item = byItem.get(a.item_id);
      return {
        ...publicAccount({ ...a, institution_name: item?.institution_name ?? null }),
        // The item's health travels with every account so the UI can say
        // "bank connection needs attention" on the card that shows the number.
        itemStatus: item?.status ?? "ok",
        itemErrorCode: item?.error_code ?? null,
      };
    }),
  };
}

/**
 * Refresh live balances. A failure on one institution never blocks another,
 * and NEVER writes a zero: on error we leave the last known balance in place
 * and report the error alongside it.
 */
async function routeRefresh(userId: string, body: any) {
  const startedAt = new Date().toISOString();
  const wanted: string[] | null = Array.isArray(body?.accountIds) && body.accountIds.length
    ? body.accountIds.map(String) : null;

  const { data: items } = await db.from("plaid_items")
    .select("item_id, access_token_enc, institution_name").eq("user_id", userId);
  if (!items?.length) return { accounts: [], errors: [] };

  const errors: Array<{ itemId: string; code: string; message: string; reauth: boolean }> = [];

  for (const item of items) {
    try {
      const token = await openToken(item.access_token_enc);
      await pullAccounts(userId, item.item_id, token, item.institution_name);
      await markItem(userId, item.item_id, "ok", null);
      await audit(userId, { itemId: item.item_id, startedAt, status: "ok" });
    } catch (e) {
      const pe = e instanceof PlaidError ? e : new PlaidError("SYNC_FAILED", "Unable to retrieve current balance.", 502);
      await markItem(userId, item.item_id, pe.reauth ? "reauth" : "error", pe.code);
      // Stamp the attempt on the accounts WITHOUT touching balance_cents —
      // this is the line that keeps a failed API call from reading as $0.
      await db.from("plaid_accounts")
        .update({ last_synced_at: new Date().toISOString(), last_error_code: pe.code })
        .eq("user_id", userId).eq("item_id", item.item_id);
      await audit(userId, { itemId: item.item_id, startedAt, status: "error", errorCode: pe.code });
      errors.push({ itemId: item.item_id, code: pe.code, message: pe.message, reauth: pe.reauth });
    }
  }

  const out = await routeAccounts(userId);
  const accounts = wanted ? out.accounts.filter((a) => wanted.includes(a.accountId)) : out.accounts;
  return { accounts, errors };
}

/**
 * Deposit history for ONE account, normalized to inflow-positive cents.
 * Plaid's sign convention for depository accounts is the opposite of intuition:
 * a positive `amount` means money LEFT the account. We flip it here so the
 * client engine can treat positive as "saved" without knowing Plaid at all.
 */
async function routeTransactions(userId: string, body: any) {
  const accountId = body?.accountId ? String(body.accountId) : "";
  if (!accountId) throw new HttpError(400, "accountId required");
  if (!PLAID_PRODUCTS.includes("transactions")) {
    return { transactions: [], reason: "transactions_not_enabled" };
  }

  const { data: acct } = await db.from("plaid_accounts")
    .select("item_id, account_id").eq("user_id", userId).eq("account_id", accountId).maybeSingle();
  if (!acct) throw new HttpError(404, "no such account");

  const { token } = await itemToken(userId, acct.item_id);
  const days = Math.min(Math.max(Number(body?.days) || 730, 30), 730);
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const out: Array<{ id: string; date: string; amount: number }> = [];
  let offset = 0;
  // Plaid pages at 500. Bounded so a pathological account cannot spin here.
  for (let page = 0; page < 10; page++) {
    const r = await callPlaid("/transactions/get", {
      access_token: token,
      start_date: fmt(start),
      end_date: fmt(end),
      options: { account_ids: [accountId], count: 500, offset },
    });
    const batch = r.transactions ?? [];
    for (const t of batch) {
      if (t.pending) continue;                     // pending money is not saved yet
      const cents = toCents(t.amount);
      if (cents === null) continue;
      out.push({ id: t.transaction_id, date: String(t.date).slice(0, 10), amount: -cents });
    }
    offset += batch.length;
    if (!batch.length || offset >= (r.total_transactions ?? offset)) break;
  }
  // Categories, merchants and descriptions are deliberately dropped: goal pace
  // needs the amount and the date, and nothing else.
  return { transactions: out, accountId };
}

async function routeUnlink(userId: string, body: any) {
  const itemId = body?.itemId ? String(body.itemId) : "";
  if (!itemId) throw new HttpError(400, "itemId required");
  const { token } = await itemToken(userId, itemId);
  // Tell Plaid to stop accessing the bank, then forget it here. Order matters:
  // if the remove call fails we keep the row so it can be retried rather than
  // orphaning a live connection we can no longer address.
  await callPlaid("/item/remove", { access_token: token });
  await db.from("plaid_accounts").delete().eq("user_id", userId).eq("item_id", itemId);
  await db.from("plaid_items").delete().eq("user_id", userId).eq("item_id", itemId);
  return { ok: true };
}

// ── webhook ────────────────────────────────────────────────────────────────

/**
 * Verifies Plaid's ES256 webhook signature per Plaid's documented scheme:
 * fetch the JWK for the token's `kid`, verify the signature, confirm the body
 * hash matches, and reject anything older than five minutes. An unverified
 * webhook is discarded — a POST from anywhere else can neither move data nor
 * make a stale balance look fresh.
 */
async function verifyWebhook(req: Request, rawBody: string): Promise<boolean> {
  const jwt = req.headers.get("plaid-verification");
  if (!jwt) return false;
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) return false;

  const b64urlToBytes = (x: string) =>
    Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(x.length / 4) * 4, "=")),
      (c) => c.charCodeAt(0));
  const b64urlToJson = (x: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(x)));

  let header: any, claims: any;
  try { header = b64urlToJson(h); claims = b64urlToJson(p); } catch { return false; }
  if (header.alg !== "ES256" || !header.kid) return false;

  let jwk: any;
  try {
    const r = await callPlaid("/webhook_verification_key/get", { key_id: header.kid });
    jwk = r.key;
  } catch { return false; }
  if (!jwk || jwk.expired_at) return false;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
  } catch { return false; }

  const okSig = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, key, b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!okSig) return false;

  // Replay window.
  if (typeof claims.iat !== "number" || Math.abs(Date.now() / 1000 - claims.iat) > 300) return false;

  // The signature covers the header and claims; this ties the claims to THIS body.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === claims.request_body_sha256;
}

/**
 * Plaid tells us the connection changed; we go and get the truth ourselves.
 * The webhook body is never treated as data — it is only a hint to re-read.
 */
async function handleWebhook(body: any) {
  const itemId = body?.item_id;
  if (!itemId) return { ok: true, ignored: "no item_id" };

  const { data: item } = await db.from("plaid_items")
    .select("user_id, item_id, access_token_enc, institution_name")
    .eq("item_id", itemId).maybeSingle();
  if (!item) return { ok: true, ignored: "unknown item" };

  const userId = item.user_id as string;
  const type = String(body.webhook_type ?? "");
  const code = String(body.webhook_code ?? "");
  const startedAt = new Date().toISOString();
  // Scoped by user_id as well as item_id. The uid came from the row we just
  // resolved, so this costs nothing and keeps "every write is user-scoped"
  // true without exception.
  await db.from("plaid_items").update({ last_webhook_at: startedAt })
    .eq("user_id", userId).eq("item_id", itemId);

  // Connection health. These are the states that must surface as "bank
  // connection needs attention" rather than a quietly stale number.
  if (type === "ITEM") {
    if (code === "ERROR") {
      const ec = body?.error?.error_code ?? "ITEM_ERROR";
      const reauth = ec === "ITEM_LOGIN_REQUIRED";
      await markItem(userId, itemId, reauth ? "reauth" : "error", ec);
      await audit(userId, { itemId, startedAt, status: "error", errorCode: ec });
      return { ok: true };
    }
    if (code === "PENDING_EXPIRATION" || code === "USER_PERMISSION_REVOKED" || code === "PENDING_DISCONNECT") {
      await markItem(userId, itemId, "reauth", code);
      await audit(userId, { itemId, startedAt, status: "error", errorCode: code });
      return { ok: true };
    }
    if (code === "LOGIN_REPAIRED" || code === "USER_ACCOUNT_REVOKED") {
      await markItem(userId, itemId, code === "LOGIN_REPAIRED" ? "ok" : "error", null);
      // fall through to a refresh on repair
    }
  }

  // Anything that means "the numbers moved" — go get them.
  const refreshWorthy = type === "TRANSACTIONS" ||
    (type === "ITEM" && (code === "LOGIN_REPAIRED" || code === "NEW_ACCOUNTS_AVAILABLE"));
  if (!refreshWorthy) return { ok: true };

  try {
    const token = await openToken(item.access_token_enc);
    await pullAccounts(userId, itemId, token, item.institution_name);
    await markItem(userId, itemId, "ok", null);
    await audit(userId, { itemId, startedAt, status: "ok" });
  } catch (e) {
    const pe = e instanceof PlaidError ? e : new PlaidError("SYNC_FAILED", "refresh failed", 502);
    await markItem(userId, itemId, pe.reauth ? "reauth" : "error", pe.code);
    await audit(userId, { itemId, startedAt, status: "error", errorCode: pe.code });
  }
  return { ok: true };
}

// ── entry ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, origin);

  const path = "/" + (new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "");
  const raw = await req.text();

  // The webhook is the one route Plaid calls, so it authenticates by signature
  // rather than by session.
  if (path === "/webhook") {
    if (!(await verifyWebhook(req, raw))) {
      return json({ error: "invalid webhook signature" }, 401, origin);
    }
    try {
      return json(await handleWebhook(JSON.parse(raw || "{}")), 200, origin);
    } catch {
      return json({ error: "webhook handling failed" }, 500, origin);
    }
  }

  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "invalid JSON" }, 400, origin); }

  try {
    const user = await requireUser(req);
    switch (path) {
      case "/status":       return json(await routeStatus(user.id), 200, origin);
      case "/link_token":   return json(await routeLinkToken(user.id, body), 200, origin);
      case "/exchange":     return json(await routeExchange(user.id, body), 200, origin);
      case "/accounts":     return json(await routeAccounts(user.id), 200, origin);
      case "/refresh":      return json(await routeRefresh(user.id, body), 200, origin);
      case "/transactions": return json(await routeTransactions(user.id, body), 200, origin);
      case "/unlink":       return json(await routeUnlink(user.id, body), 200, origin);
      default:              return json({ error: "unknown route" }, 404, origin);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status, origin);
    if (e instanceof PlaidError) {
      // Plaid's own message is safe to pass on — it is written for end users
      // and contains no credential material.
      return json({ error: e.message, code: e.code, reauth: e.reauth }, e.httpStatus >= 400 ? 502 : 500, origin);
    }
    // Anything unexpected: say nothing specific. An internal message could
    // carry configuration detail, and nothing here is worth leaking.
    console.error("joshos-plaid unhandled error");
    return json({ error: "unexpected server error", code: "INTERNAL" }, 500, origin);
  }
});
