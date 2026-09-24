import 'dotenv/config';

import type { WhatsAppMessage } from '../types/whatsapp.js';

const digitsOf = (v?: string): string => (v ?? '').replace(/\D/g, '');
const last8 = (v?: string): string => digitsOf(v).slice(-8);

const entries = (process.env.IGNORED_SENDERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ignoredNumbers = new Set(
  entries.filter((s) => digitsOf(s).length >= 8).map(last8),
);
const ignoredNames = entries
  .filter((s) => digitsOf(s).length < 8)
  .map((s) => s.toLowerCase());

/** True for other bots (by phone number or name). Sentinel never answers or learns from them. */
export function isIgnoredSender(
  senderId?: string,
  senderName?: string,
): boolean {
  for (const v of [senderId, senderName]) {
    if (digitsOf(v).length >= 8 && ignoredNumbers.has(last8(v))) return true;
  }
  const names = [senderId, senderName].map((s) => (s ?? '').toLowerCase());
  return names.some((n) => n && ignoredNames.some((x) => n.includes(x)));
}

const BOT_PHRASES = [
  'i answer questions that were already answered here',
  'i answer only when called',
  'i have read everything said in this group',
  'mention me with any question',
  'just type a question or command',
  'messages in this group are stored to power',
  'type privacy for details',
];

export function isBotText(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.startsWith('hello, i am ') && t.includes('bot')) return true;
  if (t.startsWith("hello everyone, i'm ") && t.includes('bot')) return true;
  if (t.startsWith('catch-up:')) return true;
  if (t.includes('trust: ') && t.includes('sources:')) return true; // Sentinel-style replies
  return BOT_PHRASES.some((p) => t.includes(p));
}

export function isBotMessage(m: WhatsAppMessage): boolean {
  return isIgnoredSender(m.senderId, m.senderName) || isBotText(m.text);
}
