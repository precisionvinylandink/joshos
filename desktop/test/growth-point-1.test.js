/**
 * Growth Point 1 — integration tests.
 *
 * The goal is $53,990/month, every month through February 2027. JoshOS owns
 * the goal and every number derived from it; the ACTUALS arrive from the
 * business source of truth over the bridge (`GET /metrics`).
 *
 * Like the other bridge tests these run against the SHIPPED engine: the block
 * between GROWTH-POINT-1:BEGIN and GROWTH-POINT-1:END is extracted from
 * desktop/src/index.html and executed in a vm context. There is no second copy
 * of the logic to drift from.
 *
 *   node desktop/test/growth-point-1.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'index.html');

function loadEngine() {
  const html = fs.readFileSync(SRC, 'utf8');
  const begin = html.indexOf('GROWTH-POINT-1:BEGIN');
  const end = html.indexOf('/* GROWTH-POINT-1:END */');
  if (begin < 0 || end < 0) throw new Error('Growth Point 1 markers not found in index.html');
  const from = html.indexOf('var GP1=', begin);
  const code = html.slice(from, end);
  const ctx = { console, Promise, Math, Date, Number, String, Object, Array, JSON, isNaN, isFinite, Infinity };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'growth-point-1.js' });
  if (!ctx.GP1) throw new Error('engine did not define GP1');
  return ctx.GP1;
}

const GP1 = loadEngine();

