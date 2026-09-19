/**
 * Cost Center tests.
 *
 * Extracts the COST-CENTER:BEGIN…END block out of desktop/src/index.html and
 * executes it under Node — the tests run against the exact code that ships.
 * Same harness as workos-bridge / growth-point-1 / financial-engine: no
 * framework, no dependencies, hand-listed vm globals.
 *
 *   node desktop/test/cost-center.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'index.html');

function loadEngine() {
  const html = fs.readFileSync(SRC, 'utf8');
  const begin = html.indexOf('COST-CENTER:BEGIN');
  const end = html.indexOf('/* COST-CENTER:END */');
  if (begin < 0 || end < 0) throw new Error('COST-CENTER markers not found in index.html');
  const from = html.indexOf('var CC=', begin);
  const code = html.slice(from, end);
  const ctx = { console, Math, Date, Number, String, Object, Array, JSON, isNaN, isFinite, Infinity, RegExp };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'cost-center.js' });
  if (!ctx.CC) throw new Error('engine did not define CC');
  return ctx.CC;
}

const CC = loadEngine();

// ── harness ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || 'not equal') + '\n        got      ' + A + '\n        expected ' + B);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy, got ' + JSON.stringify(v)); }
function section(t) { console.log('\n' + t); }

const NOW = '2026-09-18T12:00:00.000Z';   // today, per the session clock
function app() { const a = {}; CC.ensure(a); return a; }

/* A complete, valid recurring expense, ready to be tweaked per test. */
function draft(over) {
  const base = {
    name: 'Supabase Pro', vendor: 'Supabase', category: 'Database',
    costType: 'infrastructure', expectedCents: 2500, recurring: true,
    recurrence: { freq: 'monthly', interval: 1 },
    startDate: '2026-09-10',
    allocation: { mode: 'single', businessId: 'SHARED' },
    billing: { model: 'FIXED', confidence: 'high' }
  };
  return Object.assign(base, over || {});
}

// ════════════════════════════════════════════════════════════════════════════
section('Money — exact decimal handling, no floats');

test('parseMoney handles the classic float trap exactly', () => {
  eq(CC.parseMoney('19.99').cents, 1999);
  eq(CC.parseMoney('0.07').cents, 7);
  eq(CC.parseMoney('1.005').ok, false, '3dp must be rejected, not silently rounded');
  // The reason this matters: parseFloat('19.99')*100 === 1998.9999999999998
  ok(19.99 * 100 !== 1999, 'the float trap is real');
});

test('parseMoney accepts formatted money and rejects junk', () => {
  eq(CC.parseMoney('$1,234.56').cents, 123456);
  eq(CC.parseMoney('(12.00)').cents, -1200);
  eq(CC.parseMoney('-5').cents, -500);
  eq(CC.parseMoney('  42  ').cents, 4200);
  eq(CC.parseMoney('').ok, false);
  eq(CC.parseMoney('abc').ok, false);
  eq(CC.parseMoney('12.3.4').ok, false);
  eq(CC.parseMoney('.').ok, false);
  eq(CC.parseMoney(null).ok, false);
});

test('parseMoney holds exactness at large values', () => {
  eq(CC.parseMoney('999999999.99').cents, 99999999999);
  eq(CC.parseMoney('10000000000000000').ok, false, 'beyond exact integer cents');
});

test('zero is a real value, not an absent one', () => {
  eq(CC.parseMoney('0').cents, 0);
  eq(CC.parseMoney('0.00').cents, 0);
  eq(CC.parseMoney('0').ok, true);
});

test('fmt renders cents back to dollars without drift', () => {
  eq(CC.fmt(1999), '$19.99');
  eq(CC.fmt(0), '$0.00');
  eq(CC.fmt(123456789), '$1,234,567.89');
  eq(CC.fmt(-500), '−$5.00');
});

// ════════════════════════════════════════════════════════════════════════════
section('Recurrence — including the date boundaries that break naive engines');

