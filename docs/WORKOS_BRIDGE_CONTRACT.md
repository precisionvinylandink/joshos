# JoshOS ↔ WorkOS — integration contract

_Written 2026-08-11. Authoritative for the JoshOS side; the WorkOS side is
specified here but **not yet implemented** (see §9)._

---

## 1. Vocabulary, and what actually exists

The brief uses "WorkOS" for the business system. In this ecosystem that name
means something narrower, and getting it wrong produces the wrong integration:

| Name | What it is | Where it lives |
|------|-----------|----------------|
| **JoshOS** | Josh's personal execution/orchestration system | `Developer/joshos` — **live**, single-file `desktop/src/index.html` + `ios/index.html` |
| **WorkOS** | The *architecture pattern* for a multi-tenant business OS | Documentation only |
| **JobOS** | The *product* built from that pattern | `Developer/JobOS` — **one commit, two Markdown files, zero application code** |
| **Business system of record (SoR)** | Where the business data actually is, today | Supabase project **`precision-vinyl`** (`siwotzlqfwgmhhnnnppc`), ~130 tables, `ACTIVE_HEALTHY` |

**The operative fact:** there is no WorkOS/JobOS application to integrate with.
The business data lives in a Supabase project, and no service currently fronts
it. Throughout this document **"WorkOS" means the business SoR and whatever
service comes to own it** — today the `precision-vinyl` project, later JobOS.

This document is written so that when JobOS is built, it implements §4–§6 and
JoshOS needs no changes.

---

## 2. Ownership

**WorkOS owns** (JoshOS may cache, never author):
customers · contacts · companies · leads · opportunities · quotes · quote
status · jobs · invoices · payments · business workflow status · business
timestamps (`sent_at`, `won_at`, `paid_date`, …) · business history.

**JoshOS owns** (WorkOS never authors):
what Josh is doing right now · work sessions · personal focus · personal task
state · the personal calendar · scheduling · reminders · procrastination and
stale-work detection · personal execution history · "what should Josh do next?".

**The rule that keeps them from becoming duplicates:** JoshOS stores a
*reference plus a display snapshot*, never the business model. One business
record may appear as many JoshOS execution actions — send quote, then follow
up, then send invoice — and those are three *views of one record*, not three
records.

JoshOS never writes business state. When Josh completes a follow-up, JoshOS
records that **he did the thing** and tells WorkOS; whether that changes
`quote.status` is WorkOS's decision alone.

---

## 3. Identity

A business record is identified **only** by `(source, externalId)`.

```
localId = "wi_" + source + "_" + externalId      // deterministic
```

Because the local id is derived, a replayed event cannot fork a record — this
is the backbone of idempotency (§7).

Names, emails, company labels and titles are **display snapshots and ranking
hints only**. They are never identity. A customer renamed in WorkOS resolves to
the same JoshOS record; this is covered by a test.

---

## 4. WorkOS → JoshOS

### 4.1 Transport

JoshOS polls a single **server-side** endpoint. It does not connect to the
business database (§8).

```
GET  {BRIDGE_URL}/work?since=<ISO8601>
Authorization: Bearer <scoped read token>
```

`since` is the last successful sync. Omitted on first call.

**Response**

```jsonc
{
  "items":  [ WorkItem, ... ],   // current snapshot of open work
  "events": [ Event, ... ],      // discrete transitions since `since`
  "serverTime": "2026-08-11T21:15:00.000Z"
}
```

Both are optional; `items` alone yields a working (poll-based) integration, and
`events` adds precise transition semantics. JoshOS applies `events` first, then
upserts `items` — both through the same id, so the two can overlap safely.

### 4.2 `WorkItem`

Only these fields are consumed. Extra fields are ignored, so WorkOS may add
freely without breaking JoshOS.

