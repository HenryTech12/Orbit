// ─────────────────────────────────────────────────────────────
// Admin lookup — pull a specific admin's latest (or first) messages,
// or list all admins.
//
// Handles:
//   "what did Diane last say?"
//   "Diane's last message"
//   "last message from Gift"
//   "first message from Munira"
//   "last 4 messages from Gift"       ← digit form
//   "last four messages from Gift"    ← word form
//   "first messages from Diane"       ← plural, defaults to 3
//   "last admin message"              ← any admin
//   "full Diane last message"         ← untruncated
//   "@250783188655 last message"      ← mentioned by number
//   "+250 783 188 655 latest post"    ← with spaces
//   "who are the admins?"             ← list mode
//
// Only admins qualify. Members are excluded to prevent overload
// and protect privacy.
// ─────────────────────────────────────────────────────────────

import { getWhatsAppKnowledge } from './whatsappKnowledgeStore.js';
import { TRUSTED_ADMINS } from './trustedAdmins.js';
import type { Admin } from './trustedAdmins.js';
import type { WhatsAppMessage } from '../types/whatsapp.js';

const MAX_COUNT = 5; // hard cap: never return more than this
const DEFAULT_PLURAL = 3; // "messages" (plural, no number) → this many

// ── types ────────────────────────────────────────────────────

export interface AdminLookupQuery {
  admin?: Admin; // undefined = any admin, or list mode
  direction: 'latest' | 'first';
  count: number; // 0 = list mode, else 1..MAX_COUNT
  full: boolean;
}

export interface AdminLookupResult {
  text: string;
  mentions: string[];
}

// ── helpers ──────────────────────────────────────────────────

