/**
 * Order execution handoff — integration tests.
 *
 * PVI converts an approved quote to an order; the order arrives over the
 * existing WorkOS bridge and must become scheduled, actionable work here.
 *
 * Like workos-bridge.test.js these run against the SHIPPED engine: the block
 * between WORKOS-BRIDGE:BEGIN and WORKOS-BRIDGE:END is extracted from
 * desktop/src/index.html and executed in a vm context. There is no second copy
 * of the logic to drift from.
 *
 *   node desktop/test/order-execution.test.js
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
  const from = html.indexOf('var WOB=', begin);
  const code = html.slice(from, end);
  const ctx = { console, Promise, Math, Date, Number, String, Object, Array, JSON, isNaN, Infinity };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'workos-bridge.js' });
  if (!ctx.WOB) throw new Error('engine did not define WOB');
  return ctx.WOB;
}

const WOB = loadEngine();

// ── tiny harness (same shape as workos-bridge.test.js) ─────────────────────
let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
  return Promise.resolve().then(fn)
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
function close(actual, expected, tolMs, what) {
  const d = Math.abs(new Date(actual).getTime() - new Date(expected).getTime());
  if (d > tolMs) throw new Error(`${what || 'time'}: expected ~${expected}, got ${actual} (off by ${d}ms)`);
}

// ── fixtures ───────────────────────────────────────────────────────────────
const T0 = '2026-08-12T15:00:00.000Z';
const DAY = 864e5;
const days = (base, n) => new Date(new Date(base).getTime() + n * DAY).toISOString();

function freshState() { const app = {}; return WOB.ensure(app); }

/**
 * The production_stage_config PVI ships over the bridge. Durations are
 * `confirmed: false` in production too — they are placeholders Josh has not
 * measured yet, and the engine must say so rather than imply accuracy.
 *
 *   normal total = 2 + 3 + 5 + 1 + 0.5 + 1 = 12.5 days
 *   rush   total = 0.5 + 1 + 2 + 0.5 + 0.5 + 1 = 5.5 days
 */
function stageConfig(overrides) {
  const base = [
    { stage: 'artwork_proof', sequence: 1, label: 'Artwork / proof',     leadDaysNormal: 2,   leadDaysRush: 0.5, requiresVendor: false, confirmed: false },
    { stage: 'purchasing',    sequence: 2, label: 'Vendor / purchasing', leadDaysNormal: 3,   leadDaysRush: 1,   requiresVendor: true,  confirmed: false },
    { stage: 'production',    sequence: 3, label: 'Production',          leadDaysNormal: 5,   leadDaysRush: 2,   requiresVendor: false, confirmed: false },
    { stage: 'qc',            sequence: 4, label: 'Final QC',            leadDaysNormal: 1,   leadDaysRush: 0.5, requiresVendor: false, confirmed: false },
    { stage: 'packaging',     sequence: 5, label: 'Packaging',           leadDaysNormal: 0.5, leadDaysRush: 0.5, requiresVendor: false, confirmed: false },
    { stage: 'delivery',      sequence: 6, label: 'Delivery / pickup',   leadDaysNormal: 1,   leadDaysRush: 1,   requiresVendor: false, confirmed: false },
  ];
  return (overrides || []).length ? overrides : base;
}
const NORMAL_LEAD = 12.5, RUSH_LEAD = 5.5;

/**
 * An order exactly as the bridge projects it. Names are fixture data only —
 * production logic never reads them, and nothing here is hardcoded per
 * customer. Modelled on the real acceptance case (an approved PVI quote with
 * five line items converted to an order) without depending on it.
 */
function order(overrides) {
  return Object.assign({
    source: 'workos',
    externalId: 'ord_11111111-0000-4000-8000-000000000001',
    externalTable: 'orders',
    business: 'PVI',
    type: 'job',
    title: 'PVI-ABC123 — Fixture Construction LLC',
    status: 'pending',
    customerLabel: 'A Buyer',
    companyLabel: 'Fixture Construction LLC',
    amount: 2332.75,
    createdAt: T0,
    wonAt: T0,
    dueAt: days(T0, 20),
    lastActivityAt: T0,
    priority: 'normal',
    rush: false,
    stages: stageConfig(),
  }, overrides || {});
}

const evt = (id, type, data, atTs) => ({ id, type, data, at: atTs || T0 });
const idOf = (o) => WOB.refId('workos', (o || order()).externalId);

function ingest(w, payload, now, eventId) {
  return WOB.applyEvent(w, evt(eventId || 'e_' + Math.random().toString(36).slice(2),
    'job.created', payload), now || T0);
}