test('monthly anchored on the 31st clamps but never drifts', () => {
  const e = { startDate: '2026-01-31', recurring: true, recurrence: { freq: 'monthly', interval: 1 } };
  const got = CC.occurrences(e, '2026-01-01', '2026-05-01');
  // Feb clamps to the 28th; March must return to the 31st, not stay on the 28th.
  eq(got, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('a February 29th anchor survives the leap year and the three that follow', () => {
  const e = { startDate: '2028-02-29', recurring: true, recurrence: { freq: 'annual', interval: 1 } };
  eq(CC.occurrences(e, '2028-01-01', '2032-12-31'),
     ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('quarterly, semiannual and annual step by the right number of months', () => {
  const q = { startDate: '2026-01-15', recurring: true, recurrence: { freq: 'quarterly', interval: 1 } };
  eq(CC.occurrences(q, '2026-01-01', '2026-12-31'),
     ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
  const s = { startDate: '2026-01-15', recurring: true, recurrence: { freq: 'semiannual', interval: 1 } };
  eq(CC.occurrences(s, '2026-01-01', '2027-01-31'), ['2026-01-15', '2026-07-15', '2027-01-15']);
  const a = { startDate: '2026-03-01', recurring: true, recurrence: { freq: 'annual', interval: 1 } };
  eq(CC.occurrences(a, '2026-01-01', '2029-01-01'), ['2026-03-01', '2027-03-01', '2028-03-01']);
});

test('weekly and biweekly step in days and cross a DST boundary intact', () => {
  // US DST ends 2026-11-01. UTC arithmetic must not shift the day.
  const w = { startDate: '2026-10-25', recurring: true, recurrence: { freq: 'weekly', interval: 1 } };
  eq(CC.occurrences(w, '2026-10-25', '2026-11-16'),
     ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15']);
  const b = { startDate: '2026-10-25', recurring: true, recurrence: { freq: 'biweekly', interval: 1 } };
  eq(CC.occurrences(b, '2026-10-25', '2026-11-30'), ['2026-10-25', '2026-11-08', '2026-11-22']);
});

test('a custom-day recurrence and a >1 interval both step correctly', () => {
  const c = { startDate: '2026-01-01', recurring: true, recurrence: { freq: 'custom', customDays: 45, interval: 1 } };
  eq(CC.occurrences(c, '2026-01-01', '2026-04-01'), ['2026-01-01', '2026-02-15', '2026-04-01']);
  const e = { startDate: '2026-01-01', recurring: true, recurrence: { freq: 'monthly', interval: 2 } };
  eq(CC.occurrences(e, '2026-01-01', '2026-07-31'),
     ['2026-01-01', '2026-03-01', '2026-05-01', '2026-07-01']);
});

test('a one-time cost occurs exactly once, inside its window and nowhere else', () => {
  const e = { startDate: '2026-09-20', recurring: false, recurrence: { freq: 'once' } };
  eq(CC.occurrences(e, '2026-09-01', '2026-09-30'), ['2026-09-20']);
  eq(CC.occurrences(e, '2026-10-01', '2026-12-31'), []);
});

test('endDate stops the series, and never emits before startDate', () => {
  const e = { startDate: '2026-01-15', endDate: '2026-04-30', recurring: true, recurrence: { freq: 'monthly', interval: 1 } };
  eq(CC.occurrences(e, '2025-01-01', '2027-01-01'),
     ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
});

test('a long-running weekly cost reaches today without exploding', () => {
  const e = { startDate: '2019-01-07', recurring: true, recurrence: { freq: 'weekly', interval: 1 } };
  const got = CC.occurrences(e, '2026-09-18', '2026-10-18');
  eq(got, ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
});

test('nextDue skips the past and respects the end date', () => {
  eq(CC.nextDue({ startDate: '2026-01-31', recurring: true, recurrence: { freq: 'monthly', interval: 1 } }, NOW),
     '2026-09-30');
  eq(CC.nextDue({ startDate: '2026-01-15', endDate: '2026-03-01', recurring: true, recurrence: { freq: 'monthly', interval: 1 } }, NOW),
     null, 'a finished series has no next due date');
  eq(CC.nextDue({ startDate: '2026-05-01', recurring: false, recurrence: { freq: 'once' } }, NOW),
     null, 'a spent one-time cost is not due again');
});

test('invalid dates produce no occurrences rather than garbage', () => {
  eq(CC.occurrences({ startDate: '2026-02-30', recurring: true, recurrence: { freq: 'monthly' } }, '2026-01-01', '2026-12-31'), []);
  eq(CC.occurrences({ startDate: 'nonsense', recurring: true, recurrence: { freq: 'monthly' } }, '2026-01-01', '2026-12-31'), []);
});

// ════════════════════════════════════════════════════════════════════════════
section('Monthly normalization — the run-rate denominator');

test('every frequency normalizes to a monthly figure', () => {
  const m = (freq, amt, extra) => CC.monthlyCents(Object.assign(
    { expectedCents: amt, recurring: true, recurrence: Object.assign({ freq, interval: 1 }, extra || {}) }));
  eq(m('monthly', 2500), 2500);
  eq(m('quarterly', 30000), 10000);
  eq(m('semiannual', 60000), 10000);
  eq(m('annual', 120000), 10000);
  eq(m('weekly', 10000), 43452);      // 100.00 × 365/12 ÷ 7
  eq(m('biweekly', 10000), 21726);
  eq(m('custom', 30000, { customDays: 90 }), 10139);
});

test('a one-time cost contributes nothing to the monthly run rate', () => {
  eq(CC.monthlyCents({ expectedCents: 500000, recurring: false, recurrence: { freq: 'once' } }), 0);
  eq(CC.monthlyCents({ expectedCents: 500000, recurring: true, recurrence: { freq: 'once' } }), 0);
});

// ════════════════════════════════════════════════════════════════════════════
section('Allocation — the split must always reconstruct the whole');

test('percentage allocation sums exactly, even when it cannot divide evenly', () => {
  const e = { allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 33.33 }, { businessId: 'CPG', pct: 33.33 }, { businessId: 'DQR', pct: 33.34 }] } };
  const got = CC.allocate(e, 10000);
  eq(got.PVI + got.CPG + got.DQR, 10000, 'parts must sum to the whole');
  eq(got, { PVI: 3333, CPG: 3333, DQR: 3334 });
});

test('a three-way even split hands the leftover cent out, never drops it', () => {
  const e = { allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 33.34 }, { businessId: 'CPG', pct: 33.33 }, { businessId: 'DQR', pct: 33.33 }] } };
  const got = CC.allocate(e, 10);   // ten cents, three ways
  eq(got.PVI + got.CPG + got.DQR, 10);
});

test('allocation is exact across a thousand awkward amounts', () => {
  const e = { allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 40 }, { businessId: 'CPG', pct: 30 },
    { businessId: 'DQR', pct: 20 }, { businessId: 'SHARED', pct: 10 }] } };
  for (let amt = 1; amt <= 1000; amt++) {
    const p = CC.allocate(e, amt);
    const sum = p.PVI + p.CPG + p.DQR + p.SHARED;
    if (sum !== amt) throw new Error('lost cents at ' + amt + ': got ' + sum);
  }
});

test('the four-business worked example splits as specified', () => {
  const e = { allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 40 }, { businessId: 'CPG', pct: 30 },
    { businessId: 'DQR', pct: 20 }, { businessId: 'SHARED', pct: 10 }] } };
  eq(CC.allocate(e, 20000), { PVI: 8000, CPG: 6000, DQR: 4000, SHARED: 2000 });
});

