/**
 * WorkOS bridge — integration tests.
 *
 * These run against the SHIPPED engine: the block between WORKOS-BRIDGE:BEGIN
 * and WORKOS-BRIDGE:END is extracted from desktop/src/index.html and executed
 * in a vm context. There is no second copy of the logic to drift from, and the
 * single-file architecture is preserved.
 *
 *   node desktop/test/workos-bridge.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'index.html');

function loadEngine() {
  const html = fs.readFileSync(SRC, 'utf8');
  const begin = html.indexOf('WORKOS-BRIDGE:BEGIN');
  const end = html.indexOf('/* WORKOS-BRIDGE:END */');
  if (begin < 0 || end < 0) throw new Error('WorkOS bridge markers not found in index.html');
  // Start from the `var WOB=` that follows the banner comment.
  const from = html.indexOf('var WOB=', begin);
  const code = html.slice(from, end);
  const ctx = { console, Promise, Math, Date, Number, String, Object, Array, JSON };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'workos-bridge.js' });
  if (!ctx.WOB) throw new Error('engine did not define WOB');
  return ctx.WOB;
}

const WOB = loadEngine();

// ── tiny harness ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  PASS  ${name}`); })
    .catch((e) => {
      failed++; failures.push({ name, error: e });
      console.log(`  FAIL  ${name}`);
      console.log(`        ${e && e.message}`);
    });
}
function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what || 'value'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(cond, what) { if (!cond) throw new Error(what || 'expected truthy'); }

// ── fixtures ───────────────────────────────────────────────────────────────
const T0 = '2026-08-11T21:15:00.000Z'; // Aug 11 2026, ~4:15 PM CT
const at = (isoBase, mins) => new Date(new Date(isoBase).getTime() + mins * 60000).toISOString();
const days = (isoBase, n) => new Date(new Date(isoBase).getTime() + n * 864e5).toISOString();

function freshState() { const app = {}; return WOB.ensure(app); }

/**
 * The integration scenario from the brief. Deliberately built from a WorkOS
 * payload with a real external id — nothing here is invented by JoshOS, and
 * the names are fixture data only, never referenced by production logic.
 */
function elginQuote(overrides) {
  return Object.assign({
    source: 'workos',
    externalId: 'q_8f21c4de-0000-4000-8000-000000000001',
    externalTable: 'pvi_quotes',
    business: 'PVI',
    type: 'quote',
    title: 'Vehicle decals — quote request',
    status: 'new',
    customerId: 'c_11111111-0000-4000-8000-000000000001',
    contactId: 'ct_22222222-0000-4000-8000-000000000001',
    companyId: 'co_33333333-0000-4000-8000-000000000001',
    customerLabel: 'Heather Moore',
    companyLabel: 'City of Elgin',
    createdAt: days(T0, -1)
  }, overrides || {});
}

const evt = (id, type, data, atTs) => ({ id, type, data, at: atTs || T0 });

