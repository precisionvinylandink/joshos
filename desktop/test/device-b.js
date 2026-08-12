/**
 * "Device B" — an independent JoshOS client.
 *
 * Its own session, its own device id, talking to the same production backend as
 * the browser. Used to prove that cloud state, not a machine, is the source of
 * truth. Not part of the app; a test harness only.
 *
 *   node desktop/test/device-b.js <read|seed|modify> [text]
 */
'use strict';

const SB_URL = 'https://lavbxjegicshhfvytapb.supabase.co';
const SB_KEY = 'sb_publishable_qVrrcHmlp8g19P08nOWqOQ_bdrDZ9LH';
const EMAIL = process.env.JOSHOS_TEST_EMAIL;
const PW = process.env.JOSHOS_TEST_PW;
const DEVICE = 'deviceB-node';

if (!EMAIL || !PW) { console.error('JOSHOS_TEST_EMAIL and JOSHOS_TEST_PW required'); process.exit(2); }

async function signIn() {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PW }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sign-in failed: ' + (j.error_description || j.msg));
  return j;
}

async function read(s) {
  const r = await fetch(
    `${SB_URL}/rest/v1/joshos_state?user_id=eq.${s.user.id}&select=data,version,updated_at,device`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${s.access_token}` } });
  const rows = await r.json();
  return rows[0] || null;
}

async function write(s, data) {
  const r = await fetch(`${SB_URL}/rest/v1/joshos_state`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ user_id: s.user.id, data, device: DEVICE }),
  });
  if (!r.ok) throw new Error(`write failed ${r.status} ${await r.text()}`);
}

(async () => {
  const cmd = process.argv[2] || 'read';
  const text = process.argv[3] || '';
  const s = await signIn();
  const row = await read(s);

  if (cmd === 'read') {
    console.log(JSON.stringify({
      exists: !!row,
      version: row && row.version,
      device: row && row.device,
      updated_at: row && row.updated_at,
      wins: row && (row.data.wins || []).map(w => w.t),
    }, null, 2));
    return;
  }

  // seed: establish a known baseline. modify: change it as a second device would.
  const data = (cmd === 'modify' && row) ? row.data : {};
  data.lastDate = data.lastDate || new Date().toDateString();
  data.wins = data.wins || [];
  data.wins.push({ t: text, ts: new Date().toISOString() });
  data._device = DEVICE;
  data._ts = new Date().toISOString();
  await write(s, data);

  const after = await read(s);
  console.log(JSON.stringify({
    ok: true, version: after.version, device: after.device,
    wins: (after.data.wins || []).map(w => w.t),
  }, null, 2));
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