| Field | Req | Notes |
|---|---|---|
| `externalId` | ✅ | Authoritative id. Refusing a payload without one is tested. |
| `source` | | Defaults `"workos"` |
| `externalTable` | | e.g. `pvi_quotes` — for deep links and debugging |
| `business` | | `"PVI"` \| `"CPG"` \| … — **data, never hardcoded in JoshOS** |
| `type` | ✅ | `lead` \| `quote_request` \| `quote` \| `opportunity` \| `job` \| `invoice` |
| `title` | ✅ | Human summary |
| `status` | ✅ | Raw business status; normalized on arrival (§4.3) |
| `customerId` / `contactId` / `companyId` | | WorkOS ids |
| `customerLabel` / `companyLabel` | | Display + resolution ranking only |
| `createdAt` | | Drives the "never started" clock |
| `sentAt` | | **The customer clock.** Must be the real send time |
| `wonAt` / `lostAt` / `completedAt` | | Terminal timestamps |
| `dueAt` | | Business due date |
| `lastActivityAt` | | Business-side activity |
| `followUpDays` | | Per-record follow-up cadence; default 3 |
| `nextAction` / `nextActionDueAt` | | WorkOS's *business* intent — kept as `businessNextAction`, distinct from JoshOS's derived execution action |
| `amount`, `url` | | Display / deep link |
| `priority` | | `normal` \| `rush` \| `urgent`. Added 2026-08-12 |
| `rush` | | The same fact as a boolean, so no consumer has to know which raw values count as rush |
| `stages` | | Production lead-time **configuration** (§6.1). Not a schedule |

**`dueAt` means the business due date *for that record type*** and the types do
not agree with each other:

| Type | `dueAt` is | |
|---|---|---|
| `quote` | `valid_until` — when the QUOTE expires | ❌ never a production deadline |
| `invoice` | payment due date | |
| `job` (an order) | **the CUSTOMER production due date** | ✅ the execution anchor |

Confusing the first and third is the specific bug the order handoff exists to
prevent: a quote expiring in 30 days says nothing about when the customer needs
the goods. A `job` with no `dueAt` is not scheduled at all — JoshOS raises a
task to set one rather than substituting anything.

**`sentAt` is the single most important field.** Without it JoshOS cannot
distinguish "Josh is slow" from "the customer hasn't replied" — the distinction
the whole system exists to make.

### 4.3 Status normalization

WorkOS tables each use their own vocabulary. JoshOS normalizes on arrival:

| Canonical | Accepted raw values |
|---|---|
| `new` | new, request, requested, open, **pending** |
| `in_progress` | draft, working, in_progress, preparing |
| `prepared` | prepared, ready |
| `sent` | sent, emailed, delivered, awaiting_customer |
| `won` | accepted, approved, won, converted |
| `lost` | declined, rejected, lost, cancelled |
| `scheduled` / `in_production` | scheduled, **payment_received** / in_production, production, **quality_check** |
| `completed` | complete, completed, shipped, fulfilled |
| `invoiced` / `paid` / `closed` | invoiced, partial / paid / closed, **refunded** |

An **unrecognized status is preserved verbatim and matches no rule.** JoshOS
will never guess that an unknown status means "sent". Tested.

**Per-table overrides.** One raw word can mean two different things depending on
where it came from, and the shared map cannot resolve that. `delivered` on a
*quote* means "we sent it to the customer" (→ `sent`); on an *order* it means
"the goods arrived" (→ `completed`). `STATUS_BY_TABLE` holds these; the bridge
sends the raw status and JoshOS re-normalises with `externalTable` in hand. The
SQL projection carries the same override so the two sides agree.

### 4.4 `Event`

```jsonc
{
  "id":   "evt_01J...",              // REQUIRED, stable, globally unique
  "type": "quote.sent",
  "at":   "2026-08-11T21:32:00.000Z",
  "data": { /* WorkItem */ }
}
```

