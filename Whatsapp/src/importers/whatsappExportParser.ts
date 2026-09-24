import type { WhatsAppMessage } from '../types/whatsapp.js';

// ─────────────────────────────────────────────────────────────
// WhatsApp .txt export parser.
//
// Handles:
//   [18/09/2026, 10:15] Alice: Hello            (EU, 24h)
//   [9/4/26, 9:27:15 AM] +250 783 188 655: Hi   (US, 12h)
//   [18.09.2026, 10:15:32] Bob: multi-line...   (dots, seconds)
//   [9/4/26, 12:13:07 PM] - +224... joined       (system message)
//
// Stable message IDs derived from (date, time, sender, text-prefix)
// so the embedding cache survives restarts.
// ─────────────────────────────────────────────────────────────

// Matches BOTH the "Sender: text" form and the system-message form
// "[date, time] - action". Captures the tail into `body`.
const LINE_PATTERN =
  /^\[(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap]\.?[Mm]\.?)?)\]\s*([\s\S]*)$/;

// Within the tail, split "Sender: text" from " - action".
const SENDER_SPLIT = /^([^:\n]{1,80}?):\s+([\s\S]*)$/;
const SYSTEM_PREFIX = /^[-\u2013\u2014]\s+(.*)$/;

type DateFormat = 'US' | 'EU';

/**
 * Detect whether the file uses M/D/YY (US) or D/M/YYYY (EU) by
 * scanning the first 30 date-bearing lines. If both first and second
 * numbers are ≤ 12 in every sample, defaults to US — that's what
 * WhatsApp Web produces.
 */
function detectDateFormat(lines: string[]): DateFormat {
  let sawEU = false;

  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const m = lines[i].match(/\[(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (!m) continue;

    const a = Number(m[1]);
    const b = Number(m[2]);

    if (a > 12 && b <= 12) return 'EU'; // day first
    if (b > 12 && a <= 12) return 'US'; // month first
    if (a > 12 && b > 12) continue; // ambiguous — skip

    // Both ≤ 12: still ambiguous. If we see even one EU case, keep it.
    if (a > 12) sawEU = true;
  }

  return sawEU ? 'EU' : 'US';
}

function twoDigitYear(y: number): number {
  if (y >= 100) return y;
  // 2000s range — safe for WhatsApp exports in the 2020s.
  return 2000 + y;
}

/**
 * Parse a WhatsApp date + time into a millisecond timestamp.
 * Handles 12h (with AM/PM) and 24h time strings.
 */
function parseWhatsAppTimestamp(
  date: string,
  time: string,
  format: DateFormat,
): number {
  // Normalize separators to '/'.
  const parts = date.replace(/[.\-]/g, '/').split('/').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return Date.now();
  }

  let month: number;
  let day: number;
  let year: number;

  if (format === 'US') {
    [month, day, year] = parts;
  } else {
    [day, month, year] = parts;
  }
  year = twoDigitYear(year);

  // Time: "9:27:15 AM" | "14:33" | "9:27 AM"
  const t = time.trim();
  const timeMatch = t.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([APap])\.?[Mm]\.?)?$/,
  );
  if (!timeMatch) return Date.now();

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = timeMatch[3] ? Number(timeMatch[3]) : 0;
  const meridiem = timeMatch[4]?.toUpperCase();

  if (meridiem === 'P' && hour < 12) hour += 12;
  else if (meridiem === 'A' && hour === 12) hour = 0;

  const dt = new Date(year, month - 1, day, hour, minute, second, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * Stable, deterministic ID from message content. Two runs over the
 * same export produce the same IDs, so the embedding cache hits.
 * Uses timestamp + sender + first 80 chars of text.
 */
function stableId(
  chatId: string,
  timestamp: number,
  senderId: string,
  text: string,
): string {
  const raw = `${chatId}|${timestamp}|${senderId}|${text.slice(0, 80)}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  }
  return `wa-${(h >>> 0).toString(36)}`;
}

export function parseWhatsAppExport(
  content: string,
  chatId = 'imported-whatsapp-chat',
): WhatsAppMessage[] {
  const lines = content.split(/\r?\n/);
  const format = detectDateFormat(lines);

  const messages: WhatsAppMessage[] = [];
  let currentMessage: WhatsAppMessage | null = null;

  for (const line of lines) {
    const match = line.match(LINE_PATTERN);

    if (!match) {
      // Continuation of a multi-line message.
      if (currentMessage && line.trim()) {
        currentMessage.text += `\n${line}`;
      }
      continue;
    }

    const [, date, time, rawTail] = match;
    const timestamp = parseWhatsAppTimestamp(date, time, format);

    // Is this "Sender: text" or a system message "- action"?
    const senderMatch = rawTail.match(SENDER_SPLIT);
    let senderId: string;
    let senderName: string;
    let text: string;

    if (senderMatch) {
      senderName = senderMatch[1].trim();
      senderId = senderName;
      text = senderMatch[2];
    } else {
      const sysMatch = rawTail.match(SYSTEM_PREFIX);
      if (sysMatch) {
        // System message — no sender.
        senderName = 'System';
        senderId = 'system';
        text = sysMatch[1].trim();
      } else {
        // Fallback: keep the raw text with no sender attribution.
        senderName = 'Unknown';
        senderId = 'unknown';
        text = rawTail.trim();
      }
    }

    // Skip pure whitespace/system noise for events we can't use.
    if (!text.trim()) continue;

    currentMessage = {
      messageId: stableId(chatId, timestamp, senderId, text),
      chatId,
      senderId,
      senderName,
      text,
      isGroup: true,
      timestamp,
    };

    messages.push(currentMessage);
  }

  return messages;
}
