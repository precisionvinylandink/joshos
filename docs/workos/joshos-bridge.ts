/**
 * JoshOS bridge — WorkOS-side endpoint (reference implementation).
 *
 *   Status : ** NOT DEPLOYED **. This is the contract made concrete.
 *   Deploy : supabase functions deploy joshos-bridge --project-ref siwotzlqfwgmhhnnnppc
 *   Runtime: Supabase Edge Function (Deno).
 *
 * Why this exists at all: the business project allows anonymous sign-ins and
 * grants the `anon` role privileged access, so handing JoshOS any key from that
 * project would expose business data to a browser. Everything privileged stays
 * here, server-side; JoshOS holds only a scoped bearer token.
 *
 * Required secrets (server-side only — never shipped to any client):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   JOSHOS_ALLOWED_ORIGINS   comma-separated; omit to disallow browser origins
 *
 * Endpoints:
 *   GET  /work?since=<ISO>   -> { items, events, serverTime }
 *   POST /events             -> { ok: true, duplicate?: true }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('JOSHOS_ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Only echo an Origin we explicitly allow. Never `*` — this serves business data. */
function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'authorization, content-type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  }
  return h;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time-ish comparison happens in Postgres via the unique hash lookup. */
async function authorize(req: Request, scope: string) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { ok: false as const, status: 401, error: 'missing bearer token' };

  const hash = await sha256Hex(token);
  const { data, error } = await db
    .from('joshos_bridge_tokens')
    .select('id, scopes, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: 'token lookup failed' };
  if (!data || data.revoked_at) return { ok: false as const, status: 401, error: 'invalid token' };
  if (!data.scopes?.includes(scope)) return { ok: false as const, status: 403, error: 'insufficient scope' };

  // Best-effort; never fail the request because the audit write failed.
  db.from('joshos_bridge_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id).then(() => {}, () => {});

  return { ok: true as const, tokenId: data.id };
}

/** DB row (snake_case) -> the WorkItem shape in the contract (camelCase). */
function toWorkItem(r: Record<string, unknown>) {
  return {
    source: 'workos',
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
    nextAction: r.next_action,
    nextActionDueAt: r.next_action_due_at,
  };
}

/** Terminal work is not JoshOS's problem; keep the payload small and relevant. */
const OPEN_STATUSES = [
  'new', 'in_progress', 'prepared', 'sent', 'won', 'scheduled', 'in_production',
  'completed', 'invoiced',
];

async function handleWork(url: URL) {
  const since = url.searchParams.get('since');

  const { data: items, error: itemsErr } = await db
    .from('joshos_work_items')
    .select('*')
    .in('status', OPEN_STATUSES)
    .order('last_activity_at', { ascending: false })
    .limit(500);
  if (itemsErr) throw new Error(`work_items: ${itemsErr.message}`);

  let events: unknown[] = [];
  if (since) {
    const { data: evs, error: evErr } = await db
      .from('joshos_work_events')
      .select('id, event_type, external_id, payload, created_at')
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(500);
    if (evErr) throw new Error(`work_events: ${evErr.message}`);
    events = (evs ?? []).map((e) => ({
      id: e.id,                        // stable — JoshOS dedupes on this
      type: e.event_type,
      at: e.created_at,
      data: toWorkItem(e.payload as Record<string, unknown>),
    }));
  }

  return {
    items: (items ?? []).map(toWorkItem),
    events,
    serverTime: new Date().toISOString(),
  };
}

/**
 * JoshOS retries, so duplicates WILL arrive. The primary key on
 * joshos_inbound_events is the idempotency guarantee; a replay is reported as
 * accepted (so JoshOS stops retrying) but explicitly marked `duplicate`.
 */
async function handleEvent(req: Request) {
  const ev = await req.json().catch(() => null);
  if (!ev?.id || !ev?.type) {
    return { status: 400, body: { ok: false, error: 'event requires id and type' } };
  }

  const { error } = await db.from('joshos_inbound_events').insert({
    id: ev.id,
    event_type: ev.type,
    external_id: ev.data?.externalId ?? null,
    payload: ev,
  });

  if (error) {
    if (error.code === '23505') return { status: 200, body: { ok: true, duplicate: true } };
    return { status: 500, body: { ok: false, error: 'could not record event' } };
  }

  // Business reactions belong here (e.g. append to activity_log). They are
  // WorkOS's decision — JoshOS asserts only that Josh did something.
  //
  //   await db.from('activity_log').insert({
  //     action: ev.type, entity_type: ev.data?.externalTable,
  //     entity_id: ev.data?.externalId, metadata: ev.data,
  //   });

  return { status: 201, body: { ok: true } };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/joshos-bridge/, '') || '/';

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  try {
    if (req.method === 'GET' && path === '/work') {
      const auth = await authorize(req, 'work:read');
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers });
      }
      return new Response(JSON.stringify(await handleWork(url)), { status: 200, headers });
    }

    if (req.method === 'POST' && path === '/events') {
      const auth = await authorize(req, 'events:write');
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers });
      }
      const r = await handleEvent(req);
      return new Response(JSON.stringify(r.body), { status: r.status, headers });
    }

    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers });
  } catch (e) {
    // Log server-side with detail; return an opaque message. Never leak schema
    // details or anything token-shaped to the caller.
    console.error('[joshos-bridge]', req.method, path, e);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500, headers });
  }
});

/* ── Minting a token (run once, server-side; store the plaintext in JoshOS) ──
 *
 *   const token = 'jos_' + crypto.randomUUID().replace(/-/g, '');
 *   // sha256 hex of `token` goes in the table; the plaintext is shown ONCE.
 *   insert into joshos_bridge_tokens (name, token_hash)
 *   values ('joshos-desktop', '<sha256-hex>');
 *
 * Revoke:  update joshos_bridge_tokens set revoked_at = now() where name = '…';
 */