Consumed types: `quote.created` · `quote.sent` · `quote.won` · `quote.lost` ·
`invoice.created` · `invoice.sent` · `invoice.paid` · `job.created` ·
`job.completed` · `customer.responded` · `work.created` · `work.updated`.

All business events carry a full `WorkItem` in `data`, so **JoshOS never needs
to have seen a prior event** to process one. Unknown event types still upsert
their `data` — forward compatible.

`id` is **required**; an event without one is rejected rather than guessed at.

---

## 5. JoshOS → WorkOS

```
POST {BRIDGE_URL}/events
Authorization: Bearer <scoped token>
Content-Type: application/json

{ "id":"jos_…", "type":"work_session.started", "at":"…", "data":{…} }
```

`200/201` = accepted. **Any non-2xx is a failure**; JoshOS keeps the event
pending and retries. It never reports success it did not receive (§7.3).

| Event | `data` | Meaning |
|---|---|---|
| `work_session.started` | `workItemId`, `externalId`, `source`, `at`, `note` | Josh began working on this record |
| `work_session.completed` | + `endedAt` | He stopped |
| `calendar_action.completed` | `externalId`, `actionKind`, `ruleId`, `completedAt`, `note` | He performed the derived action (e.g. sent the follow-up) |

**WorkOS must treat `id` as an idempotency key** and ignore replays — JoshOS
retries, so duplicates *will* arrive.

These are **advisory**. WorkOS decides what, if anything, they change. JoshOS
does not require a business mutation in response.

---

## 6. Business state → next action → calendar

A rule registry, not a hardcoded chain. Each rule maps business state to **one
personal execution action**.

| Rule | Fires when | Produces | Owner | Due |
|---|---|---|---|---|
| `lead_prepare_quote` | lead/quote_request is `new`/`in_progress` | Prepare quote | josh | created +1d |
| `quote_open_send` | quote `new`/`in_progress`/`prepared` | Send quote | josh | created +1d |
| `quote_sent_follow_up` | quote/opportunity `sent` **and** `sentAt` set | Follow up | customer | `sentAt` + `followUpDays` (3) |
| `quote_won_send_invoice` | quote/opportunity `won` | Send invoice | josh | `wonAt` +1d |
| `job_won_schedule` | job `won`/`scheduled` | Schedule production | josh | `dueAt` −2d |
| `invoice_sent_chase` | invoice `sent`/`invoiced` | Chase payment | customer | `dueAt`, else `sentAt` +14d |
| `order_execution_plan` | `job` with a `dueAt` **and** `stages` | The whole backward schedule (§6.1) | josh | per stage |
| `job_missing_due_date` | `job` with `stages` but no `dueAt` | Set customer due date | josh | created +1d |

`job_won_schedule` stands down when a real plan exists — otherwise it would ask
Josh to schedule work that is already scheduled.

Adding a rule is a single entry in `RULES` in the engine block; nothing else
changes.

### 6.1 Orders: the backward-scheduled execution plan

A converted order is not one task called "finish the order". It is the one rule
that returns **many** actions, walked right-to-left from the customer due date:

```
                                                        customer due date
  artwork/proof → purchasing → production → QC → packaging → delivery ┘
```

**Who owns what.** WorkOS owns the production LEAD TIMES and sends them as
`stages`; JoshOS owns the SCHEDULE and places the blocks. Neither holds a copy
of the other's model.

```jsonc
"stages": [ { "stage":"production", "sequence":3, "label":"Production",
              "leadDaysNormal":5, "leadDaysRush":2,
              "requiresVendor":false, "confirmed":false } ]
```

- **`leadDays* = null` ⇒ unconfigured.** JoshOS does not invent a duration. It
  schedules the stages it can and raises `needs_scheduling_<stage>` for the rest.
- **`confirmed:false` ⇒ provisional.** The plan is still built — an approximate
  schedule beats no schedule — but every block is marked `provisional` and one
  `confirm_schedule` task asks Josh to confirm the numbers. It never presents
  placeholder durations as measured.
