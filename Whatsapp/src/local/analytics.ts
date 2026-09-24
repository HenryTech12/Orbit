import {
  getWhatsAppKnowledge,
  isOfficialMessage,
  isMeetingMessage,
} from './whatsappKnowledgeStore.js';
import { isIgnoredSender, isBotMessage } from './botFilter.js';
import { findAdmin } from './trustedAdmins.js';
import type { WhatsAppMessage } from '../types/whatsapp.js';

const DAY = 86_400_000;

export interface SenderStat {
  senderId: string;
  jid: string;
  digits: string;
  displayName: string;
  count: number;
  isAdmin: boolean;
}

export interface AnalyticsReport {
  totalMessages: number;
  activeSenders: number;
  adminCount: number;
  memberCount: number;
  window: string;
  admins: SenderStat[];
  members: SenderStat[];
  membersOnly?: boolean;
  adminsOnly?: boolean;
}

export interface AnalyticsQuery {
  top?: number;
  days?: number;
  windowLabel?: string;
  membersOnly?: boolean;
  adminsOnly?: boolean;
}

// ── query parsing ────────────────────────────────────────────

export function parseAnalyticsQuery(text: string): AnalyticsQuery | null {
  const q = text
    .toLowerCase()
    .replace(/^@sentinel\b/i, '')
    .trim();

  if (/^\/stats\b/.test(q) || /^\/analytics\b/.test(q)) {
    return extractOptions(q);
  }

  // Broaden the natural-language patterns so phrasing variations work.
  const patterns = [
    /\bwho('s| is) (the )?(most )?active\b/,
    /\bwho (talks|posts|writes|chats) (the )?most\b/,
    /\bmost active (members?|people|posters?|users?|contributors?)\b/,
    /\btop\s+\d*\s*(posters?|contributors?|members?|users?|active|chatters?)\b/,
    /\bmessage (count|counts|stats|statistics|ranking)\b/,
    /\bactivity (stats|statistics|report|ranking|leaderboard)\b/,
    /\bwho (has|posted) the most\b/,
    /\branking of (posters?|members?|activity)\b/,
    /\bgroup (stats|statistics|analytics|activity|leaderboard)\b/,
    /\bwho (would|should) (win|get|earn|receive)\b.*\b(trophy|award|prize)\b/,
    /\bmost (active|talkative|chatty)\b/,
    /\b(biggest|top) (contributor|poster|sender)\b/,
    /\bwho('s| is) (always|constantly|always) (talking|posting|chatting)\b/,
    /\bexclude admins?\b/,
    /\bmembers?[- ]only\b/,
    /\badmins?[- ]only\b/,
    /\b(just|only) (members?|admins?)\b/,
    /\bshow (me )?(the )?(top|most active|ranking|leaderboard)\b/,
  ];

  if (patterns.some((p) => p.test(q))) {
    return extractOptions(q);
  }

  return null;
}

function extractOptions(q: string): AnalyticsQuery {
  const out: AnalyticsQuery = {};

  const topMatch = q.match(/\b(?:top|first|best)\s+(\d{1,3})\b/);
  if (topMatch) {
    const n = Number(topMatch[1]);
    if (n >= 1 && n <= 100) out.top = n;
  }

  if (/\b(today|tonight)\b/.test(q)) {
    out.days = 1;
    out.windowLabel = 'today';
  } else if (/\byesterday\b/.test(q)) {
    out.days = 1;
    out.windowLabel = 'yesterday';
  } else if (/\b(this|last|past) week\b/.test(q)) {
    out.days = 7;
    out.windowLabel = 'this week';
  } else if (/\b(this|last|past) month\b/.test(q)) {
    out.days = 30;
    out.windowLabel = 'this month';
  }

  // Modifiers — checked with wide patterns so "exclude admins",
  // "no admins", "members only", "without admins" all work.
  if (
    /\b(exclude|without|no|ignore|excluding)\s+admins?\b/.test(q) ||
    /\bmembers?\s*[- ]?\s*only\b/.test(q) ||
    /\bnon[- ]?admins?\b/.test(q) ||
    /\b(just|only)\s+members?\b/.test(q)
  ) {
    out.membersOnly = true;
  }

  if (
    /\b(only|just)\s+admins?\b/.test(q) ||
    /\badmins?\s*[- ]?\s*only\b/.test(q) ||
    /\bexclude\s+members?\b/.test(q) ||
    /\bwithout\s+members?\b/.test(q)
  ) {
    out.adminsOnly = true;
  }

  return out;
}

// ── label helpers ────────────────────────────────────────────

function labelFor(m: WhatsAppMessage): {
  label: string;
  isAdmin: boolean;
  digits: string;
  jid: string;
} {
  const rawId = m.senderId ?? '';
  const digits = rawId.split('@')[0].split(':')[0].replace(/\D/g, '');
  const jid = digits ? `${digits}@s.whatsapp.net` : rawId;

  const admin = findAdmin(m.senderId, m.senderName);
  if (admin) {
    return {
      label: admin.name,
      isAdmin: true,
      digits: admin.digits,
      jid: `${admin.digits}@s.whatsapp.net`,
    };
  }

  const name = (m.senderName ?? '').trim();
  const displayName =
    name && !/^[+\d\s()-]+$/.test(name)
      ? name
      : digits
        ? `+${digits}`
        : 'Unknown member';

  return { label: displayName, isAdmin: false, digits, jid };
}

// ── main ─────────────────────────────────────────────────────

export async function buildAnalyticsReport(
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<AnalyticsReport> {
  const all = await getWhatsAppKnowledge();

  const cutoff = query.days ? now.getTime() - query.days * DAY : 0;

  const counted = all.filter((m) => {
    if (!m.isGroup) return false;
    if (isOfficialMessage(m) || isMeetingMessage(m)) return false;
    if (m.senderId === 'system' || m.senderId === 'unknown') return false;
    if (isBotMessage(m)) return false;
    if (isIgnoredSender(m.senderId, m.senderName)) return false;
    if (!m.text || !m.text.trim()) return false;
    if (m.text.startsWith('/')) return false;
    if (query.days) {
      const t = m.timestamp < 1e12 ? m.timestamp * 1000 : m.timestamp;
      if (t < cutoff) return false;
    }
    return true;
  });

  // Group by phone digits (last 8) so LID + phone-number variants merge.
  // Admins are grouped by their registered number, so variants of Diane
  // (LID vs phone) collapse into one entry.
  const bySender = new Map<
    string,
    { stat: SenderStat; sample: WhatsAppMessage }
  >();

  for (const m of counted) {
    const info = labelFor(m);

    // Key: admin name for admins, else last 8 digits, else raw id.
    const key = info.isAdmin
      ? `admin:${info.label.toLowerCase()}`
      : info.digits.length >= 8
        ? `d:${info.digits.slice(-8)}`
        : `r:${m.senderId || m.senderName || 'unknown'}`;

    const existing = bySender.get(key);
    if (existing) {
      existing.stat.count++;
    } else {
      bySender.set(key, {
        stat: {
          senderId: m.senderId ?? '',
          jid: info.jid,
          digits: info.digits,
          displayName: info.label,
          count: 1,
          isAdmin: info.isAdmin,
        },
        sample: m,
      });
    }
  }

  const allStats = [...bySender.values()].map((x) => x.stat);

  const sortStats = (a: SenderStat, b: SenderStat): number => {
    if (b.count !== a.count) return b.count - a.count;
    return a.displayName.localeCompare(b.displayName);
  };

  const adminsWanted = !query.membersOnly;
  const membersWanted = !query.adminsOnly;

  const admins = adminsWanted
    ? allStats
        .filter((s) => s.isAdmin)
        .sort(sortStats)
        .slice(0, query.top ?? 10)
    : [];

  const members = membersWanted
    ? allStats
        .filter((s) => !s.isAdmin)
        .sort(sortStats)
        .slice(0, query.top ?? 10)
    : [];

  return {
    totalMessages: counted.length,
    activeSenders: bySender.size,
    adminCount: allStats.filter((s) => s.isAdmin).length,
    memberCount: allStats.filter((s) => !s.isAdmin).length,
    window: query.windowLabel ?? 'all time',
    admins,
    members,
    membersOnly: query.membersOnly,
    adminsOnly: query.adminsOnly,
  };
}

// ── formatting ───────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

const MAX_MENTIONS = 50;

export interface FormattedAnalytics {
  text: string;
  mentions: string[];
  /** Compact summary for chat context, so follow-ups can reference it. */
  summary: string;
}

export function formatAnalyticsReport(
  report: AnalyticsReport,
  _requestedTop: number,
): FormattedAnalytics {
  if (report.totalMessages === 0) {
    return {
      text: `No messages found for ${report.window}. 📭`,
      mentions: [],
      summary: `No activity for ${report.window}.`,
    };
  }

  const lines: string[] = [];
  lines.push(`📊 *Group activity — ${report.window}*`);
  lines.push('');
  lines.push(`Total messages: *${report.totalMessages.toLocaleString()}*`);
  lines.push(`Active members: *${report.activeSenders.toLocaleString()}*`);
  if (!report.adminsOnly && !report.membersOnly) {
    lines.push(
      `Admins active: *${report.adminCount}* · Members active: *${report.memberCount}*`,
    );
  }
  lines.push('');

  const mentions: string[] = [];
  const collectMention = (s: SenderStat): void => {
    if (mentions.length < MAX_MENTIONS && s.jid && s.digits) {
      if (!mentions.includes(s.jid)) mentions.push(s.jid);
    }
  };

  const renderSection = (title: string, stats: SenderStat[]): void => {
    lines.push(`*${title}*`);
    if (stats.length === 0) {
      lines.push('(no activity)');
      return;
    }
    stats.forEach((s, i) => {
      collectMention(s);
      const prefix = MEDALS[i] ?? `${i + 1}.`;
      const at = s.digits ? `@${s.digits}` : s.displayName;
      const suffix = s.count === 1 ? 'msg' : 'msgs';
      lines.push(`${prefix} ${at} — ${s.count} ${suffix}`);
    });
  };

  if (report.admins.length > 0) {
    renderSection('🏅 Admins', report.admins);
    lines.push('');
  }
  if (report.members.length > 0) {
    renderSection('👥 Top members', report.members);
  }

  // Compact summary for the chat context.
  const topAdmin = report.admins[0];
  const topMember = report.members[0];
  // Terse summary — just enough for a follow-up, not enough to paste.
  const summaryParts: string[] = [`Stats (${report.window})`];
  if (topAdmin) {
    summaryParts.push(`#1 admin ${topAdmin.displayName} ${topAdmin.count}`);
  }
  if (topMember) {
    summaryParts.push(`#1 member ${topMember.displayName} ${topMember.count}`);
  }
  summaryParts.push(`${report.activeSenders} active`);
  if (report.membersOnly) summaryParts.push('members-only');
  if (report.adminsOnly) summaryParts.push('admins-only');

  if (report.membersOnly) summaryParts.push('[members-only]');
  if (report.adminsOnly) summaryParts.push('[admins-only]');

  return {
    text: lines.join('\n'),
    mentions,
    summary: summaryParts.join(' · '),
  };
}
