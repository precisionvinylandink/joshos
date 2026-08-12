import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * joshos-bridge — the business side of the JoshOS integration.
 *
 *   DEPLOYED to precision-vinyl (siwotzlqfwgmhhnnnppc) as function `joshos-bridge`.
 *   This file is the source of truth; keep it identical to what is deployed.
 *
 *   GET  /work?since=<ISO>   -> { items, events, serverTime }
 *   POST /events             -> { ok, duplicate? }
 *
 * verify_jwt is DISABLED deliberately: JoshOS is not a Supabase auth user. It
 * authenticates with a scoped bearer token that this function validates itself
 * against joshos_bridge_tokens (sha-256 hashed, scoped, revocable). No Supabase
 * key of any kind — anon or service role — is ever given to JoshOS.
 *
 * Ownership rule enforced here: JoshOS events are recorded as ACTIVITY in the
 * existing activity_log. They never mutate quote/job/invoice status. Business
 * state belongs to the business system.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * "null" is the Origin an Electron renderer sends from a file:// page — the
 * JoshOS desktop app. Allowing it is safe here because CORS is NOT the access
 * control on this endpoint: every request needs an unguessable bearer token and
 * there are no cookies or other ambient credentials to be abused. A page that
 * lacks the token gets 401 whatever its origin. JOSHOS_ALLOWED_ORIGINS extends
 * the list for real web origins later.
 */
