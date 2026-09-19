/**
 * Authorization test — runs against the REAL Supabase project.
 *
 * Financial data is sensitive, and "the UI hides it" is not a security model.
 * The only thing standing between an anonymous reader and Josh's money is
 * Postgres row-level security, so that is what this test exercises: it takes
 * the publishable key that ships inside index.html — the one a reader can copy
 * straight out of the deployed page — and tries to use it.
 *
 * Unlike the pure engine tests this one needs the network. It is deliberately
 * a separate file so the offline suite stays hermetic.
 *
 *   node desktop/test/authorization.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'index.html');

/* Read the credentials out of the SHIPPED file rather than hardcoding them —
   the point is to test exactly what an attacker would find in the page. */
function shipped(name) {
  const html = fs.readFileSync(SRC, 'utf8');
  const m = html.match(new RegExp('const ' + name + "\\s*=\\s*'([^']+)'"));
  if (!m) throw new Error(name + ' not found in index.html');
  return m[1];
}
const SB_URL = shipped('SB_URL');
const SB_KEY = shipped('SB_KEY');

let passed = 0, failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy, got ' + JSON.stringify(v)); }
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((msg || 'not equal') + '\n        got      ' + JSON.stringify(a) +
                    '\n        expected ' + JSON.stringify(b));
}

/* Anonymous request: the publishable key and nothing else. */
function anon(pathAndQuery, init) {
  return fetch(SB_URL + '/rest/v1/' + pathAndQuery, Object.assign({
    headers: Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      (init && init.headers) || {})
  }, init || {}));
}

/* Every table that can hold personal or financial data. If a new one is added
   and left open, this list is what catches it. */
const PRIVATE_TABLES = [
  'joshos_state',
  'joshos_transactions',
  'plaid_items',
  'plaid_accounts',
  'plaid_syncs',
  'finance_connections',
  'finance_connection_secrets',
  'finance_metrics'
];

test('the publishable key is the one that ships, and is publishable — not a secret key', () => {
  ok(/^sb_publishable_/.test(SB_KEY) || /^eyJ/.test(SB_KEY), 'unexpected key shape: ' + SB_KEY.slice(0, 20));
  ok(!/service_role/.test(SB_KEY), 'a service role key must never be in the client');
  ok(!/^sb_secret_/.test(SB_KEY), 'a secret key must never be in the client');
});

test('no private table leaks a single row to an anonymous reader', async () => {
  for (const t of PRIVATE_TABLES) {
    const r = await anon(t + '?select=*&limit=5');
    const body = await r.text();
    if (r.ok) {
      let rows;
      try { rows = JSON.parse(body); } catch (e) { throw new Error(t + ': unparseable body ' + body.slice(0, 120)); }
      eq(rows, [], t + ' returned rows to an anonymous reader');
    } else {
      /* A hard refusal is equally fine — better, even. */
      ok(r.status === 401 || r.status === 403 || r.status === 404,
        t + ': unexpected status ' + r.status + ' ' + body.slice(0, 120));
    }
  }
});

test('an anonymous write to the state row is refused by the database, not the UI', async () => {
  const r = await anon('joshos_state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: '00000000-0000-0000-0000-000000000000',
      data: { authorizationTest: true }
    })
  });
  ok(!r.ok, 'an anonymous insert succeeded — RLS is not protecting joshos_state');
  const body = await r.text();
  ok(/row-level security/i.test(body) || r.status === 401 || r.status === 403,
    'expected an RLS refusal, got ' + r.status + ' ' + body.slice(0, 160));
});

test('an anonymous update cannot reach another user\'s row', async () => {
  const r = await anon('joshos_state?user_id=neq.00000000-0000-0000-0000-000000000000', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ data: { authorizationTest: true } })
  });
  if (r.ok) {
    const rows = JSON.parse(await r.text());
    eq(rows, [], 'an anonymous PATCH modified rows');
  } else {
    ok(r.status === 401 || r.status === 403, 'unexpected status ' + r.status);
  }
});

test('an anonymous delete removes nothing', async () => {
  const r = await anon('joshos_state?user_id=neq.00000000-0000-0000-0000-000000000000', {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
  if (r.ok) {
    const rows = JSON.parse(await r.text());
    eq(rows, [], 'an anonymous DELETE removed rows');
  } else {
    ok(r.status === 401 || r.status === 403, 'unexpected status ' + r.status);
  }
});

test('a forged JWT is rejected outright', async () => {
  const forged = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000', role: 'authenticated' })).toString('base64url') +
    '.not-a-real-signature';
  const r = await anon('joshos_state?select=*&limit=5', { headers: { Authorization: 'Bearer ' + forged } });
  ok(!r.ok, 'a forged JWT was accepted');
  ok(r.status === 401, 'expected 401, got ' + r.status);
});

test('the credential store is unreachable by construction', async () => {
  /* finance_connection_secrets has RLS enabled and NO policies at all: even a
     correctly signed user token must get nothing. */
  const r = await anon('finance_connection_secrets?select=sealed&limit=1');
  if (r.ok) eq(JSON.parse(await r.text()), [], 'sealed credentials were readable');
  else ok(r.status >= 400, 'unexpected status ' + r.status);
});

test('the retired world-writable tables are still closed', async () => {
  /* timelog / joshos_data / joshos_theme / daily_scorecard once carried an
     allow_anon ALL policy. They must never come back. */
  for (const t of ['timelog', 'joshos_data', 'joshos_theme', 'daily_scorecard']) {
    const w = await anon(t, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 999999 })
    });
    ok(!w.ok, t + ' accepted an anonymous write — the allow_anon policy is back');
  }
});

(async () => {
  console.log('\nAuthorization — live, against ' + SB_URL + '\n');
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  PASS  ' + name); }
    catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
  }
  console.log('\n────────────────────────────────────────────────────────────');
  console.log(passed + ' passed, ' + failed + ' failed');
  console.log('────────────────────────────────────────────────────────────');
  process.exit(failed ? 1 : 0);
})();
