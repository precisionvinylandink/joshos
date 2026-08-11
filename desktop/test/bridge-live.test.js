/**
 * Live bridge integration test — runs against the REAL business system.
 *
 *   precision-vinyl (Supabase)  <->  joshos-bridge (edge function)  <->  JoshOS engine
 *
 * This is not a mock. It calls the deployed endpoint with a real scoped token
 * and drives the real `quote_requests` row for the Heather Moore / City of Elgin
 * enquiry through its lifecycle.
 *
 * Deliberately PHASED. JoshOS cannot change business status — that is the whole
 * ownership rule — so the business transitions happen out-of-band in the
 * business system, and each phase asserts what JoshOS derives from them:
 *
 *   phase 1  request is `new`      -> resolve, start a work session, push it
 *   phase 2  request is `quoted`   -> follow-up derived from sent_at
 *   phase 3  request is `approved` -> follow-up superseded, invoice derived
 *
 * The JoshOS-side store persists between phases in a scratch file, exactly as
 * appData would on the desktop.
 *
 *   BRIDGE_URL=... BRIDGE_TOKEN=... node desktop/test/bridge-live.test.js <phase>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRIDGE_URL = process.env.BRIDGE_URL;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const PHASE = Number(process.argv[2] || 1);
const STORE = process.env.BRIDGE_STORE || path.join(require('os').tmpdir(), 'joshos-bridge-live.json');

const TARGET = 'b6497497-fa6b-43bd-984e-7f65e5fabb10'; // the real quote_requests row
const WORK_STARTED = '2026-08-11T21:15:00.000Z';       // 4:15 PM America/Chicago

if (!BRIDGE_URL || !BRIDGE_TOKEN) {
  console.error('BRIDGE_URL and BRIDGE_TOKEN are required');
  process.exit(2);
}

// ── load the shipped engine, same as the unit tests ────────────────────────
function loadEngine() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const from = html.indexOf('var WOB=', html.indexOf('WORKOS-BRIDGE:BEGIN'));
  const code = html.slice(from, html.indexOf('/* WORKOS-BRIDGE:END */'));
  const ctx = { console, Promise, Math, Date, Number, String, Object, Array, JSON };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'workos-bridge.js' });
  return ctx.WOB;
}
const WOB = loadEngine();