const ALLOWED_ORIGINS = [
  "null",
  ...(Deno.env.get("JOSHOS_ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "authorization, content-type";
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return h;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorize(req: Request, scope: string) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false as const, status: 401, error: "missing bearer token" };

  const { data, error } = await db
    .from("joshos_bridge_tokens")
    .select("id, scopes, revoked_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: "token lookup failed" };
  if (!data || data.revoked_at) return { ok: false as const, status: 401, error: "invalid token" };
  if (!data.scopes?.includes(scope)) return { ok: false as const, status: 403, error: "insufficient scope" };

  db.from("joshos_bridge_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id).then(() => {}, () => {});

  return { ok: true as const, tokenId: data.id };
}

/** snake_case row -> the WorkItem shape in the contract. */
function toWorkItem(r: Record<string, unknown>) {
  return {
    source: "workos",
    externalId: r.external_id,
    externalTable: r.external_table,
    business: r.business,
    type: r.type,
    title: r.title,
    status: r.raw_status ?? r.status,
    customerId: r.customer_id,
    contactId: r.contact_id,
    companyId: r.company_id,
    customerLabel: r.customer_label,
    companyLabel: r.company_label,
    amount: r.amount,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    wonAt: r.won_at,
    lostAt: r.lost_at,
    completedAt: r.completed_at,
    dueAt: r.due_at,
    lastActivityAt: r.last_activity_at,
    /*
     * Execution fields. Added 2026-08-12 for the order handoff; consumers that
     * predate them ignore unknown fields, so this is forward-compatible.
     *
     *   priority — normal | rush | urgent, straight off orders.priority
     *   rush     — the same fact as a boolean, so a consumer never has to know
     *              which raw values count as rush
     *   stages   — PVI's production lead-time CONFIG, not a schedule. JoshOS
     *              does the backward math and places the blocks; PVI owns the
     *              durations. A null leadDays means unconfigured, and the
     *              execution layer must raise a needs-scheduling task rather
     *              than invent one.
     */
    priority: r.priority,
    rush: r.rush,
    stages: r.stages,
  };
}

/** Terminal work is not JoshOS's problem. */
const OPEN = ["new", "in_progress", "prepared", "sent", "won", "scheduled", "in_production", "invoiced"];

async function handleWork(url: URL) {
  const since = url.searchParams.get("since");

  const { data: items, error: itemsErr } = await db
    .from("joshos_work_items").select("*")
    .in("status", OPEN)
    .order("last_activity_at", { ascending: false })
    .limit(500);
  if (itemsErr) throw new Error(`work_items: ${itemsErr.message}`);

  let events: unknown[] = [];
  if (since) {
    const { data: evs, error: evErr } = await db
      .from("joshos_work_events")
      .select("id, event_type, external_id, payload, created_at")
      .gt("created_at", since)
      .order("created_at", { ascending: true })
      .limit(500);
    if (evErr) throw new Error(`work_events: ${evErr.message}`);

    events = (evs ?? []).map((e) => ({
      id: e.id,
      type: e.event_type,
      at: e.created_at,
      data: toWorkItem(e.payload as Record<string, unknown>),
    }));

    const ids = (evs ?? []).map((e) => e.id);
    if (ids.length) {
      db.from("joshos_work_events")
        .update({ delivered_at: new Date().toISOString() })
        .in("id", ids).is("delivered_at", null).then(() => {}, () => {});
    }
  }

  return { items: (items ?? []).map(toWorkItem), events, serverTime: new Date().toISOString() };
}

/**
 * Record a JoshOS activity against the business record.
 *
 * Two writes, in this order:
 *   1. joshos_inbound_events — the idempotency ledger. Its primary key is what
 *      makes a retry safe; a duplicate short-circuits before anything else.
 *   2. activity_log — the EXISTING business activity model. We do not create a
 *      competing activity store.
 *
 * If (2) fails we roll back (1) so the event stays retryable, and we return 500.
 * Reporting success when the business write failed is the one thing this must
 * never do.
 */
async function handleEvent(req: Request) {
  let ev: Record<string, unknown> | null = null;
  try { ev = await req.json(); } catch { /* handled below */ }

  if (!ev || typeof ev.id !== "string" || typeof ev.type !== "string") {
    return { status: 400, body: { ok: false, error: "event requires string id and type" } };
  }

  const data = (ev.data ?? {}) as Record<string, unknown>;
  const externalId = typeof data.externalId === "string" ? data.externalId : null;

  const { error: ledgerErr } = await db.from("joshos_inbound_events").insert({
    id: ev.id,
    event_type: ev.type,
    external_id: externalId,
    payload: ev,
  });

  if (ledgerErr) {
    if (ledgerErr.code === "23505") return { status: 200, body: { ok: true, duplicate: true } };
    console.error("[joshos-bridge] ledger insert failed", ledgerErr.code, ledgerErr.message);
    return { status: 500, body: { ok: false, error: "could not record event" } };
  }

  // Resolve which business row this refers to, so activity_log.entity_type is
  // the real table rather than something JoshOS asserted.
  let entityTable: string | null = null;
  if (externalId) {
    const { data: row } = await db
      .from("joshos_work_items").select("external_table")
      .eq("external_id", externalId).maybeSingle();
    entityTable = row?.external_table ?? null;
  }

  const { error: actErr } = await db.from("activity_log").insert({
    action: ev.type,
    entity_type: entityTable,
    entity_id: externalId,
    metadata: {
      source: "joshos",
      event_id: ev.id,
      at: ev.at ?? null,
      // Personal execution facts. Deliberately NOT written to any business
      // status column — a work session starting is not a quote being sent.
      work_session: {
        startedAt: data.at ?? null,
        endedAt: data.endedAt ?? null,
        note: data.note ?? null,
      },
      action_kind: data.actionKind ?? null,
      rule_id: data.ruleId ?? null,
      completed_at: data.completedAt ?? null,
    },
  });

  if (actErr) {
    // Undo the ledger row so the retry is not swallowed as a duplicate.
    await db.from("joshos_inbound_events").delete().eq("id", ev.id);
    console.error("[joshos-bridge] activity_log insert failed", actErr.code, actErr.message);
    return { status: 500, body: { ok: false, error: "could not record activity" } };
  }

  return { status: 201, body: { ok: true, externalId } };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/joshos-bridge/, "") || "/";

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    if (req.method === "GET" && (path === "/work" || path === "/")) {
      const auth = await authorize(req, "work:read");
      if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers });
      return new Response(JSON.stringify(await handleWork(url)), { status: 200, headers });
    }

    if (req.method === "POST" && path === "/events") {
      const auth = await authorize(req, "events:write");
      if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers });
      const r = await handleEvent(req);
      return new Response(JSON.stringify(r.body), { status: r.status, headers });
    }

    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers });
  } catch (e) {
    // Detail server-side; opaque to the caller. Never leak schema or tokens.
    console.error("[joshos-bridge]", req.method, path, e);
    return new Response(JSON.stringify({ error: "internal error" }), { status: 500, headers });
  }
});

/* ── Minting a token (server-side; the plaintext is shown once) ──────────────
 *
 *   const token = 'jos_' + crypto.randomBytes(24).toString('hex');
 *   const hash  = crypto.createHash('sha256').update(token).digest('hex');
 *
 *   insert into joshos_bridge_tokens (name, token_hash) values ('joshos-desktop', '<hash>');
 *
 * Revoke:  update joshos_bridge_tokens set revoked_at = now() where name = '…';
 */