// ── tests ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('\nWorkOS bridge — integration tests\n');

  console.log('Test 1 — Start work on an existing WorkOS quote');
  await check('work session is created and references the WorkOS id', () => {
    const w = freshState();
    const { item } = WOB.upsertItem(w, elginQuote(), T0);
    ok(item, 'item upserted');
    const r = WOB.startSession(w, { workItemId: item.id, at: T0 });
    ok(r.created, 'session created');
    eq(r.session.workItemId, item.id, 'session.workItemId');
    eq(w.items[item.id].externalId, elginQuote().externalId, 'external id retained');
    eq(w.items[item.id].startedAt, T0, 'startedAt set from session start');
    eq(WOB.sessionsFor(w, item.id).length, 1, 'session count');
  });

  console.log('\nTest 2 — Duplicate start event is idempotent');
  await check('same event id twice yields ONE session', () => {
    const w = freshState();
    WOB.upsertItem(w, elginQuote(), T0);
    const id = WOB.refId('workos', elginQuote().externalId);
    const e = evt('ev_start_1', 'work_session.started', { workItemId: id, at: T0 });
    const a = WOB.applyEvent(w, e, T0);
    const b = WOB.applyEvent(w, e, T0);
    ok(a.applied, 'first applied');
    eq(b.applied, false, 'second applied');
    eq(b.reason, 'duplicate', 'duplicate reason');
    eq(WOB.sessionsFor(w, id).length, 1, 'session count after replay');
  });
  await check('a second distinct event cannot open a second concurrent session', () => {
    const w = freshState();
    WOB.upsertItem(w, elginQuote(), T0);
    const id = WOB.refId('workos', elginQuote().externalId);
    WOB.applyEvent(w, evt('ev_a', 'work_session.started', { workItemId: id, at: T0 }), T0);
    WOB.applyEvent(w, evt('ev_b', 'work_session.started', { workItemId: id, at: at(T0, 5) }), at(T0, 5));
    eq(WOB.sessionsFor(w, id).filter(s => !s.endedAt).length, 1, 'open sessions');
  });

  console.log('\nTest 3 — Quote sent generates a follow-up');
  await check('quote.sent produces exactly one follow_up action', () => {
    const w = freshState();
    const sentAt = at(T0, 17);
    const r = WOB.applyEvent(w, evt('ev_sent_1', 'quote.sent',
      elginQuote({ status: 'sent', sentAt })), sentAt);
    ok(r.applied, 'applied');
    const acts = WOB.actionsFor(w, r.item.id).filter(a => a.kind === 'follow_up');
    eq(acts.length, 1, 'follow_up count');
    eq(acts[0].dueAt, days(sentAt, 3), 'due 3 days after sentAt');
    eq(w.items[r.item.id].sentAt, sentAt, 'sentAt recorded');
  });
  await check('replaying quote.sent does not create a second follow-up', () => {
    const w = freshState();
    const sentAt = at(T0, 17);
    const e = evt('ev_sent_2', 'quote.sent', elginQuote({ status: 'sent', sentAt }));
    WOB.applyEvent(w, e, sentAt);
    WOB.applyEvent(w, e, sentAt);
    const id = WOB.refId('workos', elginQuote().externalId);
    eq(WOB.actionsFor(w, id).filter(a => a.kind === 'follow_up').length, 1, 'follow_up count');
  });
  await check('the two clocks are independent', () => {
    const w = freshState();
    const { item } = WOB.upsertItem(w, elginQuote(), T0);
    WOB.startSession(w, { workItemId: item.id, at: T0 });           // execution clock
    const sentAt = at(T0, 17);
    WOB.upsertItem(w, elginQuote({ status: 'sent', sentAt }), sentAt); // customer clock
    const now = days(T0, 5);
    const c = WOB.clocks(w, w.items[item.id], now);
    eq(c.startedAt, T0, 'startedAt');
    eq(c.sentAt, sentAt, 'sentAt');
    ok(c.openMs > c.awaitingMs, 'open clock older than awaiting clock');
    ok(Math.round(c.openMs / 864e5) === 5, 'open ~5 days');
  });

  console.log('\nTest 4 — Follow-up due, and completing it updates work state');
  await check('follow-up becomes due and appears on the calendar', () => {
    const w = freshState();
    const sentAt = T0;
    const r = WOB.applyEvent(w, evt('ev_s4', 'quote.sent',
      elginQuote({ status: 'sent', sentAt })), sentAt);
    const now = days(sentAt, 3);
    const cal = WOB.calendarItems(w, now, { days: 7 });
    const fu = cal.filter(c => c.kind === 'follow_up')[0];
    ok(fu, 'follow-up on calendar');
    eq(fu.externalId, elginQuote().externalId, 'calendar item keeps WorkOS id');
    eq(fu.label, 'City of Elgin', 'human label present');
    const cls = WOB.classify(w, w.items[r.item.id], now);
    eq(cls.state, 'follow_up_due', 'classified as follow_up_due');
    eq(cls.owner, 'josh', 'owner flips to josh when the action is due');
  });
  await check('completing the action records it and enqueues an outbound event', () => {
    const w = freshState();
    const sentAt = T0;
    const r = WOB.applyEvent(w, evt('ev_s4b', 'quote.sent',
      elginQuote({ status: 'sent', sentAt })), sentAt);
    const now = days(sentAt, 3);
    const act = WOB.actionsFor(w, r.item.id).filter(a => a.kind === 'follow_up')[0];
    const done = WOB.completeAction(w, act.id, now, { note: 'called, left voicemail' });
    ok(done.completed, 'completed');
    eq(WOB.actionsFor(w, r.item.id).filter(a => a.kind === 'follow_up').length, 0, 'no longer open');
    eq(done.event.type, 'calendar_action.completed', 'outbound event type');
    eq(done.event.data.externalId, elginQuote().externalId, 'outbound carries WorkOS id');
    eq(done.event.status, 'pending', 'pending until WorkOS accepts');
    // Business status is WorkOS's to decide — JoshOS must not have advanced it.
    eq(w.items[r.item.id].status, 'sent', 'business status untouched locally');
  });
  await check('completing the same action twice is a no-op', () => {
    const w = freshState();
    const r = WOB.applyEvent(w, evt('ev_s4c', 'quote.sent',
      elginQuote({ status: 'sent', sentAt: T0 })), T0);
    const act = WOB.actionsFor(w, r.item.id).filter(a => a.kind === 'follow_up')[0];
    const now = days(T0, 3);
    WOB.completeAction(w, act.id, now);
    const second = WOB.completeAction(w, act.id, now);
    eq(second.completed, false, 'second completion');
    eq(second.reason, 'already_completed', 'reason');
    eq(w.outbox.filter(e => e.type === 'calendar_action.completed').length, 1, 'one outbound event');
  });

  console.log('\nTest 5 — Quote won derives "send invoice"');
  await check('quote.won produces a send_invoice action on the calendar', () => {
    const w = freshState();
    const sentAt = T0, wonAt = days(T0, 2);
    WOB.applyEvent(w, evt('ev_s5a', 'quote.sent', elginQuote({ status: 'sent', sentAt })), sentAt);
    const r = WOB.applyEvent(w, evt('ev_s5b', 'quote.won',
      elginQuote({ status: 'won', sentAt, wonAt })), wonAt);
    const acts = WOB.actionsFor(w, r.item.id);
    const inv = acts.filter(a => a.kind === 'send_invoice')[0];
    ok(inv, 'send_invoice derived');
    eq(inv.owner, 'josh', 'owned by josh');
    eq(acts.filter(a => a.kind === 'follow_up').length, 0, 'follow-up no longer applies once won');
    const cal = WOB.calendarItems(w, wonAt, { days: 7 });
    ok(cal.some(c => c.kind === 'send_invoice' && c.externalId === elginQuote().externalId),
      'invoice action on calendar with WorkOS id');
  });

  console.log('\nTest 6 — Stale work is identified');
  await check('started 7 days ago, never finished ⇒ stale', () => {
    const w = freshState();
    const { item } = WOB.upsertItem(w, elginQuote({ status: 'in_progress' }), T0);
    WOB.startSession(w, { workItemId: item.id, at: T0 });
    WOB.endSession(w, { workItemId: item.id, at: at(T0, 45) });
    const now = days(T0, 7);
    const cls = WOB.classify(w, w.items[item.id], now);
    eq(cls.state, 'in_progress', 'state');
    eq(cls.stale, true, 'stale');
    eq(cls.openDays, 7, 'open days');
    eq(cls.owner, 'josh', 'owner');
    ok(/open_7d/.test(cls.staleReason), 'stale reason names the clock');
  });
  await check('never started and sitting for days is distinguished from started', () => {
    const w = freshState();
    const { item } = WOB.upsertItem(w, elginQuote({ createdAt: days(T0, -5) }), T0);
    const cls = WOB.classify(w, w.items[item.id], T0);
    eq(cls.state, 'unstarted', 'state');
    eq(cls.stale, true, 'stale');
    ok(/never_started/.test(cls.staleReason), 'reason distinguishes unstarted');
  });

  console.log('\nTest 7 — Waiting for the customer is NOT procrastination');
  await check('sent 5 days ago, follow-up not yet due ⇒ awaiting_customer, not stale', () => {
    const w = freshState();
    const sentAt = T0;
    const r = WOB.applyEvent(w, evt('ev_s7', 'quote.sent',
      elginQuote({ status: 'sent', sentAt, followUpDays: 10 })), sentAt);
    const now = days(sentAt, 5);
    const cls = WOB.classify(w, w.items[r.item.id], now);
    eq(cls.state, 'awaiting_customer', 'state');
    eq(cls.owner, 'customer', 'owner is the customer');
    eq(cls.stale, false, 'NOT flagged stale');
    eq(cls.staleReason, null, 'no stale reason');
    eq(cls.awaitingDays, 5, 'awaiting days tracked separately');
  });
  await check('awaiting work does not surface in the attention list', () => {
    const w = freshState();
    WOB.applyEvent(w, evt('ev_s7b', 'quote.sent',
      elginQuote({ status: 'sent', sentAt: T0, followUpDays: 10 })), T0);
    const att = WOB.attention(w, days(T0, 5));
    eq(att.length, 0, 'nothing demanding Josh');
  });
  await check('but once the follow-up is overdue it becomes his', () => {
    const w = freshState();
    const r = WOB.applyEvent(w, evt('ev_s7c', 'quote.sent',
      elginQuote({ status: 'sent', sentAt: T0 })), T0);
    const now = days(T0, 6); // due at +3
    const cls = WOB.classify(w, w.items[r.item.id], now);
    eq(cls.state, 'follow_up_overdue', 'state');
    eq(cls.owner, 'josh', 'owner');
    eq(cls.stale, true, 'overdue follow-up is a real signal');
    eq(WOB.attention(w, now).length, 1, 'surfaces for attention');
  });

  console.log('\nTest 8 — WorkOS unavailable: no fake success');
  await check('failed send stays pending, records the error, reports failure', async () => {
    const w = freshState();
    WOB.upsertItem(w, elginQuote(), T0);
    WOB.enqueue(w, 'work_session.started', { externalId: elginQuote().externalId }, T0);
    const transport = { send: () => Promise.reject(new Error('ECONNREFUSED')) };
    const res = await WOB.flushOutbox(w, transport, T0);
    eq(res.sent, 0, 'nothing reported sent');
    eq(res.failed, 1, 'one failure');
    eq(res.pending, 1, 'still pending for retry');
    eq(w.outbox[0].status, 'pending', 'not marked sent');
    ok(/ECONNREFUSED/.test(w.outbox[0].lastError), 'error recorded');
    eq(w.sync.status, 'error', 'sync marked failed');
  });
  await check('a failed pull marks data stale and does not discard it', async () => {
    const w = freshState();
    WOB.upsertItem(w, elginQuote(), T0);
    const transport = { fetchWork: () => Promise.reject(new Error('503 unavailable')) };
    const res = await WOB.pull(w, transport, days(T0, 1));
    eq(res.ok, false, 'pull reports failure');
    eq(w.sync.status, 'error', 'sync status');
    eq(Object.keys(w.items).length, 1, 'cached item retained');
    eq(w.items[WOB.refId('workos', elginQuote().externalId)].syncStatus, 'stale', 'marked stale');
  });
  await check('retry after recovery succeeds and clears the error', async () => {
    const w = freshState();
    WOB.enqueue(w, 'work_session.started', { externalId: 'x' }, T0);
    await WOB.flushOutbox(w, { send: () => Promise.reject(new Error('down')) }, T0);
    eq(w.outbox[0].status, 'pending', 'pending after failure');
    // Backoff elapsed.
    const later = at(T0, 10);
    const res = await WOB.flushOutbox(w, { send: () => Promise.resolve({ ok: true }) }, later);
    eq(res.sent, 1, 'sent on retry');
    eq(w.outbox[0].status, 'sent', 'marked sent');
    eq(w.sync.status, 'ok', 'sync recovered');
  });
  await check('with no bridge configured nothing is claimed as synced', async () => {
    const w = freshState();
    WOB.enqueue(w, 'work_session.started', { externalId: 'x' }, T0);
    const res = await WOB.flushOutbox(w, null, T0);
    eq(res.sent, 0, 'nothing sent');
    eq(w.sync.status, 'not_configured', 'status is explicit');
    eq(w.outbox[0].status, 'pending', 'still pending');
  });

  console.log('\nTest 9 — Natural-language activity resolves to the EXISTING record');
  await check('"Sending Heather Moore the City of Elgin quote" attaches to the existing quote', () => {
    const w = freshState();
    const { item } = WOB.upsertItem(w, elginQuote(), T0);
    const before = Object.keys(w.items).length;
    const r = WOB.resolveActivity(w, 'Sending Heather Moore the City of Elgin quote', T0);
    ok(r.best, 'resolved');
    eq(r.best.id, item.id, 'resolved to the existing item');
    eq(r.best.externalId, elginQuote().externalId, 'identity is the WorkOS id');
    eq(Object.keys(w.items).length, before, 'NO new record created');
    eq(r.unresolved, false, 'marked resolved');
  });
  await check('resolution never invents a record when nothing matches', () => {
    const w = freshState();
    WOB.upsertItem(w, elginQuote(), T0);
    const r = WOB.resolveActivity(w, 'Renewing the drone certification paperwork', T0);
    eq(r.best, null, 'no match');
    eq(r.unresolved, true, 'flagged unresolved for later linking');
    eq(Object.keys(w.items).length, 1, 'nothing created');
  });
  await check('ambiguity between two similar records is refused, not guessed', () => {
    const w = freshState();
    WOB.upsertItem(w, elginQuote(), T0);
    WOB.upsertItem(w, elginQuote({
      externalId: 'q_8f21c4de-0000-4000-8000-000000000002',
      title: 'Banner reprint — quote request'
    }), T0);
    const r = WOB.resolveActivity(w, 'City of Elgin quote for Heather Moore', T0);
    eq(r.best, null, 'no confident winner');
    eq(r.ambiguous, true, 'flagged ambiguous');
    ok(r.candidates.length >= 2, 'candidates offered for manual linking');
  });
  await check('identity survives a rename in WorkOS', () => {
    const w = freshState();
    const { item } = WOB.upsertItem(w, elginQuote(), T0);
    const { item: again, created } = WOB.upsertItem(w, elginQuote({
      companyLabel: 'City of Elgin — Public Works',
      customerLabel: 'Heather Moore-Ramirez'
    }), days(T0, 1));
    eq(created, false, 'not treated as a new record');
    eq(again.id, item.id, 'same local id');
    eq(Object.keys(w.items).length, 1, 'no fork');
  });

  console.log('\nEnd-to-end — the full chain from the brief');
  await check('request → work → sent → follow-up → won → invoice, one business record', () => {
    const w = freshState();
    const ext = elginQuote().externalId;

    // 1. WorkOS records the online quote request.
    WOB.applyEvent(w, evt('e1', 'quote.created', elginQuote({ status: 'new' })), T0);
    const id = WOB.refId('workos', ext);

    // 2. Josh starts work at 4:15 PM.
    WOB.startSession(w, { workItemId: id, at: T0 });
    eq(w.items[id].startedAt, T0, 'work session begins');

    // 3. He sends it at 4:32 PM; WorkOS marks it sent.
    const sentAt = at(T0, 17);
    WOB.endSession(w, { workItemId: id, at: sentAt });
    WOB.applyEvent(w, evt('e2', 'quote.sent', elginQuote({ status: 'sent', sentAt })), sentAt);
    eq(w.items[id].sentAt, sentAt, 'sentAt recorded');

    // 4. Follow-up lands on the calendar.
    const fu = WOB.actionsFor(w, id).filter(a => a.kind === 'follow_up')[0];
    ok(fu, 'follow-up derived');

    // 5. Ignored → overdue.
    const late = days(sentAt, 5);
    eq(WOB.classify(w, w.items[id], late).state, 'follow_up_overdue', 'overdue');

    // 6. Customer accepts.
    const wonAt = days(sentAt, 6);
    WOB.applyEvent(w, evt('e3', 'quote.won', elginQuote({ status: 'won', sentAt, wonAt })), wonAt);
    ok(WOB.actionsFor(w, id).some(a => a.kind === 'send_invoice'), 'invoice action derived');

    // 7. Throughout: exactly one business record, three execution actions.
    eq(Object.keys(w.items).length, 1, 'ONE business record');
    const kinds = w.actions.map(a => a.kind).sort();
    ok(kinds.indexOf('send_invoice') >= 0 && kinds.indexOf('follow_up') >= 0,
      'multiple execution views of one record');
    // 8. Execution history reflects what he actually did.
    eq(WOB.sessionsFor(w, id).length, 1, 'session history retained');
    ok(WOB.clocks(w, w.items[id], wonAt).workedMs === 17 * 60000, 'worked time measured');
  });

  console.log('\nHardening');
  await check('unknown status matches no rule rather than guessing', () => {
    const w = freshState();
    const { item } = WOB.upsertItem(w, elginQuote({ status: 'awaiting_legal_review' }), T0);
    eq(item.status, 'awaiting_legal_review', 'preserved verbatim');
    eq(WOB.deriveActions(item, T0).length, 0, 'no action invented');
  });
  await check('event without an id is rejected', () => {
    const w = freshState();
    const r = WOB.applyEvent(w, { type: 'quote.sent', data: elginQuote() }, T0);
    eq(r.applied, false, 'rejected');
    eq(r.reason, 'missing_event_id', 'reason');
  });
  await check('payload without an externalId cannot create a record', () => {
    const w = freshState();
    const r = WOB.upsertItem(w, { source: 'workos', title: 'nameless' }, T0);
    eq(r.item, null, 'refused');
    eq(Object.keys(w.items).length, 0, 'nothing created');
  });
  await check('re-sending a quote supersedes the old follow-up instead of duplicating', () => {
    const w = freshState();
    const s1 = T0;
    WOB.applyEvent(w, evt('r1', 'quote.sent', elginQuote({ status: 'sent', sentAt: s1 })), s1);
    const s2 = days(T0, 4);
    WOB.applyEvent(w, evt('r2', 'quote.sent', elginQuote({ status: 'sent', sentAt: s2 })), s2);
    const id = WOB.refId('workos', elginQuote().externalId);
    const open = WOB.actionsFor(w, id).filter(a => a.kind === 'follow_up');
    eq(open.length, 1, 'exactly one open follow-up');
    eq(open[0].dueAt, days(s2, 3), 'anchored to the newer send');
  });
  await check('prune bounds the replay ledger without dropping pending work', () => {
    const w = freshState();
    WOB.enqueue(w, 'work_session.started', {}, days(T0, -200));
    w.seenEvents['old'] = days(T0, -200);
    w.seenEvents['recent'] = days(T0, -2);
    WOB.prune(w, T0, { keepDays: 45 });
    eq(w.seenEvents['old'], undefined, 'old event id pruned');
    ok(w.seenEvents['recent'], 'recent retained');
    eq(w.outbox.length, 1, 'pending outbound work never dropped');
  });
  await check('closed work stops generating actions', () => {
    const w = freshState();
    const r = WOB.applyEvent(w, evt('c1', 'quote.lost',
      elginQuote({ status: 'lost', sentAt: T0 })), days(T0, 1));
    eq(WOB.deriveActions(r.item, days(T0, 1)).length, 0, 'no actions for lost work');
    eq(WOB.classify(w, r.item, days(T0, 9)).state, 'closed', 'classified closed');
    eq(WOB.attention(w, days(T0, 9)).length, 0, 'not nagged about lost work');
  });

  // ── summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(58)}\n`);
  if (failed) {
    failures.forEach(f => console.log(`FAILED: ${f.name}\n${f.error && f.error.stack}\n`));
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