test('single allocation charges one business and defaults to SHARED', () => {
  eq(CC.allocate({ allocation: { mode: 'single', businessId: 'PVI' } }, 5000), { PVI: 5000 });
  eq(CC.allocate({}, 5000), { SHARED: 5000 });
});

test('fixed allocation reports exactly what was entered', () => {
  const e = { allocation: { mode: 'fixed', parts: [
    { businessId: 'PVI', amountCents: 12000 }, { businessId: 'CPG', amountCents: 8000 }] } };
  eq(CC.allocate(e, 20000), { PVI: 12000, CPG: 8000 });
});

// ── validation ──
test('a valid 100% allocation passes', () => {
  const a = app();
  const r = CC.validateAllocation(a, { expectedCents: 10000, allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 60 }, { businessId: 'CPG', pct: 40 }] } });
  eq(r.ok, true);
});

test('under-allocation and over-allocation are both caught and quantified', () => {
  const a = app();
  const under = CC.validateAllocation(a, { expectedCents: 10000, allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 60 }, { businessId: 'CPG', pct: 30 }] } });
  eq(under.ok, false);
  eq(under.problems[0].code, 'percent_not_100');
  eq(under.problems[0].deltaBps, -1000);
  const over = CC.validateAllocation(a, { expectedCents: 10000, allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 60 }, { businessId: 'CPG', pct: 50 }] } });
  eq(over.problems[0].deltaBps, 1000);
});

test('fixed allocation that misses the expense total is caught', () => {
  const a = app();
  const r = CC.validateAllocation(a, { expectedCents: 20000, allocation: { mode: 'fixed', parts: [
    { businessId: 'PVI', amountCents: 12000 }, { businessId: 'CPG', amountCents: 7000 }] } });
  eq(r.ok, false);
  eq(r.problems[0].code, 'fixed_mismatch');
  eq(r.problems[0].deltaCents, -1000);
});

test('a missing, unknown or duplicated business is caught', () => {
  const a = app();
  eq(CC.validateAllocation(a, { allocation: { mode: 'single', businessId: null } }).problems[0].code, 'missing_business');
  eq(CC.validateAllocation(a, { allocation: { mode: 'single' } }).problems[0].code, 'missing_business');
  eq(CC.validateAllocation(a, { allocation: { mode: 'single', businessId: 'NOPE' } }).problems[0].code, 'unknown_business');
  const dup = CC.validateAllocation(a, { expectedCents: 100, allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 50 }, { businessId: 'PVI', pct: 50 }] } });
  ok(dup.problems.some(p => p.code === 'duplicate_business'));
  eq(CC.validateAllocation(a, { allocation: { mode: 'percent', parts: [] } }).problems[0].code, 'missing_business');
});

test('a shared cost charged wholly to one business is flagged', () => {
  const a = app();
  const r = CC.validateAllocation(a, { costType: 'shared', allocation: { mode: 'single', businessId: 'PVI' } });
  eq(r.problems[0].code, 'shared_unallocated');
  // …but shared overhead genuinely parked on SHARED is fine.
  eq(CC.validateAllocation(a, { costType: 'shared', allocation: { mode: 'single', businessId: 'SHARED' } }).ok, true);
});

// ════════════════════════════════════════════════════════════════════════════
section('Expenses — validation and lifecycle');

test('a well-formed expense is created with resolved vendor and category', () => {
  const a = app();
  const r = CC.addExpense(a, draft(), NOW);
  eq(r.ok, true);
  const e = CC.getExpense(a, r.id);
  eq(e.name, 'Supabase Pro');
  eq(e.expectedCents, 2500);
  ok(e.vendorId, 'vendor auto-created');
  eq(e.categoryId, 'cc_database', 'matched the seeded Database category by name');
  eq(e.status, 'active');
});

test('validation rejects the things that must never be stored', () => {
  const a = app();
  eq(CC.addExpense(a, draft({ name: '' }), NOW).errors[0].code, 'required');
  eq(CC.addExpense(a, draft({ expectedCents: -100 }), NOW).errors[0].code, 'negative');
  eq(CC.addExpense(a, draft({ startDate: '2026-02-30' }), NOW).errors[0].code, 'invalid_date');
  eq(CC.addExpense(a, draft({ startDate: '2026-05-01', endDate: '2026-04-01' }), NOW).errors[0].code, 'before_start');
  eq(CC.addExpense(a, draft({ recurring: true, recurrence: { freq: 'once' } }), NOW).errors[0].code,
     'recurring_without_frequency');
});

test('an expense with a broken allocation is refused outright', () => {
  const a = app();
  const r = CC.addExpense(a, draft({ allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 70 }, { businessId: 'CPG', pct: 20 }] } }), NOW);
  eq(r.ok, false);
  eq(r.errors[0].code, 'percent_not_100');
});

test('editing changes the future and keeps createdAt', () => {
  const a = app();
  const id = CC.addExpense(a, draft(), NOW).id;
  const created = CC.getExpense(a, id).createdAt;
  const r = CC.updateExpense(a, id, { expectedCents: 5000, name: 'Supabase Team' }, '2026-10-01T00:00:00Z');
  eq(r.ok, true);
  eq(CC.getExpense(a, id).expectedCents, 5000);
  eq(CC.getExpense(a, id).createdAt, created);
  ok(CC.getExpense(a, id).updatedAt > created);
});