// ── the same transport JoshOS uses, in Node ───────────────────────────────
const transport = {
  async fetchWork({ since } = {}) {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    const r = await fetch(`${BRIDGE_URL}/work${q}`, {
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
    });
    if (!r.ok) throw new Error(`bridge ${r.status} ${r.statusText}`);
    return r.json();
  },
  async send(ev) {
    const r = await fetch(`${BRIDGE_URL}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    });
    if (!r.ok) throw new Error(`bridge ${r.status} ${r.statusText}`);
    return r.json();
  },
};

// ── harness ────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const fails = [];
function check(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; fails.push({ name, e }); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const eq = (a, b, w) => { if (a !== b) throw new Error(`${w}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, w) => { if (!c) throw new Error(w); };

const loadStore = () => (fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : {});
const saveStore = (app) => fs.writeFileSync(STORE, JSON.stringify(app, null, 2));
const localId = () => WOB.refId('workos', TARGET);
const days = (t, n) => new Date(new Date(t).getTime() + n * 864e5).toISOString();

async function main() {
  const app = loadStore();
  const w = WOB.ensure(app);
  const now = new Date().toISOString();

  console.log(`\nLive bridge test — phase ${PHASE}\n`);

  // Every phase begins by pulling real business state through the real bridge.
  const pulled = await WOB.pull(w, transport, now);
  check('bridge reachable and pull succeeded', () => {
    eq(pulled.ok, true, 'pull.ok');
    eq(w.sync.status, 'ok', 'sync status');
  });

  const it = w.items[localId()];
  check('the real business record is present, keyed by its true primary key', () => {
    ok(it, 'item present');
    eq(it.externalId, TARGET, 'externalId is the quote_requests uuid');
    eq(it.externalTable, 'quote_requests', 'authoritative table');
    eq(it.business, 'PVI', 'business');
  });

  if (PHASE === 1) {
    check('1. natural language resolves to the existing record, creating nothing', () => {
      const before = Object.keys(w.items).length;
      const r = WOB.resolveActivity(w, 'Sending an email to Heather Moore with City of Elgin', now);
      ok(r.best, 'resolved');
      eq(r.best.externalId, TARGET, 'resolved to the real uuid');
      eq(Object.keys(w.items).length, before, 'no record invented');
    });

    check('2-3. work session starts at 4:15 PM CT and references the business record', () => {
      const s = WOB.startSession(w, {
        workItemId: localId(), at: WORK_STARTED,
        note: 'Sending an email to Heather Moore with City of Elgin', source: 'joshos',
      });
      ok(s.created, 'session created');
      eq(s.session.workItemId, localId(), 'session references the work item');
      eq(w.items[localId()].startedAt, WORK_STARTED, 'startedAt is the execution clock');
      WOB.enqueue(w, 'work_session.started', {
        workItemId: localId(), externalId: TARGET, source: 'workos',
        at: WORK_STARTED, note: 'Sending an email to Heather Moore with City of Elgin',
      }, now);
    });

    const flushed = await WOB.flushOutbox(w, transport, new Date().toISOString());
    check('4. the session reaches the business system', () => {
      eq(flushed.sent, 1, 'events accepted');
      eq(flushed.failed, 0, 'no failures');
      eq(w.outbox[0].status, 'sent', 'marked sent only after the bridge confirmed');
    });

    // Idempotency against the LIVE endpoint, not a stub.
    const replay = { ...w.outbox[0], status: 'pending', attempts: 0, lastAttemptAt: null };
    const res = await transport.send(replay);
    check('replaying the same event id is rejected as a duplicate', () => {
      eq(res.duplicate, true, 'bridge reports duplicate');
    });

    check('business status is untouched by JoshOS activity', () => {
      eq(w.items[localId()].status, 'new', 'still new — a work session is not a send');
      ok(!w.items[localId()].sentAt, 'customer clock has not started');
    });
  }

  if (PHASE === 2) {
    check('5-6. business marked it sent; JoshOS received sent_at', () => {
      eq(it.status, 'sent', 'canonical status (raw "quoted")');
      ok(it.sentAt, 'sentAt present');
    });

    check('the two clocks are independent', () => {
      const c = WOB.clocks(w, it, now);
      eq(c.startedAt, WORK_STARTED, 'execution clock preserved from phase 1');
      ok(c.sentAt && c.sentAt !== c.startedAt, 'customer clock is a different instant');
    });

    check('7-8. follow-up derived and on the calendar, carrying the WorkOS id', () => {
      const fu = WOB.actionsFor(w, localId()).filter((a) => a.kind === 'follow_up')[0];
      ok(fu, 'follow-up derived');
      eq(fu.dueAt, days(it.sentAt, 3), 'due 3 days after sent');
      const cal = WOB.calendarItems(w, now, { days: 14 });
      const c = cal.filter((x) => x.kind === 'follow_up')[0];
      ok(c, 'on the calendar');
      eq(c.externalId, TARGET, 'calendar item keeps the business id');
      console.log(`        calendar: "${c.title}"  due ${c.dueAt.slice(0, 10)}`);
      ok(/Heather Moore|City of Elgin/.test(c.title), 'names the customer/organisation');
    });

    check('waiting on the customer is not procrastination', () => {
      const cls = WOB.classify(w, it, now);
      eq(cls.state, 'awaiting_customer', 'state');
      eq(cls.owner, 'customer', 'owner');
      eq(cls.stale, false, 'not flagged as Josh procrastinating');
    });
  }

  if (PHASE === 3) {
    check('9. approved: the follow-up is superseded, not left open', () => {
      eq(it.status, 'won', 'canonical status (raw "approved")');
      const open = WOB.actionsFor(w, localId());
      eq(open.filter((a) => a.kind === 'follow_up').length, 0, 'follow-up retired');
    });

    check('10-11. "Send invoice" is derived and lands on the calendar', () => {
      const inv = WOB.actionsFor(w, localId()).filter((a) => a.kind === 'send_invoice')[0];
      ok(inv, 'send_invoice derived');
      eq(inv.owner, 'josh', 'owned by Josh');
      const c = WOB.calendarItems(w, now, { days: 14 }).filter((x) => x.kind === 'send_invoice')[0];
      ok(c, 'on the calendar');
      eq(c.externalId, TARGET, 'still the same business record');
      console.log(`        calendar: "${c.title}"  due ${c.dueAt.slice(0, 10)}`);
    });

    check('one business record throughout, three execution actions', () => {
      eq(Object.keys(w.items).filter((k) => w.items[k].externalId === TARGET).length, 1,
        'exactly one local record for the business record');
      const kinds = [...new Set(w.actions.filter((a) => a.workItemId === localId()).map((a) => a.kind))];
      ok(kinds.length >= 2, `multiple execution views: ${kinds.join(', ')}`);
      console.log(`        execution actions derived: ${kinds.join(' → ')}`);
    });

    check('execution history survived the whole chain', () => {
      eq(WOB.sessionsFor(w, localId()).length, 1, 'the 4:15 PM session is still there');
      eq(w.items[localId()].startedAt, WORK_STARTED, 'startedAt never overwritten by business events');
    });
  }

  saveStore(app);

  console.log(`\n${'─'.repeat(58)}\n  phase ${PHASE}: ${pass} passed, ${fail} failed\n${'─'.repeat(58)}\n`);
  if (fail) { fails.forEach((f) => console.log(`FAILED: ${f.name}\n${f.e.stack}\n`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