- **Rush uses `leadDaysRush`**, a separately configured number. Not a multiplier.
- **If the work does not fit** the time remaining, the blocks are compressed
  proportionally rather than scattered into the past, and the plan reports
  `feasible:false` / `compressed:true`.

**Anchoring — why stage actions anchor on `createdAt`.** Every other rule
anchors on the timestamp that *should* produce new work when it moves (a
re-sent quote deserves a new follow-up). Stage actions anchor on the order's
`createdAt`, which never moves, so their ids are stable and a due-date or rush
change **updates the existing blocks** instead of minting a second set.
Completed stages keep their completion and their original deadline; only open
stages are rescheduled.

### 6.2 Deadline monitoring

`deadlines(w, now)` answers "what has to happen right now for every open order
to go out on time?" and buckets them: `overdue`, `dueToday`, `dueTomorrow`,
`atRisk`, `rush`, `waiting`, `onSchedule`. An order may appear in several — a
rush order due today that is already behind belongs in all three, and dropping
it from two to keep the lists tidy is how something gets missed.

`atRisk` is earned, never asserted. The reasons are recorded on
`riskReasons`: `past_due`, `stage_overdue` (a stage window closed with the work
unfinished), `does_not_fit`, `low_slack`, `no_due_date`, `no_stage_config`,
`unscheduled_stages`.

**Rush escalates sooner** in three concrete ways, none of which is a hardcoded
customer or job:

| | Normal | Rush |
|---|---|---|
| Staleness threshold | 3 days | 1 day |
| At-risk buffer | slack < 25% of its own lead time | slack < **50%** |
| Ranking in the daily view | — | +8, as a tiebreak only |

The buffer is a *fraction of the work's own lead time*, not a fixed window: a
day of slack means something very different on a twelve-day build than a
two-day one. Rush demanding twice the proportional buffer is what "escalate
sooner" means concretely — and because it is only a tiebreak, a normal order
that genuinely cannot make its date still outranks a rush order with weeks of
slack.

`nextAction` is the next incomplete **stage** — the production critical path.
Configuration tasks ("confirm the lead times") come back separately as
`blockers`, so they never answer "what do I do next?" for every order at once.

**Anchoring.** Every action derives from a business timestamp (`anchor`) and
carries a deterministic id `act_<itemId>_<kind>_<anchorMs>`. This gives three
properties at once:

- replaying an event cannot create a second action;
- a genuinely new business event (a re-send with a later `sentAt`) *does*
  create a new action, and supersedes the stale one;
- a rule that stops matching (quote won ⇒ stop chasing) retires its action.

All three are tested.

**The calendar shows actions Josh must perform, not business records.**
`Follow up with City of Elgin` — never `City of Elgin Quote #12345`. Each
calendar item retains `externalId`, so completing it can inform WorkOS.

### Ownership and procrastination

| State | Owner | Counts as procrastination? |
|---|---|---|
| `unstarted` | josh | yes, past threshold |
| `in_progress` | josh | yes, past threshold |
| `awaiting_customer` | **customer** | **never** |
| `follow_up_due` | josh | no (due today) |
| `follow_up_overdue` | josh | yes |
| `closed` | none | no |

`awaiting_customer` is **never** flagged stale. Silence from a customer is not
Josh's failure, and flagging it as one trains him to ignore the signal. Tested
explicitly (Test 7).

---

## 7. Reliability

### 7.1 Idempotency
- Inbound: `seenEvents[event.id]` ledger; a replay is recorded and dropped.
- Records: deterministic `localId` from `externalId`.
- Sessions: at most one open session per work item, plus an idempotency key.
- Actions: deterministic id from `(item, kind, anchor)`.
- Outbound: WorkOS must dedupe on `event.id`.