test('status moves through the lifecycle and cancelled costs leave the run rate', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ expectedCents: 10000 }), NOW).id;
  eq(CC.runRate(a, NOW).monthlyCents, 10000);
  CC.setExpenseStatus(a, id, 'cancelled', NOW);
  eq(CC.runRate(a, NOW).monthlyCents, 0, 'a cancelled cost costs nothing');
  CC.setExpenseStatus(a, id, 'active', NOW);
  eq(CC.runRate(a, NOW).monthlyCents, 10000);
  eq(CC.setExpenseStatus(a, id, 'bogus', NOW).ok, false);
});

test('an expense with recorded payments cannot be deleted, only archived', () => {
  const a = app();
  const id = CC.addExpense(a, draft(), NOW).id;
  eq(CC.deleteExpense(a, id, NOW).ok, true, 'no history yet — deletable');
  const id2 = CC.addExpense(a, draft(), NOW).id;
  CC.recordPayment(a, { expenseId: id2, dueDate: '2026-09-10', actualCents: 2500 }, NOW);
  const r = CC.deleteExpense(a, id2, NOW);
  eq(r.ok, false);
  eq(r.reason, 'has_payments');
  eq(CC.setExpenseStatus(a, id2, 'archived', NOW).ok, true);
});

test('an omitted allocation is shared overhead; an explicitly empty one is refused', () => {
  const a = app();
  const d = draft(); delete d.allocation;
  const r = CC.addExpense(a, d, NOW);
  eq(r.ok, true);
  eq(CC.getExpense(a, r.id).allocation.businessId, 'SHARED');
  const bad = CC.addExpense(a, draft({ allocation: { mode: 'single', businessId: null } }), NOW);
  eq(bad.ok, false);
  eq(bad.errors[0].code, 'missing_business');
});

test('a planned cost is not yet a commitment', () => {
  const a = app();
  CC.addExpense(a, draft({ expectedCents: 50000, status: 'planned' }), NOW);
  eq(CC.runRate(a, NOW).monthlyCents, 0);
  eq(CC.dashboard(a, NOW).plannedCount, 1);
});

// ════════════════════════════════════════════════════════════════════════════
section('Expected vs actual — variance, and history that stays historical');

test('variance is computed from the snapshot, positive and negative', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ expectedCents: 10000 }), NOW).id;
  const up = CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 11700, paidDate: '2026-09-11' }, NOW);
  eq(up.variance.expectedCents, 10000);
  eq(up.variance.actualCents, 11700);
  eq(up.variance.varianceCents, 1700);
  eq(up.variance.variancePct, 17);
  const id2 = CC.addExpense(a, draft({ name: 'Other', expectedCents: 10000 }), NOW).id;
  const down = CC.recordPayment(a, { expenseId: id2, dueDate: '2026-09-10', actualCents: 9000 }, NOW);
  eq(down.variance.varianceCents, -1000);
  eq(down.variance.variancePct, -10);
});

test('zero variance is zero, and a missing actual is not zero', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ expectedCents: 10000 }), NOW).id;
  const p = CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 10000 }, NOW);
  eq(p.variance.varianceCents, 0);
  eq(p.variance.variancePct, 0);
  const none = CC.variance(null);
  eq(none.hasActual, false);
  eq(none.varianceCents, null, 'no actual means no variance — not a variance of zero');
});

test('RAISING the expected amount later does NOT rewrite recorded history', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ expectedCents: 2500 }), NOW).id;
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 2500, paidDate: '2026-09-10' }, NOW);
  // The vendor raises the price; the user updates the expectation.
  CC.updateExpense(a, id, { expectedCents: 4000 }, '2026-10-01T00:00:00Z');
  const pay = CC.listPayments(a, { expenseId: id })[0];
  eq(pay.expectedCents, 2500, 'the September payment still expected $25.00');
  eq(CC.variance(pay).varianceCents, 0, 'September was on budget and stays on budget');
  eq(CC.getExpense(a, id).expectedCents, 4000, 'the future expectation did change');
});

test('re-splitting a cost does not rewrite which business carried an old bill', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ expectedCents: 10000,
    allocation: { mode: 'single', businessId: 'PVI' } }), NOW).id;
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 10000 }, NOW);
  CC.updateExpense(a, id, { allocation: { mode: 'percent', parts: [
    { businessId: 'CPG', pct: 100 }] } }, '2026-10-01T00:00:00Z');
  eq(CC.listPayments(a, { expenseId: id })[0].allocation, { PVI: 10000 });
});

test('a payment is not recorded twice by accident, but can be amended on purpose', () => {
  const a = app();
  const id = CC.addExpense(a, draft(), NOW).id;
  eq(CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 2500 }, NOW).ok, true);
  const dupe = CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 9999 }, NOW);
  eq(dupe.ok, false);
  eq(dupe.reason, 'already_recorded');
  eq(CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 2700, replace: true }, NOW).ok, true);
  eq(CC.listPayments(a, { expenseId: id }).length, 1);
  eq(CC.listPayments(a, { expenseId: id })[0].actualCents, 2700);
});

test('payments validate their inputs', () => {
  const a = app();
  const id = CC.addExpense(a, draft(), NOW).id;
  eq(CC.recordPayment(a, { expenseId: 'nope', actualCents: 100 }, NOW).reason, 'unknown_expense');
  eq(CC.recordPayment(a, { expenseId: id }, NOW).errors[0].code, 'required');
  eq(CC.recordPayment(a, { expenseId: id, actualCents: 100, paidDate: '2026-13-01' }, NOW).errors[0].code, 'invalid_date');
});

// ════════════════════════════════════════════════════════════════════════════
section('Schedule, status and the occurrence lifecycle');