// ── tiny harness (same shape as the other suites) ──────────────────────────
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
function near(actual, expected, tol, what) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${what || 'value'}: expected ~${expected} (±${tol}), got ${actual}`);
  }
}
function ok(cond, what) { if (!cond) throw new Error(what || 'expected truthy'); }

// ── fixtures ───────────────────────────────────────────────────────────────

/** Local-time clock, so it agrees with the engine's local calendar math. */
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0);

const store = () => GP1.ensure({});

/** A /metrics payload in the shape the bridge actually returns. */
function metrics(month, o = {}) {
  const g = (x) => ({ available: true, ...x });
  return {
    month,
    generators: {
      dynamicQR: g({
        source: 'cpg_subscriptions (plan=qr_monthly, status=active)',
        activeUnits: o.qrActive ?? 0, mrr: (o.qrActive ?? 0) * 5,
        historicalUnits: o.qrHistorical ?? (o.qrActive ?? 0),
        unitsAdded: o.qrAdded ?? 0, unitsChurned: o.qrChurned ?? 0,
        cash: o.qrCash ?? 0,
      }),
      printClub: g({
        source: 'print_club_subscriptions (status=active)',
        activeUnits: o.pcActive ?? 0, mrr: (o.pcActive ?? 0) * 99,
        historicalUnits: o.pcHistorical ?? (o.pcActive ?? 0),
        unitsAdded: o.pcAdded ?? 0, unitsChurned: o.pcChurned ?? 0,
        cash: o.pcCash ?? 0,
      }),
      precisionVinylInk: g({ source: 'pvi_invoices', cash: o.pvi ?? 0 }),
      chicagoPromotionalGroup: g({ source: 'cpg_revenue_events', cash: o.cpg ?? 0 }),
      scratchOffStudio: {
        available: false,
        reason: 'no system of record — no scratch-off table exists in this database',
        cash: null,
      },
    },
  };
}

const gen = (model, key) => model.generators.find((g) => g.key === key);

async function run() {
  console.log('\nGrowth Point 1\n');

  // ── 1. The goal itself ───────────────────────────────────────────────────
  console.log('  ── canonical goal ──');

  await check('the target is $53,990 and the generators sum to exactly that', () => {
    const gi = GP1.goalIntegrity();
    eq(gi.target, 53990, 'monthlyTarget');
    eq(gi.sum, 53990, 'sum of generator targets');
    ok(gi.ok, 'goal integrity');
  });

  await check('every month from Aug 2026 to Feb 2027 carries the same target', () => {
    eq(GP1.GOAL.months.length, 7, 'month count');
    eq(GP1.GOAL.months[0], '2026-08', 'first month');
    eq(GP1.GOAL.months[6], '2027-02', 'last month');
    const s = store();
    GP1.GOAL.months.forEach((mk) => {
      eq(GP1.compute(s, mk, at(2026, 8, 13)).target, 53990, `${mk} target`);
    });
  });

  await check('the dissolved businesses are not generators', () => {
    const keys = GP1.GOAL.generators.map((g) => g.key).join(',').toLowerCase();
    ['printware', 'stefania', 'elgin', 'joshos', 'jobos'].forEach((dead) => {
      ok(keys.indexOf(dead) < 0, `${dead} must not be a Growth Point 1 generator`);
    });
    eq(GP1.GOAL.generators.length, 5, 'exactly five generators');
  });

  await check('unit targets and prices produce the stated MRR targets', () => {
    const qr = GP1.generator('dynamicQR'), pc = GP1.generator('printClub');
    eq(qr.unitTarget * qr.unitPrice, qr.revenueTarget, 'QR 3000 × $5');
    eq(qr.revenueTarget, 15000, 'QR target');
    eq(pc.unitTarget * pc.unitPrice, pc.revenueTarget, 'Print Club 10 × $99');
    eq(pc.revenueTarget, 990, 'Print Club target');
  });

  // ── 2. Calendar and pace ─────────────────────────────────────────────────
  console.log('\n  ── calendar and pace ──');

  await check('days elapsed and remaining sum to the month, and today is earnable', () => {
    const m = GP1.monthMeta('2026-08', at(2026, 8, 13));
    eq(m.daysInMonth, 31, 'August has 31 days');
    eq(m.dayOfMonth, 13, 'day of month');
    eq(m.daysElapsed, 12, 'twelve completed days');
    eq(m.daysRemaining, 19, 'today plus eighteen more');
    eq(m.daysElapsed + m.daysRemaining, 31, 'they account for the whole month');
  });

  await check('the last day of the month still has one earnable day (no divide by zero)', () => {
    const m = GP1.monthMeta('2026-08', at(2026, 8, 31));
    eq(m.daysRemaining, 1, 'the 31st is still today');
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pvi: 1000 }), '2026-08-31T12:00:00Z');
    const r = GP1.compute(s, '2026-08', at(2026, 8, 31));
    ok(isFinite(r.requiredPerDay), 'requiredPerDay is finite');
    near(r.requiredPerDay, 52990, 1, 'the whole remaining gap is due today');
  });

  await check('past and future months are labelled, not mispriced', () => {
    eq(GP1.monthMeta('2026-08', at(2026, 9, 5)).phase, 'past', 'August seen from September');
    eq(GP1.monthMeta('2026-10', at(2026, 9, 5)).phase, 'future', 'October seen from September');
    eq(GP1.monthMeta('2026-09', at(2026, 9, 5)).phase, 'current', 'September');
    const s = store();
    const fut = GP1.compute(s, '2027-02', at(2026, 8, 13));
    eq(fut.status.key, 'not_started', 'a future month has not started');
    eq(fut.target, 53990, 'but still carries the target');
  });

  await check("the brief's own worked example reproduces: $7,500 halfway ⇒ $833/day", () => {
    // Precision Vinyl & Ink at $7,500 with 15 earnable days left of 30.
    const s = store();
    GP1.applyLive(s, metrics('2026-09', { pvi: 7500 }), '2026-09-16T12:00:00Z');
    const m = GP1.monthMeta('2026-09', at(2026, 9, 16));
    eq(m.daysRemaining, 15, 'fifteen days remain in September');
    const pvi = gen(GP1.compute(s, '2026-09', at(2026, 9, 16)), 'precisionVinylInk');
    eq(pvi.gap, 12500, '$12,500 remaining');
    near(pvi.requiredPerDay, 833.33, 0.01, '$833/day required');
  });

  // ── 3. Active vs historical subscribers ──────────────────────────────────
  console.log('\n  ── active vs historical ──');

  await check('only ACTIVE retained subscribers count toward the goal', () => {
    const s = store();
    // 3,100 have ever subscribed; 2,850 are active right now.
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2850, qrHistorical: 3100 }), '2026-08-13T12:00:00Z');
    const qr = gen(GP1.compute(s, '2026-08', at(2026, 8, 13)), 'dynamicQR');
    eq(qr.units.active, 2850, 'active subscribers');
    eq(qr.units.historical, 3100, 'historical is carried but not counted');
    eq(qr.units.gap, 150, '150 short of 3,000 — not "over" by 100');
    eq(qr.mrr, 14250, '2,850 × $5');
  });

  await check('Print Club counts active members, not everyone who ever joined', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pcActive: 8, pcHistorical: 15 }), '2026-08-13T12:00:00Z');
    const pc = gen(GP1.compute(s, '2026-08', at(2026, 8, 13)), 'printClub');
    eq(pc.units.active, 8, '8 / 10, not 15 / 10');
    eq(pc.units.gap, 2, 'two short');
    eq(pc.mrr, 792, '8 × $99');
  });

  // ── 4. Live data moves the goal (the whole point) ────────────────────────
  console.log('\n  ── live actuals drive everything ──');

  await check('TEST 1 — ten new Dynamic QR subscribers move every dependent number', () => {
    const s = store();
    const now = at(2026, 8, 13);
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2450, qrAdded: 20, qrChurned: 5 }), '2026-08-13T12:00:00Z');
    const before = GP1.compute(s, '2026-08', now);
    const qrB = gen(before, 'dynamicQR');

    GP1.applyLive(s, metrics('2026-08', { qrActive: 2460, qrAdded: 30, qrChurned: 5 }), '2026-08-13T12:05:00Z');
    const after = GP1.compute(s, '2026-08', now);
    const qrA = gen(after, 'dynamicQR');

    eq(qrA.units.active - qrB.units.active, 10, 'subscriber count +10');
    eq(qrA.mrr - qrB.mrr, 50, 'MRR +$50');
    eq(qrA.units.active, 2460, '2,460 / 3,000');
    eq(qrA.mrr, 12300, '$12,300 / $15,000');
    ok(after.pct > before.pct, 'Growth Point 1 completion increased');
    ok(after.remaining < before.remaining, 'revenue gap decreased');
    ok(qrA.units.gap < qrB.units.gap, 'subscriber gap decreased');
    ok(qrA.units.requiredPerDay <= qrB.units.requiredPerDay, 'required daily pace eased');
    ok(qrA.requiredPerDay < qrB.requiredPerDay, 'required daily revenue eased');
    ok(after.projected > before.projected, 'projection recalculated upward');
  });

  await check('TEST 2 — a cancellation lowers the count, the MRR and the progress', () => {
    const s = store();
    const now = at(2026, 8, 13);
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2460, qrAdded: 30, qrChurned: 5 }), '2026-08-13T12:00:00Z');
    const before = GP1.compute(s, '2026-08', now);

    // One subscriber cancels: active falls, and the churn count records it.
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2459, qrAdded: 30, qrChurned: 6 }), '2026-08-13T12:10:00Z');
    const after = GP1.compute(s, '2026-08', now);
    const qrB = gen(before, 'dynamicQR'), qrA = gen(after, 'dynamicQR');

    eq(qrB.units.active - qrA.units.active, 1, 'active count −1');
    eq(qrB.mrr - qrA.mrr, 5, 'MRR −$5');
    ok(after.pct < before.pct, 'goal completion decreased');
    ok(after.remaining > before.remaining, 'revenue gap increased');
    eq(qrA.units.churned, 6, 'the cancellation is recorded');
  });

  await check('TEST 3 — Print Club 10 → 9 shows 9/10 and $891/$990 immediately', () => {
    const s = store();
    const now = at(2026, 8, 13);
    GP1.applyLive(s, metrics('2026-08', { pcActive: 10 }), '2026-08-13T12:00:00Z');
    const full = gen(GP1.compute(s, '2026-08', now), 'printClub');
    eq(full.units.active, 10, '10 active');
    eq(full.mrr, 990, '$990 MRR');
    eq(full.gap, 0, 'target met');
    eq(full.status.key, 'on_track', 'on track at full membership');

    GP1.applyLive(s, metrics('2026-08', { pcActive: 9, pcChurned: 1 }), '2026-08-13T12:05:00Z');
    const one = gen(GP1.compute(s, '2026-08', now), 'printClub');
    eq(one.units.active, 9, '9 / 10');
    eq(one.mrr, 891, '$891 / $990');
    eq(one.units.gap, 1, 'one subscriber short');
    eq(one.gap, 99, '$99 of MRR missing');
  });

  await check('TEST 4 — a resubscription counts again', () => {
    const s = store();
    const now = at(2026, 8, 13);
    GP1.applyLive(s, metrics('2026-08', { pcActive: 9, pcHistorical: 12, pcChurned: 1 }), '2026-08-13T12:00:00Z');
    eq(gen(GP1.compute(s, '2026-08', now), 'printClub').units.active, 9, 'nine while cancelled');

    // Same person comes back: active rises, history does not grow.
    GP1.applyLive(s, metrics('2026-08', { pcActive: 10, pcHistorical: 12, pcChurned: 1, pcAdded: 1 }), '2026-08-13T12:30:00Z');
    const back = gen(GP1.compute(s, '2026-08', now), 'printClub');
    eq(back.units.active, 10, 'counted again as active');
    eq(back.units.historical, 12, 'history unchanged — nobody new appeared');
    eq(back.mrr, 990, 'MRR restored');
  });

  await check('TEST 5 — the numbers survive a reload from persisted state', () => {
    const app = {};
    const s = GP1.ensure(app);
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2460, pcActive: 9, pvi: 7500, cpg: 3000 }), '2026-08-13T12:00:00Z');
    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 1200, note: 'two church orders' });
    const before = GP1.compute(s, '2026-08', at(2026, 8, 13));

    // Exactly what saveData()/pullFullState() do to it: JSON round trip.
    const reloaded = GP1.ensure(JSON.parse(JSON.stringify(app)));
    const after = GP1.compute(reloaded, '2026-08', at(2026, 8, 13));

    eq(after.actual, before.actual, 'total actual survives');
    eq(after.pct, before.pct, 'percentage survives');
    eq(gen(after, 'dynamicQR').units.active, 2460, 'subscriber count survives');
    eq(gen(after, 'scratchOffStudio').actual, 1200, 'manual entry survives');
    eq(gen(after, 'scratchOffStudio').note, 'two church orders', 'note survives');
  });

  await check('TEST 6 — cancelling does not erase what already happened', () => {
    const s = store();
    // August closes on target, with 10 Print Club members.
    GP1.applyLive(s, metrics('2026-08', { pcActive: 10, pvi: 20000, cpg: 12000, qrActive: 3000 }), '2026-08-31T23:00:00Z');
    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 6000 });
    GP1.lockMonth(s, '2026-08', '2026-08-31T23:59:00Z');

    // In September two members cancel. August's record must not move.
    GP1.applyLive(s, metrics('2026-09', { pcActive: 8, pcChurned: 2 }), '2026-09-02T12:00:00Z');
    const hist = GP1.history(s, at(2026, 9, 2));
    const aug = hist.find((h) => h.month === '2026-08');
    const sep = hist.find((h) => h.month === '2026-09');

    eq(aug.actual, 53990, 'August still records what it earned');
    eq(aug.status.key, 'achieved', 'August still counts as achieved');
    ok(aug.locked, 'August is locked');
    eq(gen(GP1.compute(s, '2026-09', at(2026, 9, 2)), 'printClub').units.active, 8,
       'September reflects the current active state');
    ok(sep.actual < aug.actual, 'the two months are independent records');
  });

  // ── 5. Revenue vs run rate ───────────────────────────────────────────────
  console.log('\n  ── revenue vs run rate ──');

  await check('MRR is never silently reported as cash collected', () => {
    const s = store();
    // 3,000 QR subscribers — a $15,000 run rate — but only $400 collected.
    GP1.applyLive(s, metrics('2026-08', { qrActive: 3000, qrCash: 400 }), '2026-08-13T12:00:00Z');
    const r = GP1.compute(s, '2026-08', at(2026, 8, 13));
    const qr = gen(r, 'dynamicQR');
    eq(qr.mrr, 15000, 'the run rate is $15,000');
    eq(qr.cash, 400, 'the cash is $400');
    eq(qr.actual, 15000, 'the recurring target is measured at run rate');
    eq(r.cash, 400, 'the dashboard reports collected cash separately');
    ok(r.cash !== r.actual, 'and never conflates the two');
  });

  await check('a recurring projection holds the level, it does not extrapolate from zero', () => {
    const s = store();
    // Flat month: 2,000 subscribers, nothing added or lost.
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2000 }), '2026-08-05T12:00:00Z');
    const flat = gen(GP1.compute(s, '2026-08', at(2026, 8, 5)), 'dynamicQR');
    eq(flat.projected, 10000, 'a flat month projects the current $10,000 MRR, not 5/31 of it');

    // Growing month: +310 net over 10 days ⇒ 31/day ⇒ +21 days of growth.
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2310, qrAdded: 320, qrChurned: 10 }), '2026-08-10T12:00:00Z');
    const grow = gen(GP1.compute(s, '2026-08', at(2026, 8, 10)), 'dynamicQR');
    ok(grow.projected > grow.actual, 'growth is projected forward');
    near(grow.projected, 2310 * 5 + (310 / 10) * 21 * 5, 1, 'at the observed net rate');
  });

  await check('a cash generator projects on its own run rate', () => {
    const s = store();
    // $5,000 by day 10 of a 31-day month ⇒ $500/day ⇒ $15,500 projected.
    GP1.applyLive(s, metrics('2026-08', { pvi: 5000 }), '2026-08-10T12:00:00Z');
    const pvi = gen(GP1.compute(s, '2026-08', at(2026, 8, 10)), 'precisionVinylInk');
    near(pvi.projected, 15500, 0.01, 'projected month end');
    ok(pvi.projected < pvi.target, 'and that is short of $20,000');
  });

  // ── 6. Status, pace and the action list ──────────────────────────────────
  console.log('\n  ── status and priorities ──');

  await check('status is ON TRACK / AT RISK / BEHIND on the projection', () => {
    const s = store();
    const now = at(2026, 8, 16); // day 16 of 31

    // Full run rate everywhere ⇒ on track.
    GP1.applyLive(s, metrics('2026-08', {
      qrActive: 3000, pcActive: 10, pvi: 20000 / 31 * 16, cpg: 12000 / 31 * 16,
    }), '2026-08-16T12:00:00Z');
    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 6000 / 31 * 16 });
    eq(GP1.compute(s, '2026-08', now).status.key, 'on_track', 'exactly on pace is on track');

    // Everything cash-side stops ⇒ behind.
    GP1.applyLive(s, metrics('2026-08', { qrActive: 500, pcActive: 1, pvi: 500, cpg: 200 }), '2026-08-16T12:30:00Z');
    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 0 });
    eq(GP1.compute(s, '2026-08', now).status.key, 'behind', 'far below pace is behind');
  });

  await check('a finished month reports ACHIEVED or MISSED, never "on track"', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { qrActive: 100 }), '2026-08-31T12:00:00Z');
    eq(GP1.compute(s, '2026-08', at(2026, 9, 10)).status.key, 'missed', 'a short month is missed');
    GP1.applyLive(s, metrics('2026-08', { qrActive: 3000, pcActive: 10, pvi: 20000, cpg: 12000 }), '2026-08-31T12:00:00Z');
    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 6000 });
    eq(GP1.compute(s, '2026-08', at(2026, 9, 10)).status.key, 'achieved', 'a full month is achieved');
  });

  await check('the action list ranks by dollar impact and speaks units where units matter', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', {
      qrActive: 2580,  // gap 420 subs = $2,100
      pcActive: 7,     // gap 3 subs   = $297
      pvi: 13200,      // gap $6,800
      cpg: 7900,       // gap $4,100
    }), '2026-08-13T12:00:00Z');
    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 3900 }); // gap $2,100

    const r = GP1.compute(s, '2026-08', at(2026, 8, 13));
    eq(r.actions[0].key, 'precisionVinylInk', 'the biggest dollar gap leads');
    eq(r.actions[0].gapRevenue, 6800, 'PVI gap');
    eq(r.actions[1].key, 'chicagoPromotionalGroup', 'then CPG');
    eq(r.actions[1].gapRevenue, 4100, 'CPG gap');
    eq(r.actions[r.actions.length - 1].key, 'printClub', 'the smallest gap is last');

    const qr = r.actions.find((a) => a.key === 'dynamicQR');
    eq(qr.measure, 'units', 'Dynamic QR is expressed in subscribers');
    eq(qr.gapUnits, 420, '+420 subscribers needed');
    const pc = r.actions.find((a) => a.key === 'printClub');
    eq(pc.gapUnits, 3, '+3 Print Club subscribers needed');
    const pvi = r.actions.find((a) => a.key === 'precisionVinylInk');
    eq(pvi.measure, 'revenue', 'PVI is expressed in revenue');
  });

  await check('nothing is listed as needed when every generator is at target', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { qrActive: 3000, pcActive: 10, pvi: 20000, cpg: 12000 }), '2026-08-13T12:00:00Z');
    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 6000 });
    const r = GP1.compute(s, '2026-08', at(2026, 8, 13));
    eq(r.actual, 53990, 'the goal is exactly met');
    eq(r.remaining, 0, 'nothing remaining');
    eq(r.actions.length, 0, 'and nothing to do');
    eq(r.requiredPerDay, 0, 'no daily requirement');
  });

  // ── 7. Today and this week ───────────────────────────────────────────────
  console.log('\n  ── today and this week ──');

  await check("today's target is the remaining gap spread over the earnable days", () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pvi: 10000, qrActive: 2000 }), '2026-08-13T12:00:00Z');
    const r = GP1.compute(s, '2026-08', at(2026, 8, 13));
    near(r.today.revenue, r.remaining / 19, 0.01, 'remaining ÷ 19 earnable days');
    eq(r.today.revenue, r.requiredPerDay, 'today is the required daily pace');
    const qr = r.today.generators.find((g) => g.key === 'dynamicQR');
    eq(qr.units, Math.ceil(1000 / 19), 'and a whole number of subscribers');
  });

  await check('this week never asks for days the month does not have', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pvi: 1000 }), '2026-08-29T12:00:00Z');
    // 2026-08-29 is a Saturday: one day left in the week, three left in August.
    const r = GP1.compute(s, '2026-08', at(2026, 8, 29));
    eq(new Date(2026, 7, 29).getDay(), 6, 'fixture assumption: Saturday');
    eq(r.thisWeek.days, 1, 'only Saturday remains of this week');
    near(r.thisWeek.revenue, r.requiredPerDay * 1, 0.01, 'one day of pace');

    const mid = GP1.compute(s, '2026-08', at(2026, 8, 12)); // Wednesday
    eq(mid.thisWeek.days, 4, 'Wed–Sat of that week');
  });

  await check('a week can be marked hit and the mark persists per week', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pvi: 1000 }), '2026-08-12T12:00:00Z');
    const before = GP1.compute(s, '2026-08', at(2026, 8, 12));
    eq(before.thisWeek.done, false, 'not marked yet');
    GP1.markWeek(s, '2026-08', before.thisWeek.startKey, true);
    eq(GP1.compute(s, '2026-08', at(2026, 8, 12)).thisWeek.done, true, 'marked');
    // The next week starts clean.
    eq(GP1.compute(s, '2026-08', at(2026, 8, 19)).thisWeek.done, false, 'next week is its own mark');
  });

  // ── 8. Source precedence ─────────────────────────────────────────────────
  console.log('\n  ── source of truth precedence ──');

  await check('live data always beats a stale manual number', () => {
    const s = store();
    GP1.setManual(s, '2026-08', 'dynamicQR', { units: 2900 });
    eq(gen(GP1.compute(s, '2026-08', at(2026, 8, 13)), 'dynamicQR').units.active, 2900,
       'manual is used while there is no live source');

    GP1.applyLive(s, metrics('2026-08', { qrActive: 1200 }), '2026-08-13T12:00:00Z');
    const qr = gen(GP1.compute(s, '2026-08', at(2026, 8, 13)), 'dynamicQR');
    eq(qr.units.active, 1200, 'live wins — the typed 2,900 cannot prop the goal up');
    eq(qr.sourceKind, 'live', 'and the reading is labelled live');
  });

  await check('a generator with no system of record falls back to manual, and says so', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pvi: 100 }), '2026-08-13T12:00:00Z');
    const sos = gen(GP1.compute(s, '2026-08', at(2026, 8, 13)), 'scratchOffStudio');
    eq(sos.sourceKind, 'none', 'no data until it is entered');
    ok(/no system of record/.test(sos.unavailableReason || ''), 'the reason is carried through');

    GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: 2500 });
    const after = GP1.compute(s, '2026-08', at(2026, 8, 13));
    eq(gen(after, 'scratchOffStudio').sourceKind, 'manual', 'labelled manual, never live');
    eq(gen(after, 'scratchOffStudio').actual, 2500, 'and it counts');
    eq(after.liveComplete, true, 'a generator with no source does not make the read incomplete');
  });

  await check('an unreachable bridge does not zero the actuals', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { qrActive: 2400, pvi: 9000 }), '2026-08-13T12:00:00Z');
    const good = GP1.compute(s, '2026-08', at(2026, 8, 13));
    GP1.markLiveError(s, new Error('bridge 503 Service Unavailable'), '2026-08-13T12:05:00Z');
    const stale = GP1.compute(s, '2026-08', at(2026, 8, 13));
    eq(stale.actual, good.actual, 'the last good reading is kept');
    eq(s.sync.status, 'error', 'but the sync state says it is not fresh');
    ok(/503/.test(s.sync.error), 'and why');
  });

  await check('a malformed or out-of-range payload is refused', () => {
    const s = store();
    eq(GP1.applyLive(s, null, 'now').applied, false, 'null payload');
    eq(GP1.applyLive(s, { month: '2026-08' }, 'now').reason, 'malformed_payload', 'no generators');
    eq(GP1.applyLive(s, metrics('2025-01'), 'now').reason, 'month_out_of_range', 'outside Aug 26 – Feb 27');
    eq(Object.keys(s.months).length, 0, 'and nothing was stored');
  });

  // ── 9. End of month ──────────────────────────────────────────────────────
  console.log('\n  ── end of month ──');

  await check('a finished month with data is locked automatically; an empty one is not', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pvi: 18000 }), '2026-08-31T12:00:00Z');
    const locked = GP1.autoLock(s, '2026-09-01T09:00:00Z');
    eq(locked.length, 1, 'one month locked');
    eq(locked[0], '2026-08', 'August');
    // September is current, and there is no data for any other month.
    eq(GP1.autoLock(s, '2026-09-01T09:00:00Z').length, 0, 'locking is idempotent');
    const hist = GP1.history(s, at(2026, 9, 1));
    eq(hist.find((h) => h.month === '2026-10').actual, null, 'a month with no data reports no actual');
    eq(hist.find((h) => h.month === '2026-10').hasData, false, 'rather than a misleading zero');
  });

  await check('a late payment can still correct a locked month', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { pvi: 18000 }), '2026-08-31T12:00:00Z');
    GP1.lockMonth(s, '2026-08', '2026-09-01T00:00:00Z');
    eq(GP1.history(s, at(2026, 9, 5)).find((h) => h.month === '2026-08').actual, 18000, 'locked at 18,000');

    GP1.applyLive(s, metrics('2026-08', { pvi: 19500 }), '2026-09-05T12:00:00Z');
    eq(GP1.history(s, at(2026, 9, 5)).find((h) => h.month === '2026-08').actual, 18000,
       'the snapshot is the record until it is deliberately refreshed');
    GP1.relock(s, '2026-08', '2026-09-05T12:01:00Z');
    eq(GP1.history(s, at(2026, 9, 5)).find((h) => h.month === '2026-08').actual, 19500, 'then it reflects the correction');
  });

  await check('all seven months appear in history with the same target', () => {
    const s = store();
    const hist = GP1.history(s, at(2026, 8, 13));
    eq(hist.length, 7, 'seven rows');
    hist.forEach((h) => eq(h.target, 53990, `${h.month} target`));
    eq(hist[0].label, 'August 2026', 'first row label');
    eq(hist[6].label, 'February 2027', 'last row label');
  });

  await check('the month selector only accepts months in range', () => {
    const s = store();
    eq(GP1.selectMonth(s, '2026-12'), true, 'December 2026 is in range');
    eq(GP1.activeMonth(s, at(2026, 8, 13)), '2026-12', 'and becomes the active month');
    eq(GP1.selectMonth(s, '2027-06'), false, 'June 2027 is not');
    eq(GP1.activeMonth(s, at(2026, 8, 13)), '2026-12', 'the selection is unchanged');
  });

  // ── 10. Internal consistency ─────────────────────────────────────────────
  console.log('\n  ── internal consistency ──');

  await check('the whole model stays consistent as the numbers move', () => {
    const s = store();
    const now = at(2026, 8, 13);
    [
      { qrActive: 0, pcActive: 0, pvi: 0, cpg: 0 },
      { qrActive: 1500, pcActive: 4, pvi: 8000, cpg: 5000 },
      { qrActive: 2999, pcActive: 9, pvi: 19999, cpg: 11999 },
      { qrActive: 3000, pcActive: 10, pvi: 20000, cpg: 12000 },
      { qrActive: 4000, pcActive: 14, pvi: 26000, cpg: 15000 },
    ].forEach((fixture, i) => {
      GP1.applyLive(s, metrics('2026-08', fixture), '2026-08-13T12:00:00Z');
      GP1.setManual(s, '2026-08', 'scratchOffStudio', { revenue: i * 1500 });
      const r = GP1.compute(s, '2026-08', now);

      const sum = r.generators.reduce((t, g) => t + g.actual, 0);
      near(r.actual, sum, 0.001, `case ${i}: total is the sum of its parts`);
      near(r.remaining, Math.max(0, r.target - r.actual), 0.001, `case ${i}: remaining`);
      near(r.pct, r.actual / r.target * 100, 0.001, `case ${i}: percentage`);
      near(r.requiredPerDay * r.daysRemaining, r.remaining, 0.001, `case ${i}: daily pace closes the gap`);
      ok(r.remaining >= 0, `case ${i}: remaining never goes negative`);
      r.generators.forEach((g) => {
        ok(g.gap >= 0, `case ${i}: ${g.key} gap never negative`);
        near(g.gap, Math.max(0, g.target - g.actual), 0.001, `case ${i}: ${g.key} gap`);
        if (g.units) {
          near(g.mrr, g.units.active * g.units.price, 0.001, `case ${i}: ${g.key} MRR follows headcount`);
          eq(g.units.gap, Math.max(0, g.units.target - g.units.active), `case ${i}: ${g.key} unit gap`);
        }
      });
      // Everything with a gap appears in the action list, in gap order.
      eq(r.actions.length, r.generators.filter((g) => g.gap > 0.005).length, `case ${i}: action count`);
      for (let k = 1; k < r.actions.length; k++) {
        ok(r.actions[k - 1].gapRevenue >= r.actions[k].gapRevenue, `case ${i}: actions ranked by impact`);
      }
    });
  });

  await check('exceeding a target never produces a negative requirement', () => {
    const s = store();
    GP1.applyLive(s, metrics('2026-08', { qrActive: 3500, pcActive: 20, pvi: 30000, cpg: 20000 }), '2026-08-13T12:00:00Z');
    const r = GP1.compute(s, '2026-08', at(2026, 8, 13));
    ok(r.actual > r.target, 'above the goal');
    eq(r.remaining, 0, 'nothing remaining');
    eq(r.requiredPerDay, 0, 'nothing required per day');
    eq(r.today.revenue, 0, 'nothing required today');
    eq(r.status.key, 'on_track', 'and on track');
    ok(r.variance > 0, 'with a projected surplus');
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