function digitsOnly(v: string | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

function toMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein — small, only used for admin name matching.
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// Find which admin (if any) is referenced in the question.
function findAdminReference(q: string): Admin | undefined {
  const digits = digitsOnly(q);

  // Match by phone number.
  for (const admin of TRUSTED_ADMINS) {
    if (digits.includes(admin.digits)) return admin;
  }

  // Match by name (with typo tolerance).
  for (const admin of TRUSTED_ADMINS) {
    const nameLower = admin.name.toLowerCase();
    if (q.includes(nameLower)) return admin;
    if (nameLower.length >= 4) {
      const words = q.split(/\s+/);
      for (const w of words) {
        if (w.length >= 4 && withinDistance(w, nameLower, 1)) {
          return admin;
        }
      }
    }
  }

  return undefined;
}

// ── query detector ───────────────────────────────────────────

const TEMPORAL_LATEST = /\b(last|latest|most recent|newest|recent)\b/;
const TEMPORAL_FIRST = /\b(first|earliest|oldest|initial)\b/;
const MESSAGE_WORD =
  /\b(message|messages|mesage|mesages|messge|messges|messege|say|said|saying|statment|statement|post|posted|wrote|writing|write|text|texts)\b/;

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function parseAdminLookup(text: string): AdminLookupQuery | null {
  const q = normalize(text);

  // ── List mode: "who are the admins?" / "list admins" / "show admins" ──
  if (
    /\b(who|list|show|which|name|tell me)\b.*\b(are\s+the\s+|the\s+)?admins?\b/.test(
      q,
    ) ||
    /^(admins?|admin\s+list|admin\s+team)$/.test(q) ||
    /\bwho('s| is| are) (in charge|leading|the admin|the admins)\b/.test(q) ||
    /\badmins? (of|in) (this|the) (group|programme|program)\b/.test(q)
  ) {
    // Only fire if there's no specific admin name mentioned alongside
    // (avoids "what did Diane say about the admins?" being caught here).
    const specificAdmin = findAdminReference(q);
    if (!specificAdmin) {
      return {
        admin: undefined,
        direction: 'latest',
        count: 0,
        full: true,
      };
    }
  }

  // ── Message lookup mode ──

  // Must contain a message word.
  if (!MESSAGE_WORD.test(q)) return null;

  // Must contain a temporal keyword.
  const isLatest = TEMPORAL_LATEST.test(q);
  const isFirst = TEMPORAL_FIRST.test(q);
  if (!isLatest && !isFirst) return null;

  // Find the admin reference.
  const admin = findAdminReference(q);

  // Generic admin reference ("any admin", "the admin", "admins").
  const genericAdmin = /\b(admin|admins)\b/.test(q);

  if (!admin && !genericAdmin) return null;

  // ── count detection ───────────────────────────────────────
  // 1. Digit form:  "last 4 messages"
  // 2. Word form:   "last four messages"
  // 3. Plural:      "last messages" → DEFAULT_PLURAL
  // 4. Default:     1
  let rawCount = 1;

  const temporal =
    '(?:last|latest|newest|recent|most recent|first|earliest|oldest|initial)';

  const numericMatch = q.match(new RegExp(`\\b${temporal}\\s+(\\d{1,2})\\b`));
  if (numericMatch) {
    rawCount = Number(numericMatch[1]);
  } else {
    const wordMatch = q.match(
      new RegExp(
        `\\b${temporal}\\s+(one|two|three|four|five|six|seven|eight|nine|ten)\\b`,
      ),
    );
    if (wordMatch) {
      rawCount = WORD_NUMBERS[wordMatch[1]] ?? 1;
    } else if (/\bmessages\b/.test(q)) {
      // Plural "messages" with no explicit number → default.
      rawCount = DEFAULT_PLURAL;
    }
  }

  const count = Math.max(1, Math.min(rawCount, MAX_COUNT));

  // Detect "full" / "complete" modifier.
  const full = /\b(full|complete|whole|entire)\b/.test(q);

  return {
    admin,
    direction: isFirst && !isLatest ? 'first' : 'latest',
    count,
    full,
  };
}

// ── lookup ───────────────────────────────────────────────────

function senderMatchesAdmin(m: WhatsAppMessage, admin: Admin): boolean {
  if (digitsOnly(m.senderId).includes(admin.digits)) return true;
  const name = (m.senderName ?? '').toLowerCase().trim();
  return name === admin.name.toLowerCase();
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateSmart(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const slice = clean.slice(0, max);
  const lastStop = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! '),
  );
  if (lastStop > max * 0.6) {
    return slice.slice(0, lastStop + 1).trimEnd() + '…';
  }
  return slice.trimEnd() + '…';
}

// ── main ─────────────────────────────────────────────────────

export async function lookupAdminMessage(
  query: AdminLookupQuery,
): Promise<AdminLookupResult | null> {
  // ── List mode ──
  if (query.count === 0) {
    const lines: string[] = ['👑 *Programme admins*', ''];
    const mentionTokens: string[] = [];
    const mentions: string[] = [];

    for (const admin of TRUSTED_ADMINS) {
      lines.push(`• ${admin.name}`);
      mentionTokens.push(`@${admin.digits}`);
      mentions.push(`${admin.digits}@s.whatsapp.net`);
    }

    lines.push('');
    lines.push(mentionTokens.join(' '));

    return { text: lines.join('\n'), mentions };
  }

  // ── Message lookup mode ──
  const all = await getWhatsAppKnowledge();

  const adminMessages = all.filter((m) => {
    if (!m.text || !m.text.trim()) return false;
    if (m.text.startsWith('/')) return false;
    if (query.admin) return senderMatchesAdmin(m, query.admin);
    return TRUSTED_ADMINS.some((a) => senderMatchesAdmin(m, a));
  });

  if (adminMessages.length === 0) {
    const who = query.admin ? query.admin.name : 'any admin';
    return {
      text: `I haven't seen any messages from ${who} in the loaded history. Try "what did ${query.admin?.name ?? 'Diane'} say about <topic>?" to search their messages.`,
      mentions: [],
    };
  }

  const sorted = [...adminMessages].sort(
    (a, b) => toMs(a.timestamp) - toMs(b.timestamp),
  );

  // Choose the requested window of messages.
  const chosen: WhatsAppMessage[] =
    query.direction === 'first'
      ? sorted.slice(0, query.count)
      : sorted.slice(-query.count);

  // For "last N", show the newest first. For "first N", keep oldest first.
  const ordered = query.direction === 'first' ? chosen : [...chosen].reverse();

  // Attribute to a specific admin (for "any admin" queries).
  const primaryAdmin =
    query.admin ??
    TRUSTED_ADMINS.find((a) => senderMatchesAdmin(ordered[0], a));

  const adminLabel = primaryAdmin?.name ?? 'Admin';
  const adminDigits = primaryAdmin?.digits;

  const lines: string[] = [];

  if (query.count === 1) {
    // Single-message format.
    const m = ordered[0];
    const when = formatTimestamp(toMs(m.timestamp));
    const body = query.full ? m.text.trim() : truncateSmart(m.text, 350);
    const truncated = !query.full && m.text.length > 350;

    const title =
      query.direction === 'first'
        ? `${adminLabel}'s first message`
        : `${adminLabel}'s latest message`;

    lines.push(`📩 *${title}*`);
    lines.push(when);
    lines.push('');
    lines.push(body);

    if (truncated) {
      lines.push('');
      const dirWord = query.direction === 'first' ? 'first' : 'last';
      lines.push(
        `_[Message is ${m.text.length} chars — ask "full ${adminLabel} ${dirWord} message" for the complete text]_`,
      );
    }
  } else {
    // Multi-message format.
    const title =
      query.direction === 'first'
        ? `${adminLabel}'s first ${ordered.length} messages`
        : `${adminLabel}'s last ${ordered.length} messages`;

    lines.push(`📩 *${title}*`);
    lines.push('');

    ordered.forEach((m, idx) => {
      const when = formatTimestamp(toMs(m.timestamp));
      const body = query.full ? m.text.trim() : truncateSmart(m.text, 200);
      lines.push(`*${idx + 1}.* ${when}`);
      lines.push(body);
      if (idx < ordered.length - 1) lines.push('');
    });
  }

  const mentions = adminDigits ? [`${adminDigits}@s.whatsapp.net`] : [];
  const text = adminDigits
    ? `@${adminDigits} ${lines.join('\n')}`
    : lines.join('\n');

  return { text, mentions };
}