test('occurrence status derives from dates and payments', () => {
  const a = app();
  // due yesterday, unpaid → overdue
  CC.addExpense(a, draft({ name: 'Late', startDate: '2026-09-17', recurring: false, recurrence: { freq: 'once' } }), NOW);
  // due in 3 days → due
  CC.addExpense(a, draft({ name: 'Soon', startDate: '2026-09-21', recurring: false, recurrence: { freq: 'once' } }), NOW);
  // due in 30 days → expected
  CC.addExpense(a, draft({ name: 'Later', startDate: '2026-10-18', recurring: false, recurrence: { freq: 'once' } }), NOW);
  const rows = CC.schedule(a, '2026-09-01', '2026-11-01', NOW);
  const byName = {};
  rows.forEach(r => { byName[r.name] = r.status; });
  eq(byName, { Late: 'overdue', Soon: 'due', Later: 'expected' });
});

test('recording a payment moves an occurrence to paid and out of upcoming', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ name: 'Soon', startDate: '2026-09-21', recurring: false, recurrence: { freq: 'once' } }), NOW).id;
  eq(CC.upcoming(a, 30, NOW).length, 1);
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-21', actualCents: 2500, paidDate: '2026-09-21' }, NOW);
  eq(CC.upcoming(a, 30, NOW).length, 0);
  eq(CC.schedule(a, '2026-09-01', '2026-10-01', NOW)[0].status, 'paid');
});

test('overdue looks back but not forever, and clears when paid', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ startDate: '2026-08-15', recurring: false, recurrence: { freq: 'once' } }), NOW).id;
  CC.addExpense(a, draft({ name: 'Ancient', startDate: '2025-01-01', recurring: false, recurrence: { freq: 'once' } }), NOW);
  const od = CC.overdue(a, NOW);
  eq(od.length, 1, 'beyond the lookback window it stops being chased');
  eq(od[0].dueDate, '2026-08-15');
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-08-15', actualCents: 2500 }, NOW);
  eq(CC.overdue(a, NOW).length, 0);
});

// ════════════════════════════════════════════════════════════════════════════
section('Run rate — what it costs to keep this running');

test('run rate normalizes mixed frequencies and allocates across businesses', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Rent', expectedCents: 200000, category: 'Rent',
    recurrence: { freq: 'monthly', interval: 1 },
    allocation: { mode: 'percent', parts: [
      { businessId: 'PVI', pct: 50 }, { businessId: 'CPG', pct: 30 }, { businessId: 'SHARED', pct: 20 }] } }), NOW);
  CC.addExpense(a, draft({ name: 'Insurance', expectedCents: 120000, category: 'Insurance',
    recurrence: { freq: 'annual', interval: 1 },
    allocation: { mode: 'single', businessId: 'PVI' } }), NOW);
  const rr = CC.runRate(a, NOW);
  eq(rr.monthlyCents, 210000, '2000/mo + 1200/yr → 100/mo');
  eq(rr.annualizedCents, 2520000);
  const by = {}; rr.byBusiness.forEach(b => { by[b.businessId] = b.monthlyCents; });
  eq(by.PVI, 110000);
  eq(by.CPG, 60000);
  eq(by.SHARED, 40000);
  eq(by.DQR, 0);
  eq(by.PVI + by.CPG + by.SHARED + by.DQR, rr.monthlyCents, 'the businesses must account for the whole');
});

test('committed and estimated are kept apart — a metered guess is never a commitment', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Fixed host', expectedCents: 2000, billing: { model: 'FIXED' } }), NOW);
  CC.addExpense(a, draft({ name: 'AI usage', expectedCents: 8000,
    billing: { model: 'METERED', confidence: 'low', source: 'last 3 invoices' } }), NOW);
  const rr = CC.runRate(a, NOW);
  eq(rr.committedCents, 2000);
  eq(rr.estimatedCents, 8000);
  eq(rr.monthlyCents, 10000);
});

test('a one-time cost never enters the run rate', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'New printer', expectedCents: 450000,
    costType: 'equipment', recurring: false, recurrence: { freq: 'once' } }), NOW);
  eq(CC.runRate(a, NOW).monthlyCents, 0);
});

test('business shares add to 100% of the run rate', () => {
  const a = app();
  CC.addExpense(a, draft({ expectedCents: 30000, allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 33.33 }, { businessId: 'CPG', pct: 33.33 }, { businessId: 'DQR', pct: 33.34 }] } }), NOW);
  const rr = CC.runRate(a, NOW);
  let sum = 0; rr.byBusiness.forEach(b => { sum += b.monthlyCents; });
  eq(sum, rr.monthlyCents);
});

// ════════════════════════════════════════════════════════════════════════════
section('Forecast');

test('a monthly cost appears once per month across every horizon', () => {
  const a = app();
  CC.addExpense(a, draft({ expectedCents: 10000, startDate: '2026-09-25',
    recurrence: { freq: 'monthly', interval: 1 } }), NOW);
  eq(CC.forecast(a, 30, NOW).projectedTotalCents, 10000);
  eq(CC.forecast(a, 60, NOW).projectedTotalCents, 20000);
  eq(CC.forecast(a, 90, NOW).projectedTotalCents, 30000);
  // Sep 25 2026 through Aug 25 2027 — the Sep 2027 charge falls a week past the window.
  eq(CC.forecast(a, 365, NOW).projectedTotalCents, 120000);
});

