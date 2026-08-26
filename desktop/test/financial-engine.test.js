/**
 * Financial Engine tests.
 *
 * Extracts the FIN-ENGINE:BEGIN…END block out of desktop/src/index.html and
 * executes it under Node — the tests run against the exact code that ships.
 * Same harness as workos-bridge.test.js / growth-point-1.test.js: no
 * framework, no dependencies, hand-listed vm globals.
 *
 *   node desktop/test/financial-engine.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'index.html');

function loadSource() {
  const html = fs.readFileSync(SRC, 'utf8');
  const begin = html.indexOf('FIN-ENGINE:BEGIN');
  const end = html.indexOf('/* FIN-ENGINE:END */');
  if (begin < 0 || end < 0) throw new Error('FIN-ENGINE markers not found in index.html');
  const from = html.indexOf('var FIN=', begin);
  return html.slice(from, end);
}

function loadEngine() {
  const code = loadSource();
  const ctx = { console, Promise, Math, Date, Number, String, Object, Array, JSON, isNaN, isFinite, Infinity, RegExp };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'fin-engine.js' });
  if (!ctx.FIN) throw new Error('engine did not define FIN');
  return ctx.FIN;
}

const FIN = loadEngine();

// ── harness ─────────────────────────────────────────────────────────────────
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
function near(actual, expected, tol, what) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${what || 'value'}: expected ~${expected}±${tol}, got ${actual}`);
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────
const T0 = '2026-08-25T12:00:00.000Z';       // "today" for every test
const D = (n) => FIN.addDays('2026-08-25', n); // day offsets from today

function freshApp() { const app = {}; FIN.ensure(app); return app; }

/** An app with one LIFE checking + savings + credit account. */
function appWithAccounts() {
  const app = freshApp();
  const chk = FIN.addAccount(app, { name: 'Checking', domain: 'LIFE', kind: 'checking', openingBalanceCents: 100000 }, T0).id;
  const sav = FIN.addAccount(app, { name: 'Savings', domain: 'LIFE', kind: 'savings', openingBalanceCents: 500000 }, T0).id;
  const cc  = FIN.addAccount(app, { name: 'Card', domain: 'LIFE', kind: 'credit', openingBalanceCents: 0 }, T0).id;
  const wrk = FIN.addAccount(app, { name: 'PVI Checking', domain: 'WORK', businessId: 'PVI', kind: 'checking', openingBalanceCents: 200000 }, T0).id;
  return { app, chk, sav, cc, wrk };
}

async function run() {

  console.log('\nTest 1 — block purity and shape');
  await check('block reaches no DOM, storage, network or timer API', () => {
    const src = loadSource();
    ['fetch(', 'document.', 'localStorage', 'setTimeout', 'setInterval', 'XMLHttpRequest', 'navigator.']
      .forEach((bad) => {
        if (src.includes(bad)) throw new Error(`engine block contains forbidden reference: ${bad}`);
      });
    const windowRefs = src.split('window.').length - 1;
    eq(windowRefs, 1, 'window.* references (only the export guard)');
  });
  await check('block never reads the wall clock on its own', () => {
    const src = loadSource();
    ok(!src.includes('Date.now()'), 'Date.now() must not appear — now is always injected');
    ok(!/new Date\(\)/.test(src), 'new Date() with no argument must not appear');
  });
  await check('ensure() builds the finance root and seeds system categories', () => {
    const app = {};
    const f = FIN.ensure(app);
    ok(app.finance === f, 'returns app.finance');
    ok(f.categories.cat_groceries, 'seeded LIFE category');
    ok(f.categories.cat_w_revenue, 'seeded WORK category');
    ok(f.categories.cat_transfer.kind === 'transfer', 'transfer category');
    eq(f.sandbox, false, 'sandbox off by default');
    const before = JSON.stringify(f);
    FIN.ensure(app);
    eq(JSON.stringify(app.finance), before, 'ensure is idempotent');
  });
  await check('money formatting is integer-cents exact', () => {
    eq(FIN.fmt(123456), '$1,234.56');
    eq(FIN.fmt(-99), '−$0.99');
    eq(FIN.fmt(250000, { sign: true }), '+$2,500.00');
    eq(FIN.fmt(150000, { round: true }), '$1,500');
  });

  console.log('\nTest 2 — accounts');
  await check('account validation refuses bad input', () => {
    const app = freshApp();
    eq(FIN.addAccount(app, { domain: 'LIFE' }, T0).ok, false, 'missing name');
    eq(FIN.addAccount(app, { name: 'X', domain: 'BOTH' }, T0).ok, false, 'bad domain');
  });
  await check('manual account balance = opening + ledger', () => {
    const { app, chk } = appWithAccounts();
    eq(FIN.accountBalance(app, chk), 100000);
    FIN.ingest(app, 'test', [
      { sourceId: 'a', accountId: chk, date: D(-3), amountCents: -2500, name: 'Coffee' },
      { sourceId: 'b', accountId: chk, date: D(-2), amountCents: 100000, name: 'Deposit' },
    ], T0);
    eq(FIN.accountBalance(app, chk), 197500);
  });
  await check('provider accounts keep the provider balance authoritative', () => {
    const app = freshApp();
    const r = FIN.upsertProviderAccounts(app, 'plaid', [
      { providerAccountId: 'p1', name: 'Bank Checking', domain: 'LIFE', kind: 'checking', mask: '1234', balanceCents: 431000 },
    ], T0);
    eq(r.added, 1);
    const acc = FIN.listAccounts(app)[0];
    eq(FIN.accountBalance(app, acc.id), 431000, 'provider figure wins');
    FIN.upsertProviderAccounts(app, 'plaid', [{ providerAccountId: 'p1', balanceCents: 400000 }], T0);
    eq(FIN.accountBalance(app, acc.id), 400000, 'update in place');
    eq(FIN.listAccounts(app).length, 1, 'no duplicate account');
  });

  console.log('\nTest 3 — ingestion is idempotent and auditable');
  await check('replaying the same batch cannot duplicate transactions', () => {
    const { app, chk } = appWithAccounts();
    const raws = [
      { sourceId: 't1', accountId: chk, date: D(-1), amountCents: -4200, name: 'JEWEL-OSCO #3341' },
      { sourceId: 't2', accountId: chk, date: D(-1), amountCents: -899, name: 'Netflix.com' },
    ];
    const r1 = FIN.ingest(app, 'plaid', raws, T0);
    eq(r1.added, 2);
    const r2 = FIN.ingest(app, 'plaid', raws, T0);
    eq(r2.added, 0, 'no new rows on replay');
    eq(r2.updated, 0, 'no phantom updates on identical replay');
    eq(FIN.listTxns(app).length, 2);
  });
  await check('provider amount corrections update in place with an audit entry', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'x', accountId: chk, date: D(-1), amountCents: -1000, name: 'Gas' }], T0);
    FIN.ingest(app, 'plaid', [{ sourceId: 'x', accountId: chk, date: D(-1), amountCents: -1250, name: 'Gas' }], T0);
    const t = FIN.listTxns(app)[0];
    eq(t.amountCents, -1250);
    ok(app.finance.audit.some(a => a.kind === 'txn.amount'), 'amount change audited');
  });
  await check('provider removals mark the row removed — never delete, never count', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'r1', accountId: chk, date: D(-1), amountCents: -5000, name: 'Dup' }], T0);
    eq(FIN.accountBalance(app, chk), 95000);
    FIN.ingest(app, 'plaid', [{ sourceId: 'r1', accountId: chk, removed: true, date: D(-1), amountCents: -5000 }], T0);
    eq(FIN.listTxns(app).length, 0, 'excluded from listings');
    eq(FIN.listTxns(app, { removed: true }).length, 1, 'still present for audit');
    eq(FIN.accountBalance(app, chk), 100000, 'excluded from balances');
  });
  await check('malformed rows are rejected, not guessed at', () => {
    const { app, chk } = appWithAccounts();
    const r = FIN.ingest(app, 'plaid', [
      { sourceId: 'ok', accountId: chk, date: D(0), amountCents: -100, name: 'ok' },
      { sourceId: 'bad1', accountId: 'nope', date: D(0), amountCents: -100, name: 'no account' },
      { sourceId: 'bad2', accountId: chk, date: 'yesterday', amountCents: -100, name: 'bad date' },
      { accountId: chk, date: D(0), amountCents: -100, name: 'no source id' },
    ], T0);
    eq(r.added, 1);
    eq(r.rejected, 3);
  });

  console.log('\nTest 4 — pending → posted reconciliation');
  await check('a posted txn replaces its pending hold and inherits decisions', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'p_1', accountId: chk, date: D(-2), amountCents: -675, name: 'STARBUCKS', pending: true }], T0);
    const pend = FIN.listTxns(app)[0];
    FIN.setCategory(app, pend.id, 'cat_dining', 'user', T0);
    FIN.ingest(app, 'plaid', [{ sourceId: 'q_1', accountId: chk, date: D(-1), amountCents: -675, name: 'STARBUCKS #442', pendingSourceId: 'p_1' }], T0);
    const live = FIN.listTxns(app);
    eq(live.length, 1, 'one live transaction, not two');
    eq(live[0].status, 'posted');
    eq(live[0].categoryId, 'cat_dining', 'category carried over');
    eq(live[0].reviewed, true, 'review carried over');
    eq(FIN.accountBalance(app, chk), 100000 - 675, 'counted exactly once');
  });
  await check('heuristic pending match tolerates small drift (tip settles)', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'h_p', accountId: chk, date: D(-2), amountCents: -2000, name: 'RESTAURANT', pending: true }], T0);
    FIN.ingest(app, 'plaid', [{ sourceId: 'h_f', accountId: chk, date: D(-1), amountCents: -2200, name: 'RESTAURANT' }], T0);
    eq(FIN.listTxns(app).length, 1, 'reconciled into one');
    eq(FIN.listTxns(app)[0].amountCents, -2200, 'posted amount wins');
  });
  await check('unrelated amounts do NOT get swallowed by reconciliation', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'u_p', accountId: chk, date: D(-2), amountCents: -2000, name: 'SHOP', pending: true }], T0);
    FIN.ingest(app, 'plaid', [{ sourceId: 'u_f', accountId: chk, date: D(-1), amountCents: -9000, name: 'SHOP' }], T0);
    eq(FIN.listTxns(app).length, 2, 'both stand — 350% is not drift');
  });

  console.log('\nTest 5 — categorization precedence');
  await check('system merchant rules classify common brands', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'c1', accountId: chk, date: D(-1), amountCents: -1549, name: 'Netflix.com' }], T0);
    const t = FIN.listTxns(app)[0];
    eq(t.categoryId, 'cat_subscriptions');
    eq(t.catBy, 'system');
  });
  await check('paycheck inflows and business payouts are classified by domain', () => {
    const { app, chk, wrk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [
      { sourceId: 'pc1', accountId: chk, date: D(-1), amountCents: 215000, name: 'ACME PAYROLL DIRECT DEP' },
      { sourceId: 'wp1', accountId: wrk, date: D(-1), amountCents: 154000, name: 'STRIPE PAYOUT' },
      { sourceId: 'ws1', accountId: wrk, date: D(-2), amountCents: -38000, name: 'ULINE SHIP SUPPLIES' },
    ], T0);
    const f = app.finance;
    eq(FIN.listTxns(app).find(t => /payroll/i.test(t.name)).categoryId, 'cat_paycheck');
    eq(FIN.listTxns(app).find(t => /stripe/i.test(t.name)).categoryId, 'cat_w_revenue');
    eq(FIN.listTxns(app).find(t => /uline/i.test(t.name)).categoryId, 'cat_w_supplies');
  });
  await check('a user rule outranks the system map', () => {
    const { app, chk } = appWithAccounts();
    FIN.addRule(app, { priority: 50, match: { nameContains: 'netflix' }, set: { categoryId: 'cat_entertainment' }, createdBy: 'user' }, T0);
    FIN.ingest(app, 'plaid', [{ sourceId: 'c2', accountId: chk, date: D(-1), amountCents: -1549, name: 'Netflix.com' }], T0);
    eq(FIN.listTxns(app)[0].categoryId, 'cat_entertainment');
    eq(FIN.listTxns(app)[0].catBy, 'rule');
  });
  await check('a confirmed classification is never silently changed', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'c3', accountId: chk, date: D(-1), amountCents: -1549, name: 'Netflix.com' }], T0);
    const t = FIN.listTxns(app)[0];
    FIN.setCategory(app, t.id, 'cat_misc', 'user', T0);
    FIN.addRule(app, { priority: 99, match: { nameContains: 'netflix' }, set: { categoryId: 'cat_entertainment' } }, T0);
    const r = FIN.applyRulesRetro(app, T0);
    eq(app.finance.txns[t.id].categoryId, 'cat_misc', 'user choice survives retro rules');
    eq(r.recategorized, 0);
  });
  await check('retro rules do recategorize unreviewed machine guesses', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'plaid', [{ sourceId: 'c4', accountId: chk, date: D(-1), amountCents: -2500, name: 'MYSTERY VENDOR LLC' }], T0);
    eq(FIN.listTxns(app)[0].categoryId, 'cat_uncat');
    FIN.addRule(app, { priority: 10, match: { nameContains: 'mystery vendor' }, set: { categoryId: 'cat_shopping' } }, T0);
    const r = FIN.applyRulesRetro(app, T0);
    eq(r.recategorized, 1);
    eq(FIN.listTxns(app)[0].categoryId, 'cat_shopping');
  });

  console.log('\nTest 6 — splits');
  await check('splits must sum exactly to the original', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'test', [{ sourceId: 's1', accountId: chk, date: D(-1), amountCents: -50000, name: 'COSTCO' }], T0);
    const t = FIN.listTxns(app)[0];
    const bad = FIN.setSplits(app, t.id, [
      { amountCents: -30000, categoryId: 'cat_groceries' },
      { amountCents: -15000, categoryId: 'cat_shopping' },
    ], T0);
    eq(bad.ok, false); eq(bad.reason, 'sum_mismatch');
    const good = FIN.setSplits(app, t.id, [
      { amountCents: -30000, categoryId: 'cat_w_supplies', domain: 'WORK', businessId: 'PVI' },
      { amountCents: -20000, categoryId: 'cat_groceries' },
    ], T0);
    eq(good.ok, true);
    eq(FIN.integrity(app).ok, true);
  });
  await check('split parts route spend to their own domain', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'test', [{ sourceId: 's2', accountId: chk, date: '2026-08-10', amountCents: -50000, name: 'COSTCO' }], T0);
    const t = FIN.listTxns(app)[0];
    FIN.setSplits(app, t.id, [
      { amountCents: -30000, categoryId: 'cat_w_supplies', domain: 'WORK', businessId: 'PVI' },
      { amountCents: -20000, categoryId: 'cat_groceries', domain: 'LIFE' },
    ], T0);
    const rep = FIN.spendingReport(app, { month: '2026-08', domain: 'LIFE' }, T0);
    const groceries = rep.spend.find(r => r.categoryId === 'cat_groceries');
    eq(groceries.amountCents, 20000, 'LIFE sees only the LIFE part');
    ok(!rep.spend.find(r => r.categoryId === 'cat_w_supplies'), 'WORK part invisible to LIFE');
  });

  console.log('\nTest 7 — transfers');
  await check('checking→savings is auto-paired and is neither income nor spend', () => {
    const { app, chk, sav } = appWithAccounts();
    FIN.ingest(app, 'test', [
      { sourceId: 'x1', accountId: chk, date: '2026-08-10', amountCents: -50000, name: 'TRANSFER TO SAVINGS' },
      { sourceId: 'x2', accountId: sav, date: '2026-08-10', amountCents: 50000, name: 'TRANSFER FROM CHECKING' },
    ], T0);
    const ts = FIN.listTxns(app);
    ok(ts[0].transferId && ts[0].transferId === ts[1].transferId, 'paired');
    eq(ts[0].categoryId, 'cat_transfer');
    const rep = FIN.spendingReport(app, { month: '2026-08', domain: 'LIFE' }, T0);
    eq(rep.income.length, 0, 'no fake income');
    eq(rep.spend.length, 0, 'no fake spend');
    const b = FIN.budgetStatus(app, '2026-08', T0);
    eq(b.incomeCents, 0); eq(b.spendCents, 0);
  });
  await check('a loose match (3 days apart) is suggested, never auto-paired', () => {
    const { app, chk, sav } = appWithAccounts();
    FIN.ingest(app, 'test', [
      { sourceId: 'y1', accountId: chk, date: '2026-08-10', amountCents: -70000, name: 'WITHDRAWAL' },
      { sourceId: 'y2', accountId: sav, date: '2026-08-13', amountCents: 70000, name: 'DEPOSIT' },
    ], T0);
    const ts = FIN.listTxns(app);
    ok(!ts[0].transferId && !ts[1].transferId, 'not auto-paired');
    const inb = FIN.inbox(app, T0);
    ok(inb.some(i => i.kind === 'possible_transfer'), 'surfaced for review');
  });
  await check('unpair restores the pre-pairing state', () => {
    const { app, chk, sav } = appWithAccounts();
    FIN.ingest(app, 'test', [
      { sourceId: 'z1', accountId: chk, date: '2026-08-10', amountCents: -1000, name: 'MOVE' },
      { sourceId: 'z2', accountId: sav, date: '2026-08-10', amountCents: 1000, name: 'MOVE' },
    ], T0);
    const tid = FIN.listTxns(app)[0].transferId;
    ok(tid, 'was paired');
    FIN.unpairTransfer(app, tid, T0);
    ok(FIN.listTxns(app).every(t => !t.transferId), 'unpaired');
    eq(FIN.integrity(app).ok, true);
  });

  console.log('\nTest 8 — recurring streams and subscriptions');
  function subscriptionApp() {
    const { app, chk, cc } = appWithAccounts();
    const raws = [];
    // Netflix monthly ×4, with a price rise on the last charge
    ['2026-05-20', '2026-06-20', '2026-07-20', '2026-08-19'].forEach((d, i) => {
      raws.push({ sourceId: 'nf' + i, accountId: cc, date: d, amountCents: i === 3 ? -1799 : -1549, name: 'Netflix.com' });
    });
    // Paycheck biweekly ×5
    ['2026-06-26', '2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21'].forEach((d, i) => {
      raws.push({ sourceId: 'pay' + i, accountId: chk, date: d, amountCents: 215000, name: 'ACME PAYROLL' });
    });
    FIN.ingest(app, 'test', raws, T0);
    FIN.detectRecurring(app, T0);
    return { app, chk, cc };
  }
  await check('monthly and biweekly cadences are detected with confidence', () => {
    const { app } = subscriptionApp();
    const streams = FIN.listRecurring(app);
    const nf = streams.find(s => /netflix/i.test(s.name));
    const pay = streams.find(s => /acme/i.test(s.name));
    ok(nf, 'netflix stream exists');
    eq(nf.cadence, 'monthly');
    ok(pay, 'paycheck stream exists');
    eq(pay.cadence, 'biweekly');
    ok(pay.expectedAmountCents === 215000, 'inflow stream amount');
    ok(nf.confidence > 0.5 && nf.confidence <= 1, 'confidence in range: ' + nf.confidence);
    ok(nf.nextDate > '2026-08-19', 'projects a next date');
  });
  await check('a material price change is flagged, small noise is not', () => {
    const { app } = subscriptionApp();
    const nf = FIN.listRecurring(app).find(s => /netflix/i.test(s.name));
    ok(nf.priceChange, 'price change detected');
    eq(nf.priceChange.toCents, -1799);
    const subs = FIN.subscriptions(app, T0);
    const item = subs.subs.find(s => /netflix/i.test(s.name));
    ok(item.priceChange, 'surfaced on the subscription view');
  });
  await check('a variable-spend merchant is NEVER a price change', () => {
    const { app, chk } = appWithAccounts();
    // Weekly groceries, different every time — variance, not a hike.
    const raws = ['2026-07-15', '2026-07-22', '2026-07-29', '2026-08-05', '2026-08-12'].map((d, i) => (
      { sourceId: 'gr' + i, accountId: chk, date: d, amountCents: [-6212, -9011, -7430, -8125, -11890][i], name: 'JEWEL-OSCO #3341' }
    ));
    FIN.ingest(app, 'test', raws, T0);
    FIN.detectRecurring(app, T0);
    const gr = FIN.listRecurring(app).find(s => /jewel/i.test(s.name));
    ok(gr, 'the stream itself is detected');
    ok(!gr.priceChange, 'but no price-change flag on variable amounts');
    ok(!FIN.alerts(app, T0).some(a => a.type === 'subscription_increase'), 'and no alert noise');
  });
  await check('subscription totals normalize cadence to monthly + annual', () => {
    const { app } = subscriptionApp();
    const subs = FIN.subscriptions(app, T0);
    const nf = subs.subs.find(s => /netflix/i.test(s.name));
    ok(nf.monthlyCents >= 1549 && nf.monthlyCents <= 1799, 'monthly ≈ charge');
    eq(nf.annualCents, nf.monthlyCents * 12);
    ok(!subs.subs.some(s => /acme/i.test(s.name)), 'income streams are not subscriptions');
  });
  await check('muting a stream removes it from projections', () => {
    const { app } = subscriptionApp();
    const nf = FIN.listRecurring(app).find(s => /netflix/i.test(s.name));
    FIN.muteStream(app, nf.id, true, T0);
    const evs = FIN.events(app, { from: '2026-08-26', to: '2026-10-01', domain: 'LIFE' }, T0);
    ok(!evs.some(e => /netflix/i.test(e.label)), 'muted stream projects nothing');
  });

  console.log('\nTest 9 — expected payments (the check in the mail)');
  await check('a single in-window candidate auto-matches', () => {
    const { app, wrk } = appWithAccounts();
    FIN.addExpected(app, {
      label: 'Check · Fox Valley', direction: 'in', amountCents: 250000,
      expectedDate: D(-1), method: 'check', domain: 'WORK', businessId: 'PVI', confidence: 0.5,
    }, T0);
    FIN.ingest(app, 'test', [{ sourceId: 'dep1', accountId: wrk, date: D(0), amountCents: 250000, name: 'MOBILE DEPOSIT' }], T0);
    const e = FIN.listExpected(app)[0];
    eq(e.status, 'received', 'matched on deposit');
    ok(e.matchedTxnId, 'linked to the transaction');
  });
  await check('ambiguity becomes a review item, not a guess', () => {
    const { app, wrk } = appWithAccounts();
    FIN.addExpected(app, { label: 'Check', direction: 'in', amountCents: 100000, expectedDate: D(0), domain: 'WORK' }, T0);
    FIN.ingest(app, 'test', [
      { sourceId: 'd1', accountId: wrk, date: D(0), amountCents: 100000, name: 'DEPOSIT A' },
      { sourceId: 'd2', accountId: wrk, date: D(-1), amountCents: 100000, name: 'DEPOSIT B' },
    ], T0);
    const e = FIN.listExpected(app)[0];
    eq(e.status, 'open', 'not auto-matched');
    ok(FIN.suggestedExpectedMatches(app).length === 1, 'both candidates offered');
    ok(FIN.inbox(app, T0).some(i => i.kind === 'match_payment'), 'in the review queue');
  });
  await check('an overdue expected payment is flagged missed, never deleted', () => {
    const { app } = appWithAccounts();
    FIN.addExpected(app, { label: 'Late check', direction: 'in', amountCents: 50000, expectedDate: D(-20), domain: 'WORK' }, T0);
    const inb = FIN.inbox(app, T0);
    ok(inb.some(i => i.kind === 'expected_missed'), 'flagged in review');
    eq(FIN.listExpected(app)[0].status, 'open', 'still open until a human decides');
  });

  console.log('\nTest 10 — events and the forecast curve');
  await check('forecast math is exact and scenarios differ only on inflow confidence', () => {
    const { app, chk } = appWithAccounts();          // checking opens at $1,000
    FIN.addExpected(app, { label: 'Sure invoice', direction: 'in', amountCents: 100000, expectedDate: D(5), domain: 'LIFE', confidence: 0.9 }, T0);
    FIN.addExpected(app, { label: 'Maybe check', direction: 'in', amountCents: 50000, expectedDate: D(10), domain: 'LIFE', confidence: 0.3 }, T0);
    FIN.addExpected(app, { label: 'Rent', direction: 'out', amountCents: 160000, expectedDate: D(3), domain: 'LIFE', confidence: 0.4 }, T0);
    const fc = FIN.forecast(app, { domain: 'LIFE', days: 30 }, T0);
    // savings ($5,000) + checking ($1,000) are both LIFE cash accounts
    eq(fc.openingCents, 600000, 'opening = checking + savings');
    eq(fc.conservative.endingCents, 600000 - 160000 + 100000, 'conservative: high-conf inflow only, ALL outflows');
    eq(fc.expected.endingCents, 600000 - 160000 + 100000, 'expected: same here');
    eq(fc.optimistic.endingCents, 600000 - 160000 + 100000 + 50000, 'optimistic adds the maybe-check');
    eq(fc.conservative.minCents, 600000 - 160000, 'min hits after rent, before the inflow');
    eq(fc.conservative.minDate, D(3));
  });
  await check('outflows are never dropped by optimism', () => {
    const { app } = appWithAccounts();
    FIN.addExpected(app, { label: 'Big bill', direction: 'out', amountCents: 90000, expectedDate: D(2), domain: 'LIFE', confidence: 0.1 }, T0);
    const fc = FIN.forecast(app, { domain: 'LIFE', days: 10 }, T0);
    eq(fc.conservative.endingCents, fc.optimistic.endingCents, 'a speculative BILL still counts everywhere');
    eq(fc.conservative.endingCents, 600000 - 90000);
  });
  await check('the event feed carries confidence, domain and source', () => {
    const { app } = appWithAccounts();
    FIN.addExpected(app, { label: 'Check', direction: 'in', amountCents: 10000, expectedDate: D(4), domain: 'WORK', businessId: 'PVI', confidence: 0.5 }, T0);
    const evs = FIN.events(app, { domain: 'WORK' }, T0);
    eq(evs.length, 1);
    eq(evs[0].domain, 'WORK');
    eq(evs[0].confidence, 0.5);
    const lifeEvs = FIN.events(app, { domain: 'LIFE' }, T0);
    eq(lifeEvs.length, 0, 'domain isolation holds');
  });

  console.log('\nTest 11 — budgets');
  await check('budget status tracks spend per category with rollover', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'test', [
      { sourceId: 'b1', accountId: chk, date: '2026-07-10', amountCents: -30000, name: 'JEWEL-OSCO' },
      { sourceId: 'b2', accountId: chk, date: '2026-08-10', amountCents: -20000, name: 'JEWEL-OSCO' },
      { sourceId: 'b3', accountId: chk, date: '2026-08-12', amountCents: 400000, name: 'ACME PAYROLL' },
    ], T0);
    FIN.budgetSet(app, '2026-07', 'cat_groceries', 50000, {}, T0);
    FIN.budgetSet(app, '2026-08', 'cat_groceries', 50000, { rollover: true }, T0);
    const s = FIN.budgetStatus(app, '2026-08', T0);
    const g = s.items.find(i => i.categoryId === 'cat_groceries');
    eq(g.spentCents, 20000);
    eq(g.rolloverInCents, 20000, 'July left $200 on the table');
    eq(g.effectiveLimitCents, 70000);
    eq(g.remainingCents, 50000);
    eq(s.spendCents, 20000, 'month totals');
  });

  console.log('\nTest 12 — net worth and debts');
  await check('net worth is by-domain, and linked debts are not double-counted', () => {
    const { app, cc } = appWithAccounts();
    FIN.ingest(app, 'test', [{ sourceId: 'nw1', accountId: cc, date: D(-5), amountCents: -84500, name: 'BEST BUY' }], T0);
    FIN.upsertDebt(app, { name: 'Card', kind: 'credit_card', balanceCents: 84500, aprBps: 2499, minPaymentCents: 4500, dueDay: 21, accountId: cc, domain: 'LIFE' }, T0);
    FIN.upsertDebt(app, { name: 'Car loan', kind: 'loan', balanceCents: 1200000, aprBps: 700, minPaymentCents: 35000, dueDay: 5, domain: 'LIFE' }, T0);
    const nw = FIN.netWorthCompute(app, T0);
    eq(nw.LIFE.assetsCents, 600000, 'checking+savings');
    eq(nw.LIFE.liabilitiesCents, 84500 + 1200000, 'card balance once + unlinked loan');
    eq(nw.WORK.assetsCents, 200000, 'business cash stays on its own side');
    eq(nw.combined.netCents, 600000 + 200000 - 84500 - 1200000);
  });
  await check('daily snapshots replace same-day and feed the trend', () => {
    const { app } = appWithAccounts();
    FIN.netWorthSnapshot(app, T0);
    FIN.netWorthSnapshot(app, T0);
    eq(app.finance.netWorth.length, 1, 'one snapshot per day');
  });
  await check('payoff simulation quantifies interest saved by an extra payment', () => {
    const { app } = appWithAccounts();
    const id = FIN.upsertDebt(app, { name: 'Card', balanceCents: 500000, aprBps: 2400, minPaymentCents: 15000, dueDay: 15 }, T0).id;
    const p = FIN.payoffPlan(app, id, 50000, T0);
    ok(p.baseline.paysOff && p.plan.paysOff);
    ok(p.plan.months < p.baseline.months, 'extra payment shortens the payoff');
    ok(p.interestSavedCents > 0, 'and saves real interest: ' + p.interestSavedCents);
  });
  await check('a payment below interest is reported as never paying off — not looped', () => {
    const { app } = appWithAccounts();
    const id = FIN.upsertDebt(app, { name: 'Trap', balanceCents: 1000000, aprBps: 3000, minPaymentCents: 2000 }, T0).id;
    const p = FIN.payoffPlan(app, id, 0, T0);
    eq(p.baseline.paysOff, false);
  });

  console.log('\nTest 13 — goals');
  await check('goal status derives required monthly from the deadline', () => {
    const { app, sav } = appWithAccounts();
    const id = FIN.upsertGoal(app, { name: 'Emergency fund', targetCents: 1000000, linkedAccountId: sav, deadline: FIN.addDays('2026-08-25', 152) }, T0).id;
    const g = FIN.goalStatus(app, id, T0);
    eq(g.currentCents, 500000, 'reads the linked account');
    eq(g.remainingCents, 500000);
    eq(g.monthsLeft, 5);
    eq(g.requiredMonthlyCents, 100000);
  });

  console.log('\nTest 14 — what-if never mutates the real books');
  await check('a simulated purchase changes the scenario, not the state', () => {
    const { app } = appWithAccounts();
    FIN.addExpected(app, { label: 'Paycheck', direction: 'in', amountCents: 200000, expectedDate: D(5), domain: 'LIFE', confidence: 0.9 }, T0);
    const before = JSON.stringify(app.finance);
    const sim = FIN.whatIf(app, [{ type: 'spend', amountCents: 150000, label: 'New laptop' }], { domain: 'LIFE', days: 30 }, T0);
    eq(JSON.stringify(app.finance), before, 'real state untouched');
    eq(sim.diffEndingCents, -150000, 'scenario ends exactly the purchase lower');
    ok(['low', 'elevated', 'high'].includes(sim.riskLevel));
  });
  await check('paying off a debt in scenario removes its payments there only', () => {
    const { app } = appWithAccounts();
    const id = FIN.upsertDebt(app, { name: 'Card', balanceCents: 84500, aprBps: 2499, minPaymentCents: 4500, dueDay: 27, domain: 'LIFE' }, T0).id;
    const sim = FIN.whatIf(app, [{ type: 'payoff_debt', debtId: id }], { domain: 'LIFE', days: 60 }, T0);
    ok(app.finance.debts[id], 'real debt still exists');
    const scenDebtEvents = sim.scenario.events.filter(e => e.type === 'debt');
    eq(scenDebtEvents.length, 0, 'no minimum payments in the scenario');
    ok(sim.base.events.some(e => e.type === 'debt'), 'baseline still pays minimums');
  });

  console.log('\nTest 15 — business finance snapshot (reference, never a copy)');
  const bizPayload = (overrides) => Object.assign({
    serverTime: T0,
    receivables: [{
      externalId: 'inv-1', externalTable: 'pvi_invoices', business: 'PVI',
      label: 'INV-1001', number: 'INV-1001', totalCents: 233275, paidCents: 116638,
      remainingCents: 116637, status: 'partial', issuedAt: '2026-08-14T00:00:00Z', dueDate: D(6),
    }],
    payments: [{ externalId: 'pay-1', business: 'PVI', amountCents: 116638, method: 'stripe', paidAt: '2026-08-14T00:00:00Z', invoiceExternalId: 'inv-1' }],
    subscriptions: [{ externalId: 'sub-1', externalTable: 'print_club_subscriptions', business: 'PVI', plan: 'print_club', mrrCents: 9900, status: 'active' }],
    obligations: [{ externalId: 'ob-1', externalTable: 'cpg_cash_obligations', business: 'CPG', label: 'Vendor retainer', amountCents: 40000, dueDate: D(12), recurringMonthly: false, active: true }],
  }, overrides || {});
  await check('an open receivable becomes an expected inflow with honest confidence', () => {
    const { app } = appWithAccounts();
    const r = FIN.applyBizFinance(app, bizPayload(), T0);
    eq(r.applied, true);
    const exp = FIN.listExpected(app, { domain: 'WORK' });
    eq(exp.length, 1);
    eq(exp[0].amountCents, 116637, 'the REMAINDER, not the invoice total');
    eq(exp[0].source, 'business');
    eq(exp[0].confidence, FIN.CFG.RECEIVABLE_DUE_CONF, 'due date ⇒ high confidence');
    ok(exp[0].ref && exp[0].ref.externalId === 'inv-1', 'identity is the externalId');
    const ar = FIN.bizReceivables(app, T0);
    eq(ar.openCents, 116637);
    eq(ar.mrrCents, 9900, 'MRR is carried separately — never as cash');
  });
  await check('live beats manual: a fresh snapshot overwrites local edits', () => {
    const { app } = appWithAccounts();
    FIN.applyBizFinance(app, bizPayload(), T0);
    const exp = FIN.listExpected(app, { domain: 'WORK' })[0];
    app.finance.expected[exp.id].amountCents = 999999;   // someone typed over it
    FIN.applyBizFinance(app, bizPayload(), T0);
    eq(FIN.listExpected(app, { domain: 'WORK' })[0].amountCents, 116637, 'snapshot wins');
  });
  await check('a receivable settled server-side closes its expected payment', () => {
    const { app } = appWithAccounts();
    FIN.applyBizFinance(app, bizPayload(), T0);
    const paid = bizPayload();
    paid.receivables[0].remainingCents = 0;
    paid.receivables[0].status = 'paid';
    FIN.applyBizFinance(app, paid, T0);
    eq(FIN.listExpected(app, { domain: 'WORK' })[0].status, 'received');
    eq(FIN.bizReceivables(app, T0).openCents, 0);
  });
  await check('a receivable that vanishes from the snapshot stops forecasting money', () => {
    const { app } = appWithAccounts();
    FIN.applyBizFinance(app, bizPayload(), T0);
    FIN.applyBizFinance(app, bizPayload({ receivables: [] }), T0);
    const e = FIN.listExpected(app, { domain: 'WORK' })[0];
    ok(e.status === 'cancelled' || e.status === 'received', 'no zombie expected: ' + e.status);
    const evs = FIN.events(app, { domain: 'WORK' }, T0);
    ok(!evs.some(ev => ev.type === 'receivable'), 'gone from the forecast');
  });
  await check('obligations project as payable outflows', () => {
    const { app } = appWithAccounts();
    FIN.applyBizFinance(app, bizPayload(), T0);
    const evs = FIN.events(app, { domain: 'WORK', to: D(20) }, T0);
    const pay = evs.find(e => e.type === 'payable');
    ok(pay, 'payable present');
    eq(pay.amountCents, -40000);
  });
  await check('a malformed payload is refused, and errors never fake success', () => {
    const { app } = appWithAccounts();
    eq(FIN.applyBizFinance(app, null, T0).applied, false);
    eq(FIN.applyBizFinance(app, { serverTime: T0 }, T0).applied, false);
    FIN.markBizError(app, new Error('bridge 503'), T0);
    eq(app.finance.biz.sync.status, 'error');
    ok(FIN.inbox(app, T0).some(i => i.kind === 'sync_error'), 'surfaced to review');
  });

  console.log('\nTest 16 — inbox and alerts');
  await check('uncategorized txns queue for review and dismissals stick', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'test', [{ sourceId: 'i1', accountId: chk, date: D(-1), amountCents: -12345, name: 'WHO KNOWS LLC' }], T0);
    const inb = FIN.inbox(app, T0);
    const item = inb.find(i => i.kind === 'uncategorized');
    ok(item, 'queued');
    FIN.dismissInbox(app, item.key, T0);
    ok(!FIN.inbox(app, T0).some(i => i.key === item.key), 'dismissed');
  });
  await check('alerts fire on low balance and projected dip, and can be turned off', () => {
    const app = freshApp();
    FIN.addAccount(app, { name: 'Thin checking', domain: 'LIFE', kind: 'checking', openingBalanceCents: 5000 }, T0);
    let al = FIN.alerts(app, T0);
    ok(al.some(a => a.type === 'low_balance'), 'low balance fires');
    FIN.setAlertCfg(app, 'low_balance', { off: true }, T0);
    al = FIN.alerts(app, T0);
    ok(!al.some(a => a.type === 'low_balance'), 'silenced by config');
  });

  console.log('\nTest 17 — briefing');
  await check('the briefing carries cash, week flow, projection and attention', () => {
    const { app } = appWithAccounts();
    FIN.addExpected(app, { label: 'Paycheck', direction: 'in', amountCents: 215000, expectedDate: D(3), domain: 'LIFE', confidence: 0.9 }, T0);
    FIN.addExpected(app, { label: 'Rent', direction: 'out', amountCents: 160000, expectedDate: D(5), domain: 'LIFE', confidence: 0.9 }, T0);
    const b = FIN.briefing(app, T0);
    eq(b.lifeCashCents, 600000);
    eq(b.workCashCents, 200000);
    eq(b.weekInCents, 215000);
    eq(b.weekOutCents, 160000);
    ok(b.upcoming.length >= 2);
    ok(typeof b.minProjected30Cents === 'number');
  });

  console.log('\nTest 18 — CSV import');
  await check('a typical bank export parses, imports once, and never twice', () => {
    const { app, chk } = appWithAccounts();
    const csv = [
      'Date,Description,Amount',
      '08/20/2026,JEWEL-OSCO #3341,-42.18',
      '08/21/2026,"ACME PAYROLL, INC",2150.00',
      '2026-08-22,REFUND,(15.49)',
    ].join('\n');
    const r = FIN.importCsv(app, chk, csv, T0);
    eq(r.ok, true);
    eq(r.result.added, 3);
    const again = FIN.importCsv(app, chk, csv, T0);
    eq(again.ok, false);
    eq(again.reason, 'already_imported');
    const ts = FIN.listTxns(app);
    ok(ts.some(t => t.amountCents === -4218), 'M/D/Y negative');
    ok(ts.some(t => t.amountCents === 215000), 'quoted description');
    ok(ts.some(t => t.amountCents === -1549), 'parenthesized negative');
  });
  await check('debit/credit dual-column exports are understood', () => {
    const { app, chk } = appWithAccounts();
    const csv = [
      'Posting Date,Description,Debit,Credit',
      '08/20/2026,GROCERY,42.18,',
      '08/21/2026,PAYROLL,,2150.00',
    ].join('\n');
    const r = FIN.importCsv(app, chk, csv, T0);
    eq(r.ok, true);
    const ts = FIN.listTxns(app);
    ok(ts.some(t => t.amountCents === -4218), 'debit is an outflow');
    ok(ts.some(t => t.amountCents === 215000), 'credit is an inflow');
  });

  console.log('\nTest 19 — sandbox isolation');
  await check('sandbox stashes the real books and restores them exactly', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'test', [{ sourceId: 'real1', accountId: chk, date: D(-1), amountCents: -777, name: 'REAL LIFE' }], T0);
    const before = JSON.stringify(app.finance.txns) + JSON.stringify(app.finance.accounts);
    const r = FIN.sandboxEnter(app, T0);
    eq(r.ok, true);
    eq(app.finance.sandbox, true);
    ok(FIN.listTxns(app).length > 20, 'sandbox has a rich dataset');
    ok(!FIN.listTxns(app).some(t => t.name === 'REAL LIFE'), 'real data hidden, not mixed');
    // trash the sandbox thoroughly
    FIN.addManualTxn(app, { accountId: FIN.listAccounts(app)[0].id, date: D(0), amountCents: -500000, name: 'sandbox chaos' }, T0);
    FIN.sandboxExit(app, T0);
    eq(app.finance.sandbox, false);
    eq(JSON.stringify(app.finance.txns) + JSON.stringify(app.finance.accounts), before, 'restored byte-for-byte');
  });
  await check('the sandbox dataset exercises the whole engine and stays consistent', () => {
    const app = freshApp();
    FIN.sandboxEnter(app, T0);
    eq(FIN.integrity(app).ok, true, 'invariants hold');
    const subs = FIN.subscriptions(app, T0);
    ok(subs.subs.length >= 3, 'subscriptions detected');
    ok(subs.subs.some(s => s.priceChange), 'includes a price change');
    const fc = FIN.forecast(app, { domain: 'LIFE', days: 30 }, T0);
    ok(fc.openingCents > 0, 'cash on hand');
    ok(FIN.listExpected(app, { status: 'open' }).length >= 1, 'an expected check is pending');
    const b = FIN.briefing(app, T0);
    ok(b.hasData, 'briefing sees it');
    FIN.sandboxExit(app, T0);
  });

  console.log('\nTest 20 — compaction and integrity');
  await check('ancient history compacts into monthly archives with exact totals', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'test', [
      { sourceId: 'old1', accountId: chk, date: '2023-05-10', amountCents: -10000, name: 'JEWEL-OSCO' },
      { sourceId: 'old2', accountId: chk, date: '2023-05-12', amountCents: 300000, name: 'ACME PAYROLL' },
      { sourceId: 'new1', accountId: chk, date: D(-3), amountCents: -2000, name: 'RECENT' },
    ], T0);
    const r = FIN.compact(app, T0);
    eq(r.compacted, 2);
    eq(FIN.listTxns(app).length, 1, 'recent history survives');
    const a = app.finance.archive['2023-05'];
    ok(a, 'archive bucket exists');
    eq(a.inCents, 300000);
    eq(a.outCents, 10000);
    const rep = FIN.spendingReport(app, { month: '2023-05', domain: 'LIFE' }, T0);
    ok(rep.archive, 'reports can still see the archived month');
  });
  await check('integrity catches a corrupted split', () => {
    const { app, chk } = appWithAccounts();
    FIN.ingest(app, 'test', [{ sourceId: 'g1', accountId: chk, date: D(-1), amountCents: -10000, name: 'X' }], T0);
    const t = FIN.listTxns(app)[0];
    FIN.setSplits(app, t.id, [
      { amountCents: -6000, categoryId: 'cat_groceries' },
      { amountCents: -4000, categoryId: 'cat_dining' },
    ], T0);
    app.finance.txns[t.id].splits[0].amountCents = -5000;  // corrupt it behind the API
    const integ = FIN.integrity(app);
    eq(integ.ok, false);
    ok(integ.problems.some(p => p.code === 'split_sum'));
  });

  // ── summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => {
      console.log(`\n  ${f.name}`);
      console.log(`  ${f.error && f.error.stack}`);
    });
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
