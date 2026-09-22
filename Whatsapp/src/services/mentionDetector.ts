import type { WhatsAppMessage } from '../types/whatsapp.js';

export function isSentinelMention(
  message: WhatsAppMessage,
  sentinelJid?: string,
): boolean {
  const textMentioned = /^@sentinel\b/i.test(message.text.trim());

 const actuallyMentioned =
  !!sentinelJid &&
  (message.mentionedJids?.includes(sentinelJid) ?? false);
  return textMentioned || actuallyMentioned;
}

export function extractSentinelQuestion(
  text: string,
): string {
  return text.trim().replace(/^@sentinel\b/i, '').trim();
}