test('forecast buckets committed, estimated, variable and one-time separately', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Rent', expectedCents: 200000, startDate: '2026-10-01',
    costType: 'fixed', billing: { model: 'FIXED' } }), NOW);
  CC.addExpense(a, draft({ name: 'AI', expectedCents: 5000, startDate: '2026-10-01',
    costType: 'infrastructure', billing: { model: 'METERED' } }), NOW);
  CC.addExpense(a, draft({ name: 'Materials', expectedCents: 30000, startDate: '2026-10-01',
    costType: 'variable', billing: { model: 'FIXED' } }), NOW);
  CC.addExpense(a, draft({ name: 'Printer', expectedCents: 450000, startDate: '2026-10-05',
    recurring: false, recurrence: { freq: 'once' } }), NOW);
  const f = CC.forecast(a, 30, NOW);
  eq(f.committedCents, 200000);
  eq(f.expectedCents, 5000);
  eq(f.variableCents, 30000);
  eq(f.oneTimeCents, 450000);
  eq(f.projectedTotalCents, 685000);
  eq(f.estimatedPortionCents, 35000, 'everything that is not a flat committed charge');
});

test('forecast allocates across businesses and totals match', () => {
  const a = app();
  CC.addExpense(a, draft({ expectedCents: 10000, startDate: '2026-09-25',
    allocation: { mode: 'percent', parts: [
      { businessId: 'PVI', pct: 60 }, { businessId: 'DQR', pct: 40 }] } }), NOW);
  const f = CC.forecast(a, 30, NOW);
  const by = {}; f.byBusiness.forEach(b => { by[b.businessId] = b.amountCents; });
  eq(by.PVI, 6000);
  eq(by.DQR, 4000);
  let sum = 0; f.byBusiness.forEach(b => { sum += b.amountCents; });
  eq(sum, f.projectedTotalCents);
});

test('an already-paid occurrence is not forecast as a future outflow', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ expectedCents: 10000, startDate: '2026-09-25',
    recurring: false, recurrence: { freq: 'once' } }), NOW).id;
  eq(CC.forecast(a, 30, NOW).projectedTotalCents, 10000);
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-25', actualCents: 10000 }, NOW);
  eq(CC.forecast(a, 30, NOW).projectedTotalCents, 0);
});

test('all five horizons are produced and increase monotonically', () => {
  const a = app();
  CC.addExpense(a, draft({ expectedCents: 10000 }), NOW);
  const h = CC.horizons(a, NOW);
  eq(h.map(x => x.days), [30, 60, 90, 180, 365]);
  for (let i = 1; i < h.length; i++)
    ok(h[i].projectedTotalCents >= h[i - 1].projectedTotalCents, 'a longer window cannot cost less');
});

test('the 12-month forecast returns 12 consecutive months starting this month', () => {
  const a = app();
  CC.addExpense(a, draft({ expectedCents: 10000, startDate: '2026-09-25' }), NOW);
  const f12 = CC.forecast12(a, NOW);
  eq(f12.length, 12);
  eq(f12[0].month, '2026-09');
  eq(f12[11].month, '2027-08');
  eq(f12[0].amountCents, 10000);
});

// ════════════════════════════════════════════════════════════════════════════
section('Dashboard totals');

test('actual, projected and annualized are computed from records', () => {
  const a = app();
  const rent = CC.addExpense(a, draft({ name: 'Rent', expectedCents: 200000,
    startDate: '2026-09-01', category: 'Rent' }), NOW).id;
  CC.addExpense(a, draft({ name: 'Internet', expectedCents: 12000, startDate: '2026-09-25',
    category: 'Internet' }), NOW);
  CC.recordPayment(a, { expenseId: rent, dueDate: '2026-09-01', actualCents: 205000, paidDate: '2026-09-02' }, NOW);
  const d = CC.dashboard(a, NOW);
  eq(d.actualThisMonthCents, 205000);
  eq(d.varianceThisMonthCents, 5000, 'rent came in $50 over');
  eq(d.remainingThisMonthCents, 12000, 'internet still to come');
  eq(d.projectedThisMonthCents, 217000);
  eq(d.monthlyRunRateCents, 212000);
  eq(d.annualizedCents, 2544000);
});

test('an empty cost centre says so rather than showing invented numbers', () => {
  const a = app();
  const d = CC.dashboard(a, NOW);
  eq(d.empty, true);
  eq(d.monthlyRunRateCents, 0);
  eq(d.actualThisMonthCents, 0);
  eq(d.projectedThisMonthCents, 0);
  eq(d.annualizedCents, 0);
  eq(d.upcoming.length, 0);
  eq(d.overdue.length, 0);
});

test('shared and business-specific costs land on the right businesses', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Shared Google Workspace', expectedCents: 6000,
    costType: 'shared', allocation: { mode: 'percent', parts: [
      { businessId: 'PVI', pct: 50 }, { businessId: 'CPG', pct: 25 }, { businessId: 'DQR', pct: 25 }] } }), NOW);
  CC.addExpense(a, draft({ name: 'PVI vinyl plotter lease', expectedCents: 24000,
    costType: 'business', allocation: { mode: 'single', businessId: 'PVI' } }), NOW);
  const by = {}; CC.dashboard(a, NOW).byBusiness.forEach(b => { by[b.businessId] = b.monthlyCents; });
  eq(by.PVI, 27000);
  eq(by.CPG, 1500);
  eq(by.DQR, 1500);
  eq(by.SHARED, 0);
});

test('a shared cost is counted ONCE, not once per business', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Shared', expectedCents: 30000, costType: 'shared',
    allocation: { mode: 'percent', parts: [
      { businessId: 'PVI', pct: 34 }, { businessId: 'CPG', pct: 33 }, { businessId: 'DQR', pct: 33 }] } }), NOW);
  eq(CC.runRate(a, NOW).monthlyCents, 30000, 'not 90000');
});

