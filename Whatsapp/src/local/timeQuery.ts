export interface TimePlan {
  window?: { startMs: number; endMs: number; label: string };
  upcoming: boolean;
  first: boolean;
  latest: boolean;
  recap: boolean;
}

const DAY = 86_400_000;

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const startOfDay = (d: Date): number => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
const startOfWeek = (d: Date): number =>
  startOfDay(d) - ((d.getDay() + 6) % 7) * DAY; // Monday

const RECAP =
  /\b(summary|summari[sz]e|summari[sz]ed|recap|catch me up|catch up|what happened|what has happened|what s happened|what is happening|what s happening|what was happening|being discussed|was discussed|discussed|discussing|going on|any news|news|what s new|what is new|updates?|miss(ed)?|highlights?)\b/;

// ── explicit date extraction ─────────────────────────────────

const MONTHS_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function extractExplicitDates(
  q: string,
  now: Date,
): { startMs: number; endMs: number; label: string }[] {
  const out: { startMs: number; endMs: number; label: string }[] = [];
  const year = now.getFullYear();

  const pushWindow = (y: number, m: number, d: number): void => {
    const date = new Date(y, m, d, 0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return;
    const startMs = date.getTime();
    const endMs = startMs + DAY;
    const label = date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (!out.some((w) => w.startMs === startMs)) {
      out.push({ startMs, endMs, label });
    }
  };

  const monthNames = Object.keys(MONTHS_MAP).join('|');

  // 1. "September 4", "Sept 4", "Sep 4th", "Sep 4 2026"
  const re1 = new RegExp(
    `\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re1.exec(q)) !== null) {
    const mon = MONTHS_MAP[m[1].toLowerCase()];
    const day = Number(m[2]);
    const yr = m[3] ? Number(m[3]) : year;
    if (mon !== undefined && day >= 1 && day <= 31) pushWindow(yr, mon, day);
  }

  // 2. "4 September", "4th of September", "4 Sep 2026"
  const re2 = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})(?:,?\\s+(\\d{4}))?\\b`,
    'gi',
  );
  while ((m = re2.exec(q)) !== null) {
    const day = Number(m[1]);
    const mon = MONTHS_MAP[m[2].toLowerCase()];
    const yr = m[3] ? Number(m[3]) : year;
    if (mon !== undefined && day >= 1 && day <= 31) pushWindow(yr, mon, day);
  }

  // 3. "2026-09-04"
  const re3 = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = re3.exec(q)) !== null) {
    pushWindow(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  // 4. "4/9" or "4/9/2026" (day/month)
  const re4 = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  while ((m = re4.exec(q)) !== null) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) {
      const yr = m[3]
        ? Number(m[3]) < 100
          ? 2000 + Number(m[3])
          : Number(m[3])
        : year;
      pushWindow(yr, mo, d);
    }
  }

  return out;
}

// ── main detector ────────────────────────────────────────────

export function detectTimePlan(
  question: string,
  now: Date = new Date(),
): TimePlan {
  const q = norm(question);
  const plan: TimePlan = {
    upcoming: false,
    first: false,
    latest: false,
    recap: RECAP.test(q),
  };

  if (
    /\b(first|earliest|oldest)\b.*\b(message|messages|post|announcement)\b/.test(
      q,
    ) ||
    /\bhow did (this|the|our) (group|chat) (start|begin)\b/.test(q)
  ) {
    plan.first = true;
  }
  if (
    /\b(last|latest|most recent|newest)\b.*\b(message|messages|post|announcement)\b/.test(
      q,
    )
  ) {
    plan.latest = true;
  }

  if (
    /\b(tomorrow|upcoming|coming up|coming soon|next few days|next week|later this week|this weekend|on the agenda|agenda|what s coming|what is coming|what s next|what is next|whats next|planned|scheduled)\b/.test(
      q,
    )
  ) {
    plan.upcoming = true;
  }

  const nowMs = now.getTime();
  const today0 = startOfDay(now);
  const week0 = startOfWeek(now);
  const nDays = q.match(/\b(?:last|past|previous)\s+(\d{1,2})\s+days?\b/);

  if (nDays) {
    plan.window = {
      startMs: nowMs - Number(nDays[1]) * DAY,
      endMs: nowMs,
      label: `the last ${nDays[1]} days`,
    };
  } else if (/\b(last|past) 24 hours\b/.test(q)) {
    plan.window = {
      startMs: nowMs - DAY,
      endMs: nowMs,
      label: 'the last 24 hours',
    };
  } else if (/\b(last|previous) week\b/.test(q)) {
    plan.window = {
      startMs: week0 - 7 * DAY,
      endMs: week0,
      label: 'last week',
    };
  } else if (/\bpast week\b/.test(q)) {
    plan.window = {
      startMs: nowMs - 7 * DAY,
      endMs: nowMs,
      label: 'the past 7 days',
    };
  } else if (/\bthis week\b/.test(q)) {
    plan.window = { startMs: week0, endMs: nowMs, label: 'this week' };
  } else if (/\byesterday\b/.test(q)) {
    plan.window = { startMs: today0 - DAY, endMs: today0, label: 'yesterday' };
  } else if (
    /\b(today|tonight|this morning|this afternoon|this evening)\b/.test(q)
  ) {
    plan.window = { startMs: today0, endMs: nowMs, label: 'today' };
  } else if (/\b(recently|lately|these days|recent)\b/.test(q)) {
    plan.window = {
      startMs: nowMs - 3 * DAY,
      endMs: nowMs,
      label: 'the last few days',
    };
  }

  // ── Explicit dates take priority over the recap fallback ──
  // "summary of September 4" should scope to Sept 4, not to the last
  // couple of days. This runs AFTER the relative-day branches so
  // "last week" still wins for "summarize last week", but BEFORE
  // the recap fallback so explicit dates win for "summary of Sept 4".
  if (!plan.window) {
    const explicitDates = extractExplicitDates(question, now);
    if (explicitDates.length === 1) {
      const w = explicitDates[0];
      plan.window = { startMs: w.startMs, endMs: w.endMs, label: w.label };
    } else if (explicitDates.length >= 2) {
      const sorted = [...explicitDates].sort((a, b) => a.startMs - b.startMs);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      plan.window = {
        startMs: first.startMs,
        endMs: last.endMs,
        label: `${first.label} to ${last.label}`,
      };
    }
  }

  if (!plan.window && plan.recap) {
    plan.window = {
      startMs: nowMs - 2 * DAY,
      endMs: nowMs,
      label: 'the last couple of days',
    };
  }

  return plan;
}
