// ─────────────────────────────────────────────────────────────
// Mention detection.
//
// Sentinel is triggered when ANY of these are true:
//   1. The message contains "@sentinel" (anywhere, any case).
//   2. The message contains "sentinel" as a standalone word AND
//      the surrounding text reads like a request.
//   3. The message is a quote-reply to one of Sentinel's own
//      messages, OR mentions the bot's JID (WhatsApp's native @).
//
// In DMs, mention detection is not required — every DM is for the bot.
// ─────────────────────────────────────────────────────────────

import type { WhatsAppMessage } from '../types/whatsapp.js';

const SENTINEL_WORD = /\bsentinel\b/i;
const REQUEST_SIGNAL =
  /\?|^(hi|hey|hello|please|can you|could you|would you|do you|are you|will you|help|tell me|show me|what|when|where|who|why|how)\b/i;

export function isSentinelMention(
  message: WhatsAppMessage,
  sentinelJid?: string,
): boolean {
  const text = (message.text ?? '').trim();
  if (!text) return false;

  // ── 1. Literal "@sentinel" anywhere in the text ──
  if (/@sentinel\b/i.test(text)) return true;

  // ── 2. Native WhatsApp mention of the bot's JID ──
  if (sentinelJid && message.mentionedJids?.length) {
    // Normalize both sides — WhatsApp gives JIDs in different forms
    // ("250783188655@s.whatsapp.net" vs "250783188655:3@s.whatsapp.net").
    const botDigits = sentinelJid
      .split('@')[0]
      .split(':')[0]
      .replace(/\D/g, '');
    if (botDigits) {
      const mentioned = message.mentionedJids.some((jid) => {
        const digits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
        return digits === botDigits;
      });
      if (mentioned) return true;
    }
  }

  // ── 3. Quote-reply to one of the bot's own messages ──
  if (message.quotedText && message.quotedSenderName) {
    const sender = message.quotedSenderName.toLowerCase();
    if (sender.includes('sentinel') || sender === 'bot') return true;
  }

  // ── 4. Bare "sentinel" as a word, with a request signal ──
  if (SENTINEL_WORD.test(text) && REQUEST_SIGNAL.test(text)) return true;

  return false;
}

/**
 * Extract the actual question from a message that mentions Sentinel.
 * Strips the "@sentinel" prefix wherever it appears, along with any
 * trailing punctuation, and returns the cleaned-up question text.
 */
export function extractSentinelQuestion(text: string): string {
  let out = text.trim();

  // Strip any variant of the mention anywhere in the text.
  out = out.replace(/@sentinel\b/gi, '');

  // Strip leading "sentinel," or "hey sentinel," when no @ was used.
  out = out.replace(/^\s*(hi|hey|hello|ok|okay)?\s*sentinel[,\s:!?-]+/i, '');

  // Trim whitespace and leading punctuation.
  out = out.replace(/^[\s,;:.\-!?]+/, '').trim();

  return out;
}