test('alerts surface overdue bills, broken allocations and price drift', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Late bill', startDate: '2026-09-01',
    recurring: false, recurrence: { freq: 'once' } }), NOW);
  const id = CC.addExpense(a, draft({ name: 'Drifting', expectedCents: 10000 }), NOW).id;
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 13000, paidDate: '2026-09-10' }, NOW);
  const codes = CC.alerts(a, NOW).map(x => x.code);
  ok(codes.indexOf('overdue') >= 0, 'overdue surfaced');
  ok(codes.indexOf('variance') >= 0, 'price drift surfaced');
});

// ════════════════════════════════════════════════════════════════════════════
section('Vendors and history');

test('vendor summary aggregates costs, monthly spend and businesses', () => {
  const a = app();
  const v = CC.upsertVendor(a, { name: 'Adobe' }, NOW).id;
  CC.addExpense(a, draft({ name: 'Creative Cloud', vendorId: v, vendor: null, expectedCents: 5999,
    allocation: { mode: 'percent', parts: [{ businessId: 'PVI', pct: 70 }, { businessId: 'CPG', pct: 30 }] } }), NOW);
  CC.addExpense(a, draft({ name: 'Stock', vendorId: v, vendor: null, expectedCents: 2999,
    recurrence: { freq: 'annual', interval: 1 } }), NOW);
  const s = CC.vendorSummary(a, NOW).filter(x => x.name === 'Adobe')[0];
  eq(s.activeCount, 2);
  eq(s.monthlyCents, 5999 + 250);
  eq(s.annualizedCents, (5999 + 250) * 12);
  eq(s.businessIds, ['CPG', 'PVI', 'SHARED']);
  ok(s.nextExpected, 'a next expected date is known');
});

test('the same vendor name is never duplicated', () => {
  const a = app();
  const first = CC.upsertVendor(a, { name: 'Vercel' }, NOW);
  const again = CC.upsertVendor(a, { name: '  vercel ' }, NOW);
  eq(again.id, first.id);
  eq(again.existing, true);
  eq(CC.listVendors(a).length, 1);
});

test('history carries expected, actual and variance and filters correctly', () => {
  const a = app();
  const id = CC.addExpense(a, draft({ name: 'Rent', expectedCents: 200000,
    startDate: '2026-06-01', category: 'Rent',
    allocation: { mode: 'single', businessId: 'PVI' } }), NOW).id;
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-06-01', actualCents: 200000, paidDate: '2026-06-01' }, NOW);
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-07-01', actualCents: 210000, paidDate: '2026-07-02' }, NOW);
  const h = CC.history(a, { from: '2026-06-01', to: '2026-09-18' }, NOW);
  eq(h.totals.paid, 2);
  eq(h.totals.actualCents, 410000);
  eq(h.totals.varianceCents, 10000);
  eq(h.rows[0].dueDate, '2026-09-01', 'newest first');
  eq(CC.history(a, { from: '2026-06-01', to: '2026-09-18', businessId: 'CPG' }, NOW).count, 0);
  eq(CC.history(a, { from: '2026-06-01', to: '2026-09-18', businessId: 'PVI' }, NOW).count, h.count);
  eq(CC.history(a, { from: '2026-06-01', to: '2026-09-18', status: 'paid' }, NOW).count, 2);
});

// ════════════════════════════════════════════════════════════════════════════
section('CSV export and import');

test('export produces a header and one row per expense', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Supabase, Pro "tier"', expectedCents: 2500 }), NOW);
  const csv = CC.exportExpensesCsv(a, NOW);
  const lines = csv.split('\n');
  eq(lines.length, 2);
  ok(lines[0].indexOf('expected_amount') >= 0);
  ok(lines[1].indexOf('"Supabase, Pro ""tier"""') >= 0, 'commas and quotes escaped');
  ok(lines[1].indexOf('25.00') >= 0);
});

test('a round trip through export and import preserves the money exactly', () => {
  const a = app();
  CC.addExpense(a, draft({ name: 'Odd amount', expectedCents: 1999 }), NOW);
  const csv = CC.exportExpensesCsv(a, NOW);
  const b = app();
  const r = CC.importCsv(b, csv, { commit: true }, NOW);
  eq(r.invalidCount, 0, JSON.stringify(r.invalid));
  eq(r.imported, 1);
  eq(CC.listExpenses(b, {}, NOW)[0].expectedCents, 1999);
});

test('import is a dry run by default and reports exactly what is wrong', () => {
  const a = app();
  const csv = [
    'name,vendor,category,expected_amount,frequency,start_date,allocation',
    'Good,Supabase,Database,25.00,monthly,2026-09-01,SHARED',
    ',Supabase,Database,25.00,monthly,2026-09-01,SHARED',
    'Bad amount,Supabase,Database,twenty,monthly,2026-09-01,SHARED',
    'Bad date,Supabase,Database,25.00,monthly,2026-02-30,SHARED',
    'Bad alloc,Supabase,Database,25.00,monthly,2026-09-01,PVI:60%; CPG:30%',
    'Bad business,Supabase,Database,25.00,monthly,2026-09-01,NOPE',
    'Bad freq,Supabase,Database,25.00,fortnightly,2026-09-01,SHARED'
  ].join('\n');
  const dry = CC.importCsv(a, csv, {}, NOW);
  eq(dry.committed, false);
  eq(dry.total, 7);
  eq(dry.validCount, 1);
  eq(dry.invalidCount, 6);
  eq(CC.listExpenses(a, {}, NOW).length, 0, 'a dry run commits nothing');
  const codes = {};
  dry.invalid.forEach(r => r.errors.forEach(e => { codes[e.code] = (codes[e.code] || 0) + 1; }));
  ok(codes.required, 'missing name reported');
  ok(codes.malformed, 'malformed amount reported');
  ok(codes.invalid_date, 'invalid date reported');
  ok(codes.percent_not_100, 'allocation error reported');
  ok(codes.unknown_business, 'unknown business reported');
  ok(codes.unknown, 'unknown frequency reported');
});