### 7.2 Race conditions
A duplicate `work_session.started` from two devices cannot open two sessions —
the open-session invariant is checked before insert, independent of event id.
JoshOS is single-user and last-write-wins through the existing `appData` sync;
the bridge state is additive (append-only outbox, keyed maps), which is the
shape that survives that sync model.

### 7.3 Failure behaviour
- **WorkOS unreachable on pull:** cached items are *retained* and marked
  `syncStatus: 'stale'`; `sync.status = 'error'` with the reason. JoshOS keeps
  working for everything personal. It never presents stale business state as
  current.
- **WorkOS unreachable on push:** the event stays `pending` with the error and
  attempt count, and retries on exponential backoff (30 s → 30 min, 8 attempts
  before `failed`). **No fake success** — the UI says "Saved, but WorkOS did not
  confirm — will retry".
- **No bridge configured:** status is explicitly `not_configured` and the UI
  reads "Not configured — business work is not linked". Nothing is silently
  assumed synced.

Note the contrast with the rest of JoshOS, where Supabase calls are
fire-and-forget `.catch(()=>{})`. That is right for personal data (offline
resilience) and wrong for business sync, so the bridge deliberately does not
follow that pattern.

### 7.4 Observability
Every cross-system record carries `syncedAt`, `syncStatus`; every outbound
event carries `attempts`, `lastAttemptAt`, `lastError`, `status`. `sync` holds
`status`, `lastPullAt`, `lastOkAt`, `error`, `failures`. Errors name the event
type, external id and reason. **Tokens are never logged.**

---

## 8. Security

Findings from the live business project (`siwotzlqfwgmhhnnnppc`), 2026-08-11:

- **2 ERROR** — `SECURITY DEFINER` views: `public.credit_balances`,
  `public.active_members`.
- **130 WARN** — `auth_allow_anonymous_sign_ins`: anonymous sign-ins are
  enabled and policies grant the `anon` role access.
- **78 WARN** — security-definer functions executable by `anon`/`authenticated`.
- **25 WARN** — `function_search_path_mutable`.

**Consequence for this integration:** because `anon` already carries real
privileges there, giving JoshOS that project's anon key would expose business
data to a browser. Therefore:

1. **JoshOS never receives the business project's credentials** — not the
   service role key, not the anon key. It holds only a scoped bridge token.
2. **The bridge is server-side.** It uses the service role key from a
   server-only environment variable and exposes a narrow projection.
3. **The read endpoint is read-only** and returns only the fields in §4.2 — no
   pricing internals, costs, margins, or unrelated customer records.
4. **Bearer token over TLS**, scoped to this one integration, revocable
   independently, rotated without touching business auth.
5. **CORS** must allow only JoshOS's origins; the desktop app is `file://`, so
   it should send the token from the main process or use a non-browser origin
   allowlist.

The pre-existing advisor findings above are **not caused by this integration**
and are not fixed by it. They are recorded because they are the reason the
boundary is drawn this way, and they are worth addressing on their own.

---

## 9. Status: what is implemented vs. what WorkOS must build

### ✅ IMPLEMENTED (JoshOS, this repo, tested)
- Work-item reference model with stable external ids
- Work sessions with the **two independent clocks**
- Staleness/ownership classification incl. the awaiting-customer carve-out
- Extensible next-action rule registry + deterministic action derivation
- Calendar projection of actions (not records), retaining `externalId`
- Natural-language activity resolution against existing records, with
  ambiguity refusal and a preserve-for-later-linking path
- Idempotency (event ledger, deterministic ids, open-session invariant)
- Outbox with retry, backoff, attempt/error tracking, no fake success
- Cache staleness (`syncedAt`/`syncStatus`) and honest sync status in the UI
- Settings UI for bridge URL + scoped token
- **Order execution plan** (§6.1): backward scheduling from the customer due
  date, rush as a first-class property, unconfigured/provisional lead times
  handled honestly, reconciliation that preserves completed stages