function stageActions(w, itemId) {
  return WOB.actionsFor(w, itemId, { includeDone: true })
    .filter((a) => /^stage_/.test(a.kind));
}

// ── tests ──────────────────────────────────────────────────────────────────
async function run() {
  console.log('\nOrder execution handoff — integration tests\n');

  // ── 1. Conversion arrives as execution work ──────────────────────────────
  console.log('Test 1 — a converted order becomes a parent work item');

  await check('the order is linked only by (source, externalId)', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    ok(r.applied, 'event applied');
    eq(r.item.id, 'wi_workos_ord_11111111-0000-4000-8000-000000000001', 'deterministic local id');
    eq(r.item.externalId, order().externalId, 'external id retained');
    eq(r.item.externalTable, 'orders', 'source table retained for deep links');
    eq(r.item.type, 'job', 'projected as production work');
  });

  await check('every generated task links back to the PVI order', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    const acts = WOB.actionsFor(w, r.item.id);
    ok(acts.length > 1, 'more than one task');
    acts.forEach((a) => eq(a.workItemId, r.item.id, `${a.kind} parent link`));
    const cal = WOB.calendarItems(w, T0, { days: 60 });
    ok(cal.length > 0, 'calendar work exists');
    cal.forEach((c) => eq(c.externalId, order().externalId, `${c.kind} carries the PVI order id`));
  });

  await check('order status vocabulary normalizes without guessing', () => {
    const w = freshState();
    eq(WOB.canonicalStatus('pending'), 'new', 'pending');
    eq(WOB.canonicalStatus('payment_received'), 'scheduled', 'paid order is committed work');
    eq(WOB.canonicalStatus('quality_check'), 'in_production', 'QC is the tail of production');
    eq(WOB.canonicalStatus('shipped'), 'completed', 'shipped');
    // The same raw word means different things on different tables.
    eq(WOB.canonicalStatus('delivered'), 'sent', 'delivered on a quote = we sent it');
    eq(WOB.canonicalStatus('delivered', 'orders'), 'completed', 'delivered on an order = it arrived');
    eq(WOB.canonicalStatus('teleported'), 'teleported', 'unknown status preserved verbatim');
    const r = ingest(w, order({ status: 'delivered' }), T0);
    eq(r.item.status, 'completed', 'the override applies through upsert');
  });

  // ── 2. Due date ──────────────────────────────────────────────────────────
  console.log('\nTest 2 — the customer due date, and only the customer due date');

  await check('a valid due date produces the full backward-scheduled plan', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    const plan = WOB.buildPlan(r.item, T0);
    eq(plan.blocks.length, 6, 'one block per configured stage');
    eq(plan.feasible, true, '12.5 days of work fits in 20');
    eq(plan.overdue, false, 'not overdue');
    eq(plan.blocks.map((b) => b.stage).join(','),
       'artwork_proof,purchasing,production,qc,packaging,delivery', 'run order');
    // Backward from the due date: delivery ends exactly on it.
    eq(plan.blocks[5].endAt, days(T0, 20), 'delivery ends on the customer due date');
    eq(plan.blocks[5].startAt, days(T0, 19), 'delivery takes its configured day');
    eq(plan.blocks[0].startAt, days(T0, 20 - NORMAL_LEAD), 'work must start 12.5 days out');
    // Contiguous: each stage ends where the next begins.
    for (let i = 1; i < plan.blocks.length; i++) {
      eq(plan.blocks[i - 1].endAt, plan.blocks[i].startAt, `stage ${i} is contiguous`);
    }
  });

  await check('a missing due date raises a task instead of inventing one', () => {
    const w = freshState();
    const r = ingest(w, order({ dueAt: null }), T0);
    const plan = WOB.buildPlan(r.item, T0);
    eq(plan.reason, 'missing_due_date', 'reported, not defaulted');
    eq(plan.blocks.length, 0, 'nothing scheduled');
    const acts = WOB.actionsFor(w, r.item.id);
    eq(acts.filter((a) => a.kind === 'needs_due_date').length, 1, 'one task to set the due date');
    eq(acts.filter((a) => /^stage_/.test(a.kind)).length, 0, 'no fabricated stage blocks');
    const d = WOB.deadlineFor(w, r.item, T0);
    ok(d.riskReasons.indexOf('no_due_date') >= 0, 'flagged as a risk, not as fine');
  });

  await check('the quote expiry is never used as the production due date', () => {
    const w = freshState();
    // A quote carries valid_until in dueAt. It must not generate production work.
    const quote = {
      source: 'workos', externalId: 'q_1', externalTable: 'pvi_quotes', type: 'quote',
      title: 'Q-1004', status: 'approved', createdAt: T0, dueAt: days(T0, 30),
      companyLabel: 'Fixture Construction LLC',
    };
    const r = ingest(w, quote, T0);
    eq(WOB.buildPlan(r.item, T0), null, 'a quote is not execution work');
    eq(stageActions(w, r.item.id).length, 0, 'no production stages off a quote expiry');
  });

  await check('an unconfigured lead time becomes a scheduling task, never a guess', () => {
    const w = freshState();
    const partial = stageConfig().map((s) =>
      s.stage === 'production' ? Object.assign({}, s, { leadDaysNormal: null, leadDaysRush: null }) : s);
    const r = ingest(w, order({ stages: partial }), T0);
    const plan = WOB.buildPlan(r.item, T0);
    eq(plan.blocks.length, 5, 'only the configured stages are scheduled');
    eq(plan.unscheduled.length, 1, 'the unconfigured one is reported');
    eq(plan.unscheduled[0].stage, 'production', 'named');
    const acts = WOB.actionsFor(w, r.item.id);
    eq(acts.filter((a) => a.kind === 'needs_scheduling_production').length, 1,
       'a scheduling task stands in for the missing duration');
    ok(!plan.blocks.some((b) => b.stage === 'production'), 'no invented production duration');
  });

  await check('provisional durations are built but flagged, never presented as measured', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    const plan = WOB.buildPlan(r.item, T0);
    eq(plan.provisional, true, 'config is unconfirmed');
    ok(plan.blocks.every((b) => b.provisional), 'every block says so');
    eq(WOB.actionsFor(w, r.item.id).filter((a) => a.kind === 'confirm_schedule').length, 1,
       'exactly one task asking Josh to confirm the numbers');

    const confirmed = stageConfig().map((s) => Object.assign({}, s, { confirmed: true }));
    const w2 = freshState();
    const r2 = ingest(w2, order({ stages: confirmed }), T0);
    eq(WOB.buildPlan(r2.item, T0).provisional, false, 'confirmed config is not provisional');
    eq(WOB.actionsFor(w2, r2.item.id).filter((a) => a.kind === 'confirm_schedule').length, 0,
       'and asks for no confirmation');
  });

  // ── 3. Rush ──────────────────────────────────────────────────────────────
  console.log('\nTest 3 — rush is a first-class execution property');

  await check('rush is read from either priority or the boolean, never from a name', () => {
    eq(WOB.isRush({ priority: 'rush' }), true, 'priority rush');
    eq(WOB.isRush({ priority: 'urgent' }), true, 'priority urgent');
    eq(WOB.isRush({ rush: true }), true, 'boolean');
    eq(WOB.isRush({ priority: 'normal' }), false, 'normal');
    eq(WOB.isRush({ companyLabel: 'Rush Industries' }), false, 'a customer NAME is never rush');
  });

  await check('rush compresses the plan using its own configured lead times', () => {
    const w = freshState();
    const r = ingest(w, order({ priority: 'rush', rush: true }), T0);
    const plan = WOB.buildPlan(r.item, T0);
    eq(plan.rush, true, 'plan is rush');
    eq(plan.blocks[0].startAt, days(T0, 20 - RUSH_LEAD), 'starts 5.5 days out, not 12.5');
    eq(plan.blocks[5].endAt, days(T0, 20), 'still lands on the same customer due date');
    // The rush durations are the ones from config — not a multiplier.
    eq(plan.blocks.find((b) => b.stage === 'production').leadDays, 2, 'production uses leadDaysRush');
  });

  await check('rush propagates into every task and calendar block', () => {
    const w = freshState();
    const r = ingest(w, order({ priority: 'rush', rush: true }), T0);
    const acts = WOB.actionsFor(w, r.item.id);
    ok(acts.length > 0, 'tasks exist');
    acts.forEach((a) => {
      eq(a.rush, true, `${a.kind} inherits rush`);
      eq(a.priority, 'rush', `${a.kind} inherits priority`);
    });
    const cal = WOB.calendarItems(w, T0, { days: 60 });
    const production = cal.find((c) => c.stage === 'production');
    ok(production, 'production block exists on the calendar');
    eq(production.rush, true, 'structurally identifiable as rush');
    ok(/^RUSH — /.test(production.title), 'and visually: ' + production.title);
    ok(production.title.indexOf('Production') >= 0, 'names the stage');
    ok(production.title.indexOf('Fixture Construction LLC') >= 0, 'names the customer');
  });

  await check('a normal order carries no rush marking anywhere', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    WOB.actionsFor(w, r.item.id).forEach((a) => eq(!!a.rush, false, `${a.kind} not rush`));
    WOB.calendarItems(w, T0, { days: 60 }).forEach((c) => {
      eq(c.rush, false, 'calendar block not rush');
      ok(!/^RUSH/.test(c.title), 'no rush prefix: ' + c.title);
    });
    eq(WOB.deadlines(w, T0).rush.length, 0, 'not in the rush bucket');
  });

  await check('rush escalates sooner: it demands twice the proportional buffer', () => {
    // Both orders sit at 40% slack against their own lead time. Only rush,
    // which requires 50%, is flagged.
    const wN = freshState();
    const rN = ingest(wN, order({ dueAt: days(T0, NORMAL_LEAD * 1.4) }), T0);
    const dN = WOB.deadlineFor(wN, rN.item, T0);

    const wR = freshState();
    const rR = ingest(wR, order({
      externalId: 'ord_rush_1', priority: 'rush', rush: true,
      dueAt: days(T0, RUSH_LEAD * 1.4),
    }), T0);
    const dR = WOB.deadlineFor(wR, rR.item, T0);

    eq(dN.atRisk, false, 'normal order with 40% buffer is on schedule');
    eq(dR.atRisk, true, 'rush order with the same 40% buffer is already at risk');
    ok(dR.riskReasons.indexOf('low_slack') >= 0, 'and says why: ' + dR.riskReasons.join(','));
  });

  await check('all else equal, rush outranks a normal order in the daily view', () => {
    // Both comfortably on schedule, so neither is promoted by risk and the
    // rush flag is the only thing separating them.
    const w = freshState();
    ingest(w, order({ externalId: 'ord_normal', dueAt: days(T0, 60) }), T0, 'e_n');
    ingest(w, order({ externalId: 'ord_rush', priority: 'rush', rush: true, dueAt: days(T0, 60) }), T0, 'e_r');
    const top = WOB.attention(w, T0)[0];
    eq(top.item.externalId, 'ord_rush', 'rush surfaces first');
    eq(top.rush, true, 'flagged');
  });

  await check('but real risk still outranks rush — urgency is earned, not asserted', () => {
    // A normal order that genuinely cannot make its date must beat a rush
    // order with weeks of slack, or "rush" becomes the only thing Josh sees.
    const w = freshState();
    ingest(w, order({ externalId: 'ord_tight', dueAt: days(T0, NORMAL_LEAD * 1.05) }), T0, 'e_t');
    ingest(w, order({ externalId: 'ord_rush_easy', priority: 'rush', rush: true, dueAt: days(T0, 60) }), T0, 'e_re');
    const ranked = WOB.attention(w, T0);
    eq(ranked[0].item.externalId, 'ord_tight', 'the order actually in trouble comes first');
    eq(ranked[0].deadline.atRisk, true, 'because it is at risk');
  });

  // ── 4. Deadline monitoring ───────────────────────────────────────────────
  console.log('\nTest 4 — deadline monitoring answers "what has to happen now?"');

  await check('an order that cannot fit the remaining time is compressed and flagged', () => {
    const w = freshState();
    const r = ingest(w, order({ priority: 'rush', rush: true, dueAt: days(T0, 3) }), T0);
    const plan = WOB.buildPlan(r.item, T0);
    eq(plan.feasible, false, '5.5 days of rush work does not fit in 3');
    eq(plan.compressed, true, 'squeezed rather than scattered into the past');
    eq(plan.blocks.length, 6, 'the blocks still exist and are actionable');
    close(plan.blocks[0].startAt, T0, 1000, 'the first block starts now, not in the past');
    eq(plan.blocks[5].endAt, days(T0, 3), 'and the chain still ends on the due date');
    const d = WOB.deadlineFor(w, r.item, T0);
    eq(d.atRisk, true, 'at risk');
    ok(d.riskReasons.indexOf('does_not_fit') >= 0, 'reason recorded');
  });

  await check('a passed due date reads as overdue, not merely at risk', () => {
    const w = freshState();
    const r = ingest(w, order({ dueAt: days(T0, -2) }), T0);
    const d = WOB.deadlineFor(w, r.item, T0);
    eq(d.overdue, true, 'overdue');
    eq(d.atRisk, false, 'overdue supersedes at-risk rather than double-counting');
    eq(d.remainingDays, -2, 'remaining time is negative');
    eq(WOB.deadlines(w, T0).overdue.length, 1, 'in the overdue bucket');
  });

  await check('a stage whose window closed while incomplete puts the order behind', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    // Jump past the artwork block's end without completing it.
    const later = days(T0, 20 - NORMAL_LEAD + 2.5);
    const d = WOB.deadlineFor(w, r.item, later);
    ok(d.riskReasons.indexOf('stage_overdue') >= 0, 'behind schedule: ' + d.riskReasons.join(','));
    eq(d.atRisk, true, 'at risk');
    eq(d.stage, 'artwork_proof', 'still sitting in the stage it never finished');
  });

  await check('the buckets the daily view needs are all populated', () => {
    const w = freshState();
    ingest(w, order({ externalId: 'o_overdue', dueAt: days(T0, -1) }), T0, 'e1');
    ingest(w, order({ externalId: 'o_today', dueAt: days(T0, 0.5) }), T0, 'e2');
    ingest(w, order({ externalId: 'o_tomorrow', dueAt: days(T0, 1.5) }), T0, 'e3');
    ingest(w, order({ externalId: 'o_rush', priority: 'rush', rush: true, dueAt: days(T0, 30) }), T0, 'e4');
    ingest(w, order({ externalId: 'o_fine', dueAt: days(T0, 90) }), T0, 'e5');
    const d = WOB.deadlines(w, T0);
    eq(d.all.length, 5, 'all five orders tracked');
    eq(d.overdue.map((x) => x.externalId).join(), 'o_overdue', 'overdue');
    eq(d.dueToday.map((x) => x.externalId).join(), 'o_today', 'due today');
    eq(d.dueTomorrow.map((x) => x.externalId).join(), 'o_tomorrow', 'due tomorrow');
    eq(d.rush.map((x) => x.externalId).join(), 'o_rush', 'rush');
    ok(d.onSchedule.some((x) => x.externalId === 'o_fine'), 'on schedule');
    eq(d.all[0].externalId, 'o_overdue', 'worst first');
  });

  await check('work parked on a vendor is marked waiting but still counts against the deadline', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    // Complete artwork so the current stage becomes vendor purchasing.
    const acts = WOB.actionsFor(w, r.item.id);
    const artwork = acts.find((a) => a.kind === 'stage_artwork_proof');
    WOB.completeAction(w, artwork.id, days(T0, 8));
    const d = WOB.deadlineFor(w, r.item, days(T0, 8));
    eq(d.stage, 'purchasing', 'now on the vendor');
    eq(d.waiting, true, 'flagged as an external dependency');
    ok(d.dueAt, 'and the customer due date is still tracked');
    eq(WOB.deadlines(w, days(T0, 8)).waiting.length, 1, 'in the waiting bucket');
  });

  await check('the next required action is the earliest incomplete stage', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    const d0 = WOB.deadlineFor(w, r.item, T0);
    eq(d0.nextAction.kind, 'stage_artwork_proof', 'artwork first');
    // The config task is real work, but it is not the production critical path.
    eq(d0.blockers.map((b) => b.kind).join(), 'confirm_schedule', 'it comes back as a blocker');
    const artwork = WOB.actionsFor(w, r.item.id).find((a) => a.kind === 'stage_artwork_proof');
    WOB.completeAction(w, artwork.id, days(T0, 9));
    const d1 = WOB.deadlineFor(w, r.item, days(T0, 9));
    eq(d1.nextAction.kind, 'stage_purchasing', 'then purchasing');
  });

  // ── 5. Idempotency and reconciliation ────────────────────────────────────
  console.log('\nTest 5 — reconciling, never duplicating');

  await check('polling the same order repeatedly creates one set of work', () => {
    const w = freshState();
    const payload = order();
    for (let i = 0; i < 5; i++) {
      const u = WOB.upsertItem(w, payload, days(T0, i * 0.01));
      WOB.reconcileActions(w, u.item, days(T0, i * 0.01));
    }
    eq(Object.keys(w.items).length, 1, 'one work item');
    eq(stageActions(w, idOf()).length, 6, 'six stage blocks, not thirty');
    eq(WOB.calendarItems(w, T0, { days: 60 }).length,
       WOB.actionsFor(w, idOf()).length, 'no duplicate calendar blocks');
  });

  await check('a replayed bridge event is dropped by the ledger', () => {
    const w = freshState();
    const a = WOB.applyEvent(w, evt('evt_dup', 'job.created', order()), T0);
    const b = WOB.applyEvent(w, evt('evt_dup', 'job.created', order()), days(T0, 0.1));
    eq(a.applied, true, 'first applied');
    eq(b.applied, false, 'replay dropped');
    eq(b.reason, 'duplicate', 'and says why');
    eq(stageActions(w, idOf()).length, 6, 'still six blocks');
  });

  await check('a due-date change moves the existing deadlines instead of forking the plan', () => {
    const w = freshState();
    ingest(w, order(), T0, 'e_first');
    const before = stageActions(w, idOf());
    eq(before.length, 6, 'six to start');
    const beforeDelivery = before.find((a) => a.kind === 'stage_delivery').dueAt;
    eq(beforeDelivery, days(T0, 20), 'delivery on the original due date');

    ingest(w, order({ dueAt: days(T0, 10) }), days(T0, 1), 'e_moved');
    const after = stageActions(w, idOf());
    eq(after.length, 6, 'STILL six — reconciled, not duplicated');
    eq(after.find((a) => a.kind === 'stage_delivery').dueAt, days(T0, 10), 'deadline moved');
    eq(after.filter((a) => a.supersededAt).length, 0, 'nothing orphaned');
  });

  await check('a rush upgrade after sync re-tightens the same blocks', () => {
    const w = freshState();
    ingest(w, order(), T0, 'e_normal');
    eq(stageActions(w, idOf()).find((a) => a.kind === 'stage_artwork_proof').startAt,
       days(T0, 20 - NORMAL_LEAD), 'normal start');

    ingest(w, order({ priority: 'rush', rush: true }), days(T0, 1), 'e_rushed');
    const after = stageActions(w, idOf());
    eq(after.length, 6, 'no second set of blocks');
    after.forEach((a) => eq(a.rush, true, `${a.kind} now rush`));
    eq(after.find((a) => a.kind === 'stage_artwork_proof').startAt,
       days(T0, 20 - RUSH_LEAD), 'and the schedule tightened');
    ok(/^RUSH — /.test(after[0].title), 'titles updated too');
  });

  await check('a rush downgrade actually clears the flag', () => {
    const w = freshState();
    ingest(w, order({ priority: 'rush', rush: true }), T0, 'e_r');
    ingest(w, order({ priority: 'normal', rush: false }), days(T0, 1), 'e_n');
    eq(WOB.isRush(w.items[idOf()]), false, 'no longer rush');
    stageActions(w, idOf()).forEach((a) => eq(a.rush, false, `${a.kind} cleared`));
  });

  await check('completed work survives every subsequent change', () => {
    const w = freshState();
    ingest(w, order(), T0, 'e_1');
    const artwork = WOB.actionsFor(w, idOf()).find((a) => a.kind === 'stage_artwork_proof');
    WOB.completeAction(w, artwork.id, days(T0, 8));
    const completedAt = artwork.completedAt;
    const completedDue = artwork.dueAt;

    // Due date moves, rush toggles, order is re-polled repeatedly.
    ingest(w, order({ dueAt: days(T0, 15), priority: 'rush', rush: true }), days(T0, 9), 'e_2');
    ingest(w, order({ dueAt: days(T0, 15), priority: 'rush', rush: true }), days(T0, 10), 'e_3');

    const all = stageActions(w, idOf());
    eq(all.length, 6, 'still six stages');
    const again = all.find((a) => a.kind === 'stage_artwork_proof');
    eq(again.id, artwork.id, 'same action');
    eq(again.completedAt, completedAt, 'still completed');
    eq(again.dueAt, completedDue, 'a finished stage is not re-deadlined');
    eq(again.rush, false, 'nor retroactively re-flagged');
    // The still-open stages did move.
    eq(all.find((a) => a.kind === 'stage_delivery').dueAt, days(T0, 15), 'open stages rescheduled');
  });

  await check('several orders at once stay completely independent', () => {
    const w = freshState();
    ingest(w, order({ externalId: 'o_a', companyLabel: 'Alpha', dueAt: days(T0, 10) }), T0, 'e_a');
    ingest(w, order({ externalId: 'o_b', companyLabel: 'Beta', priority: 'rush', rush: true, dueAt: days(T0, 8) }), T0, 'e_b');
    ingest(w, order({ externalId: 'o_c', companyLabel: 'Gamma', dueAt: days(T0, 40) }), T0, 'e_c');
    eq(Object.keys(w.items).length, 3, 'three work items');
    ['o_a', 'o_b', 'o_c'].forEach((x) => {
      eq(stageActions(w, WOB.refId('workos', x)).length, 6, `${x} has its own six stages`);
    });
    // Completing one order's stage must not touch another's.
    const aArt = WOB.actionsFor(w, WOB.refId('workos', 'o_a')).find((x) => x.kind === 'stage_artwork_proof');
    WOB.completeAction(w, aArt.id, days(T0, 1));
    eq(WOB.deadlineFor(w, w.items[WOB.refId('workos', 'o_b')], days(T0, 1)).stage,
       'artwork_proof', 'Beta is untouched');
    eq(WOB.deadlines(w, T0).rush.map((d) => d.externalId).join(), 'o_b', 'only Beta is rush');
  });

  await check('a completed order stops generating work', () => {
    const w = freshState();
    ingest(w, order(), T0, 'e_open');
    ok(WOB.actionsFor(w, idOf()).length > 0, 'open order has work');
    ingest(w, order({ status: 'shipped', completedAt: days(T0, 18) }), days(T0, 18), 'e_done');
    eq(WOB.deriveActions(w.items[idOf()], days(T0, 18)).length, 0, 'no further actions');
    eq(WOB.deadlineFor(w, w.items[idOf()], days(T0, 18)), null, 'no longer monitored');
  });

  await check('an order with many line items is still one work item', () => {
    // Line items live in PVI. JoshOS holds a reference and a display snapshot —
    // never a second copy of the order's contents.
    const w = freshState();
    const r = ingest(w, order({ amount: 2332.75 }), T0);
    eq(Object.keys(w.items).length, 1, 'one work item regardless of line count');
    eq(r.item.amount, 2332.75, 'the total is a display snapshot');
    eq(r.item.lineItems, undefined, 'line items are not copied into JoshOS');
    eq(stageActions(w, r.item.id).length, 6, 'the plan is per order, not per line');
  });

  // ── 6. Failure behaviour ─────────────────────────────────────────────────
  console.log('\nTest 6 — the bridge failing must not lose or fake anything');

  await check('a failed pull keeps existing execution work and marks it stale', async () => {
    const w = freshState();
    await WOB.pull(w, { fetchWork: () => Promise.resolve({ items: [order()] }) }, T0);
    eq(stageActions(w, idOf()).length, 6, 'plan built on the good pull');

    const res = await WOB.pull(w, {
      fetchWork: () => Promise.reject(new Error('bridge unreachable')),
    }, days(T0, 1));
    eq(res.ok, false, 'failure reported as failure');
    eq(w.sync.status, 'error', 'sync status is honest');
    ok(/unreachable/.test(w.sync.error), 'the reason is kept');
    eq(stageActions(w, idOf()).length, 6, 'the plan is NOT discarded');
    eq(w.items[idOf()].syncStatus, 'stale', 'but it is marked stale rather than presented as current');
  });

  await check('with no bridge configured nothing is claimed as synced', async () => {
    const w = freshState();
    const res = await WOB.pull(w, null, T0);
    eq(res.reason, 'not_configured', 'explicit');
    eq(w.sync.status, 'not_configured', 'never "ok"');
  });

  await check('a retry after failure recovers without duplicating the plan', async () => {
    const w = freshState();
    let attempt = 0;
    const transport = {
      fetchWork: () => {
        attempt++;
        return attempt === 1 ? Promise.reject(new Error('boom'))
                             : Promise.resolve({ items: [order()] });
      },
    };
    await WOB.pull(w, transport, T0);
    eq(w.sync.status, 'error', 'first attempt failed');
    await WOB.pull(w, transport, days(T0, 0.1));
    await WOB.pull(w, transport, days(T0, 0.2));
    eq(w.sync.status, 'ok', 'recovered');
    eq(Object.keys(w.items).length, 1, 'one work item after three pulls');
    eq(stageActions(w, idOf()).length, 6, 'six stage blocks, not twelve');
  });

  await check('completing a stage is reported to WorkOS, and never fakes acceptance', async () => {
    const w = freshState();
    ingest(w, order(), T0, 'e_x');
    const production = WOB.actionsFor(w, idOf()).find((a) => a.kind === 'stage_production');
    const done = WOB.completeAction(w, production.id, days(T0, 17), { note: 'run finished' });
    eq(done.completed, true, 'completed locally');
    eq(done.event.data.externalId, order().externalId, 'the outbound event names the PVI order');
    eq(done.event.data.actionKind, 'stage_production', 'and the stage');

    const rejecting = { send: () => Promise.reject(new Error('503')) };
    const r1 = await WOB.flushOutbox(w, rejecting, days(T0, 17));
    eq(r1.sent, 0, 'nothing sent');
    eq(w.outbox[0].status, 'pending', 'still pending — no fake success');
    ok(/503/.test(w.outbox[0].lastError), 'error recorded');

    const accepting = { send: () => Promise.resolve({ ok: true }) };
    const r2 = await WOB.flushOutbox(w, accepting, days(T0, 18));
    eq(r2.sent, 1, 'retried and accepted');
    eq(w.outbox[0].status, 'sent', 'now sent');
  });

  await check('JoshOS never writes business state back onto the order', () => {
    const w = freshState();
    const r = ingest(w, order(), T0);
    const before = r.item.status;
    const production = WOB.actionsFor(w, idOf()).find((a) => a.kind === 'stage_production');
    WOB.completeAction(w, production.id, days(T0, 17));
    eq(w.items[idOf()].status, before, 'the order status is untouched — WorkOS decides that');
    eq(w.outbox[0].type, 'calendar_action.completed', 'we only report what Josh did');
  });

  // ── 7. End to end ────────────────────────────────────────────────────────
  console.log('\nEnd-to-end — approved quote → order → scheduled execution');

  await check('the full acceptance chain, driven only by bridge payloads', async () => {
    const w = freshState();

    // The quote is won. It generates quote work, not production work.
    await WOB.pull(w, {
      fetchWork: () => Promise.resolve({
        items: [{
          source: 'workos', externalId: 'q_acc', externalTable: 'pvi_quotes', type: 'quote',
          title: 'Q-1004', status: 'approved', createdAt: days(T0, -3),
          sentAt: days(T0, -2), wonAt: T0, companyLabel: 'Fixture Construction LLC',
          dueAt: days(T0, 30), /* valid_until — deliberately far out and irrelevant */
        }],
      }),
    }, T0);
    const qid = WOB.refId('workos', 'q_acc');
    eq(stageActions(w, qid).length, 0, 'a won quote does not schedule production');

    // Conversion. The order arrives as its own record, RUSH, with a real due date.
    const converted = order({
      externalId: 'ord_acc', priority: 'rush', rush: true,
      dueAt: days(T0, 9), createdAt: T0, wonAt: T0,
    });
    await WOB.pull(w, {
      fetchWork: () => Promise.resolve({
        items: [converted],
        events: [evt('evt_acc_1', 'job.created', converted, T0)],
      }),
    }, T0);

    const oid = WOB.refId('workos', 'ord_acc');
    const item = w.items[oid];
    ok(item, 'PVI order became a JoshOS work item');
    eq(item.externalTable, 'orders', 'linked to the orders table');
    eq(WOB.isRush(item), true, 'rush propagated');
    eq(item.dueAt, days(T0, 9), 'customer due date present');

    const acts = WOB.actionsFor(w, oid);
    eq(stageActions(w, oid).length, 6, 'six execution tasks created');
    acts.forEach((a) => {
      eq(a.workItemId, oid, 'task links to the order');
      eq(a.rush, true, 'rush priority propagates to every task');
    });

    const cal = WOB.calendarItems(w, T0, { days: 30 });
    const orderBlocks = cal.filter((c) => c.externalId === 'ord_acc');
    const stages = orderBlocks.filter((c) => c.stage).map((c) => c.stage);
    ['artwork_proof', 'purchasing', 'production', 'qc', 'packaging', 'delivery']
      .forEach((s) => ok(stages.indexOf(s) >= 0, `calendar has a ${s} block`));
    orderBlocks.forEach((c) => {
      eq(c.source, 'workos', 'every block carries a stable source');
      eq(c.rush, true, 'and the rush flag');
    });
    // The quote's own follow-through is separate work on the same calendar and
    // must not be swallowed by the order's plan.
    ok(cal.some((c) => c.externalId === 'q_acc' && c.kind === 'send_invoice'),
       'the won quote still asks for its invoice');
    cal.forEach((c) => ok(c.externalId, 'no calendar block is orphaned from a record'));

    const d = WOB.deadlineFor(w, item, T0);
    eq(d.rush, true, 'monitored as rush');
    eq(d.stage, 'artwork_proof', 'currently in artwork');
    eq(d.nextAction.kind, 'stage_artwork_proof', 'and knows the next required action');
    ok(WOB.deadlines(w, T0).rush.length === 1, 'surfaces in the rush bucket of the daily view');

    // Replaying the whole pull changes nothing.
    await WOB.pull(w, {
      fetchWork: () => Promise.resolve({
        items: [converted],
        events: [evt('evt_acc_1', 'job.created', converted, T0)],
      }),
    }, days(T0, 0.1));
    eq(stageActions(w, oid).length, 6, 'a second poll creates no duplicate work');
    eq(Object.keys(w.items).length, 2, 'one quote, one order — no third record');
  });

  // ── summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(58)}\n`);
  if (failed) {
    failures.forEach((f) => console.log(`FAILED: ${f.name}\n${f.error && f.error.stack}\n`));
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