test('committing an import with broken rows imports only the good ones and says so', () => {
  const a = app();
  const csv = [
    'name,expected_amount,frequency,start_date,allocation',
    'Good one,25.00,monthly,2026-09-01,SHARED',
    'Broken,nope,monthly,2026-09-01,SHARED',
    'Good two,50.00,annual,2026-09-01,PVI'
  ].join('\n');
  const r = CC.importCsv(a, csv, { commit: true }, NOW);
  eq(r.imported, 2);
  eq(r.invalidCount, 1);
  eq(r.ok, false, 'a partial import is never reported as a clean success');
  eq(CC.listExpenses(a, {}, NOW).length, 2);
});

test('allocation text parses percentages, fixed amounts and plain business ids', () => {
  const a = app();
  eq(CC.parseAllocationText(a, 'PVI').allocation, { mode: 'single', businessId: 'PVI' });
  eq(CC.parseAllocationText(a, 'PVI:60%; CPG:40%').allocation.mode, 'percent');
  eq(CC.parseAllocationText(a, 'PVI:120.00; CPG:80.00').allocation.parts[0].amountCents, 12000);
  eq(CC.parseAllocationText(a, 'PVI:60%; CPG:40.00').ok, false, 'mixing units is an error');
  eq(CC.parseAllocationText(a, 'NOPE:100%').ok, false);
});

test('the CSV parser survives quotes, commas and CRLF', () => {
  const rows = CC.parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n');
  eq(rows, [['a', 'b'], ['x,1', 'he said "hi"']]);
});

// ════════════════════════════════════════════════════════════════════════════
section('Integrity and state');

test('a clean cost centre passes integrity', () => {
  const a = app();
  CC.addExpense(a, draft(), NOW);
  CC.addExpense(a, draft({ name: 'Split', expectedCents: 10000, allocation: { mode: 'percent', parts: [
    { businessId: 'PVI', pct: 50 }, { businessId: 'CPG', pct: 50 }] } }), NOW);
  eq(CC.integrity(a).ok, true, JSON.stringify(CC.integrity(a).problems));
});

test('integrity catches corruption that bypassed the validators', () => {
  const a = app();
  const id = CC.addExpense(a, draft(), NOW).id;
  a.costs.expenses[id].expectedCents = 25.7;          // a float snuck in
  a.costs.expenses[id].categoryId = 'cat_does_not_exist';
  const r = CC.integrity(a);
  eq(r.ok, false);
  const codes = r.problems.map(p => p.code);
  ok(codes.indexOf('non_integer_amount') >= 0);
  ok(codes.indexOf('orphan_category') >= 0);
});

test('integrity catches a payment whose expense disappeared', () => {
  const a = app();
  const id = CC.addExpense(a, draft(), NOW).id;
  CC.recordPayment(a, { expenseId: id, dueDate: '2026-09-10', actualCents: 2500 }, NOW);
  delete a.costs.expenses[id];
  ok(CC.integrity(a).problems.some(p => p.code === 'orphan_payment'));
});

test('ensure seeds the four business entities and the standard categories', () => {
  const a = app();
  eq(CC.listBusinesses(a).map(b => b.id), ['CPG', 'DQR', 'PVI', 'SHARED'], 'by name, shared last');
  eq(CC.listBusinesses(a)[3].kind, 'shared', 'shared sorts last');
  ok(CC.listCategories(a).length >= 23);
  ok(CC.listCategories(a).some(c => c.name === 'Rent'));
  ok(CC.listCategories(a).some(c => c.name === 'Payment Processing'));
});

test('ensure is idempotent and never clobbers user edits', () => {
  const a = app();
  CC.addCategory(a, { name: 'Trade Shows', group: 'growth' }, NOW);
  a.costs.businesses.PVI.name = 'Precision Vinyl and Ink LLC';
  CC.ensure(a); CC.ensure(a);
  eq(a.costs.businesses.PVI.name, 'Precision Vinyl and Ink LLC');
  ok(CC.listCategories(a).some(c => c.name === 'Trade Shows'));
});

test('categories are extensible and never duplicated by name', () => {
  const a = app();
  const first = CC.addCategory(a, { name: 'Trade Shows' }, NOW);
  const again = CC.addCategory(a, { name: 'trade shows' }, NOW);
  eq(again.id, first.id);
  eq(again.existing, true);
});

test('a new business entity can be added and carries allocation', () => {
  const a = app();
  const r = CC.addBusiness(a, { id: 'SOS', name: 'Scratch Off Studio', short: 'SOS' }, NOW);
  eq(r.ok, true);
  CC.addExpense(a, draft({ expectedCents: 10000, allocation: { mode: 'single', businessId: 'SOS' } }), NOW);
  const by = {}; CC.runRate(a, NOW).byBusiness.forEach(b => { by[b.businessId] = b.monthlyCents; });
  eq(by.SOS, 10000);
});

test('the briefing other pages read is small and honest about emptiness', () => {
  const a = app();
  eq(CC.briefing(a, NOW).empty, true);
  CC.addExpense(a, draft({ expectedCents: 10000 }), NOW);
  const b = CC.briefing(a, NOW);
  eq(b.empty, false);
  eq(b.monthlyRunRateCents, 10000);
  eq(b.annualizedCents, 120000);
});

// ── report ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log(passed + ' passed, ' + failed + ' failed');
console.log('────────────────────────────────────────────────────────────');
process.exit(failed ? 1 : 0);
