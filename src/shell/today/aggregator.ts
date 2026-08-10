import { fetchDay } from '../../masters/lifeos/domains/timelog/api';
import { dateKeyOf, TIMELOG_HOURS } from '../../masters/lifeos/domains/timelog/types';
import { fetchScorecard } from '../../masters/lifeos/domains/scorecard/api';
import { gradeFor, scorecardPct, EMPTY_SCORES } from '../../masters/lifeos/domains/scorecard/scoring';
import { formatTime } from '../../shared/lib/formatters';
import { URGENCY_RANK, type TodayItem } from './types';

/**
 * NOTE: this file lives in the shell but imports LifeOS domain code, so the Today
 * route is mounted DESKTOP-ONLY behind __LIFEOS_ENABLED__ (see router.tsx). That
 * gate is what keeps timelog/scorecard out of the web bundle.
 */

// Placeholder set — demonstrates the whole point of Today: JobOS and LifeOS items
// interleave in ONE chronological column. JobOS items are stubs.
// TODO(jobos): replace the JobOS placeholders below by querying core.jobs,
// accounting.invoices, and files.proofs once those domains exist.
const PLACEHOLDERS: TodayItem[] = [
  { id: 'ph-meds', master: 'lifeos', domain: 'health', sortTime: 315, time: '5:15 AM', urgency: 'critical', title: 'Log morning meds', actionLabel: 'Open', actionHref: '/life/health' },
  { id: 'ph-gym', master: 'lifeos', domain: 'health', sortTime: 330, time: '5:30 AM', urgency: 'normal', title: 'Gym: chest + back', subtitle: 'Midtown Palatine', actionHref: '/life/health' },
  { id: 'ph-proof', master: 'jobos', domain: 'files', sortTime: 480, time: '8:00 AM', urgency: 'high', title: 'Proof due to Murphy Paving', subtitle: 'PVI-1044', actionLabel: 'Open', actionHref: '/job/files' },
  { id: 'ph-ship', master: 'jobos', domain: 'production', sortTime: 570, time: '9:30 AM', urgency: 'critical', title: 'Beaver Shredding tees ship today', actionLabel: 'Open', actionHref: '/job/production' },
  { id: 'ph-cal', master: 'lifeos', domain: 'health', sortTime: 720, time: '12:00 PM', urgency: 'high', title: '0 of 6,000 cal logged', actionHref: '/life/health' },
  { id: 'ph-invoice', master: 'jobos', domain: 'accounting', sortTime: 780, time: '1:00 PM', urgency: 'critical', title: 'Invoice PVI-1041 overdue 4 days', subtitle: '$1,850', actionLabel: 'Open', actionHref: '/job/accounting' },
  { id: 'ph-spanish', master: 'lifeos', domain: 'habits', sortTime: 900, time: '3:00 PM', urgency: 'normal', title: 'Spanish: 15 min', actionHref: '/life/habits' },
  { id: 'ph-crm', master: 'jobos', domain: 'crm', sortTime: 1020, time: '5:00 PM', urgency: 'normal', title: "Follow up: Finuccio's Deli reorder", actionLabel: 'Open', actionHref: '/job/clients' },
  { id: 'ph-spend', master: 'lifeos', domain: 'money', sortTime: 1200, time: '8:00 PM', urgency: 'low', title: 'Log daily spend', actionHref: '/life/money' },
];

/** Real LifeOS items derived from the ported timelog + scorecard domains. */
async function lifeosLiveItems(date: Date): Promise<TodayItem[]> {
  const dk = dateKeyOf(date);
  const items: TodayItem[] = [];

  // Scorecard — live grade + progress.
  try {
    const scores = (await fetchScorecard(dk)) ?? EMPTY_SCORES;
    const pct = scorecardPct(scores);
    const grade = gradeFor(pct);
    items.push({
      id: 'live-scorecard',
      master: 'lifeos',
      domain: 'scorecard',
      sortTime: 13 * 60,
      time: '1:00 PM',
      urgency: pct < 0.35 ? 'high' : 'normal',
      title: `Scorecard: ${grade.letter} — ${grade.label}`,
      subtitle: `${Math.round(pct * 100)}% to daily goal`,
      actionLabel: 'Open',
      actionHref: '/life/scorecard',
    });
  } catch {
    /* backend offline/paused — skip live item, placeholders still render */
  }

  // Time Log — nudge the current hour if it's unlogged, else a summary.
  try {
    const rows = await fetchDay(dk);
    const loggedHours = new Set(rows.map((r) => r.hour));
    const nowHour = date.getHours();
    const inWindow = (TIMELOG_HOURS as readonly number[]).includes(nowHour);
    if (inWindow && !loggedHours.has(nowHour)) {
      items.push({
        id: 'live-timelog-now',
        master: 'lifeos',
        domain: 'timelog',
        sortTime: nowHour * 60 + 15,
        time: formatTime(nowHour),
        urgency: 'high',
        title: 'Log this hour',
        subtitle: 'Hourly check-in',
        actionLabel: 'Log',
        actionHref: '/life/timelog',
      });
    } else {
      items.push({
        id: 'live-timelog-summary',
        master: 'lifeos',
        domain: 'timelog',
        sortTime: 20 * 60 + 30,
        time: '8:30 PM',
        urgency: 'low',
        title: `Time log: ${loggedHours.size}/${TIMELOG_HOURS.length} hours`,
        actionLabel: 'Open',
        actionHref: '/life/timelog',
        completed: loggedHours.size >= TIMELOG_HOURS.length,
      });
    }
  } catch {
    /* skip */
  }

  return items;
}

/** Merge real + placeholder items into one strictly chronological list. */
export async function getTodayItems(date: Date): Promise<TodayItem[]> {
  const live = await lifeosLiveItems(date);
  const all = [...PLACEHOLDERS, ...live];
  return all.sort((a, b) =>
    a.sortTime !== b.sortTime
      ? a.sortTime - b.sortTime
      : URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency],
  );
}