- **Deadline monitoring** (§6.2) feeding the calendar and the daily open-loop list
- 66 integration tests, run against the shipped engine
  (`workos-bridge.test.js` 30 · `order-execution.test.js` 36)

### ✅ BUILT AND DEPLOYED (business side, 2026-08-11 · extended 2026-08-12)
- Schema: five additive migrations, **applied** — see
  [`docs/workos/APPLIED_MIGRATIONS.md`](workos/APPLIED_MIGRATIONS.md)
- Endpoint: `joshos-bridge` edge function, **deployed** to
  `siwotzlqfwgmhhnnnppc`, source in [`docs/workos/joshos-bridge.ts`](workos/joshos-bridge.ts)
  - `GET https://siwotzlqfwgmhhnnnppc.supabase.co/functions/v1/joshos-bridge/work`
  - `POST https://siwotzlqfwgmhhnnnppc.supabase.co/functions/v1/joshos-bridge/events`
- Auth: scoped bearer token (`joshos-desktop`), SHA-256 hashed at rest
- JoshOS activity lands in the **existing `activity_log`**, not a competing store
- Verified live against the real Heather Moore / City of Elgin `quote_requests`
  row: `desktop/test/bridge-live.test.js`, 19 assertions across 3 phases
- **Orders projected and emitted** (2026-08-12). "Convert to Order" is now a
  server-side RPC that requires a customer due date and captures priority, and
  the resulting order lands in the outbox for JoshOS to collect. PVI shows the
  handoff state on the quote via `pvi_order_execution`.

### ⚙️ REQUIRES MANUAL CONFIGURATION
- **Paste the bridge URL + token into JoshOS → Settings → Data & sync.** This is
  the only step between here and a live connection. The token is deliberately
  *not* committed: the `joshos` GitHub repo is **public**.
- **Confirm the production lead times** in `production_stage_config`. The six
  stages are seeded with *placeholder* durations and `is_confirmed = false`,
  because PVI has never recorded real ones — `products.turnaround_days` exists
  but quote line items carry no `product_id`, so no per-line lead time is
  reachable. Until Josh sets and confirms them, every order gets a schedule
  plus a visible "confirm production lead times" task. Setting a lead time to
  `NULL` instead marks that stage unconfigured, and JoshOS will raise a
  scheduling task rather than guess.
- **Resume the paused `joshos-sync` Supabase project** (`lavbxjegicshhfvytapb`)
  — unrelated to this work, but JoshOS's own multi-device sync is dead until
  then (DNS does not resolve; every call fails silently)

### 🔌 STILL REQUIRES A BUSINESS-SIDE DECISION
- `quote_requests` has no FK to `clients`, and `pvi_quotes.client_id` references
  `profiles(id)` while `jobs`/`invoices` reference `clients(id)`. The bridge
  works around this (it uses each table's denormalised labels), but the customer
  model is genuinely forked and only the business side can reconcile it.
- Nothing yet writes `quote_requests.pvi_quote_id`; the column exists so the
  request → formal quote chain *can* be linked when a PVI admin creates one.
- **`orders` has no vendor / outsourced flag.** The legacy `jobs` table has
  `is_outsourced` and `vendor`; `orders` has neither, so the purchasing stage
  cannot be conditioned on real data. It is therefore scheduled for every order
  — the conservative direction, since reserving vendor lead time you did not
  need is recoverable and omitting it is not. Adding those columns to `orders`
  would let the stage be skipped when it genuinely does not apply.

### 🚧 NOT IMPLEMENTED (deliberate)
- Webhook push WorkOS→JoshOS. The desktop app has no public URL; polling every
  5 minutes is the correct mechanism here. The `events` array already carries
  precise transitions, so moving to push later requires no JoshOS change.
- Writing business state from JoshOS. Out of scope by the ownership rule.
- iOS (`ios/index.html`) is unchanged; the bridge is desktop-only for now.
