// ─────────────────────────────────────────────────────────────
// Chat context — shared situational awareness per chat.
//
// Keeps a rolling window of the last N messages in each chat
// (regardless of who sent them). The window is what lets the LLM
// resolve references — pronouns, follow-ups, continuations — by
// reading the live conversation, not by pattern-matching.
//
// There is NO classifier for message type. Every message goes to
// the LLM with the full recent-chat window and, when present, the
// quoted message. The LLM decides what it means.
//
// Only two cases are handled deterministically:
//   - bare-mention: "@sentinel" with no content → friendly intro
//   - empty:        "??", "!!", emoji-only → ask for clarification
// ─────────────────────────────────────────────────────────────

import type { WhatsAppMessage } from '../types/whatsapp.js';
import { isTrustedAdmin } from '../local/trustedAdmins.js';

const MAX_ENTRIES = 20;
const TTL_MS = 15 * 60 * 1000; // 15 minutes

export type SenderRole = 'BOT' | 'ADMIN' | 'OFFICIAL' | 'MEETING' | 'MEMBER';

export interface ChatEntry {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  role: SenderRole;
  isBot: boolean;
}

// ── storage ──────────────────────────────────────────────────

const buffers = new Map<string, ChatEntry[]>();

function isBotSender(senderId: string, senderName?: string): boolean {
  const s = `${senderId} ${senderName ?? ''}`.toLowerCase();
  return (
    s.includes('sentinel') ||
    s.includes('bot') ||
    s.includes('orbit') ||
    s.includes('jymns')
  );
}

function roleFor(message: WhatsAppMessage): SenderRole {
  if (isBotSender(message.senderId, message.senderName)) return 'BOT';
  if (message.senderId === 'official') return 'OFFICIAL';
  if (message.senderId === 'meeting') return 'MEETING';
  if (isTrustedAdmin(message.senderId, message.senderName)) return 'ADMIN';
  return 'MEMBER';
}

/**
 * Record a message into its chat's rolling buffer.
 * Called for EVERY message the adapter sees — bot, admin, member, anything.
 */
export function recordChatEntry(message: WhatsAppMessage): void {
  if (!message.text || !message.text.trim()) return;
  if (message.messageId.startsWith('bot-')) return; // bot replies recorded separately

  const list = buffers.get(message.chatId) ?? [];
  list.push({
    messageId: message.messageId,
    senderId: message.senderId,
    senderName: message.senderName ?? 'Member',
    text: message.text.trim(),
    timestamp: normalizeTs(message.timestamp),
    role: roleFor(message),
    isBot: roleFor(message) === 'BOT',
  });

  const cutoff = Date.now() - TTL_MS;
  const trimmed = list.filter((e) => e.timestamp >= cutoff).slice(-MAX_ENTRIES);
  buffers.set(message.chatId, trimmed);
}

/**
 * Record a bot reply into the same buffer, so follow-ups can
 * reference what Sentinel itself just said.
 */
export function recordBotReply(
  chatId: string,
  text: string,
  messageId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): void {
  if (!text.trim()) return;

  const list = buffers.get(chatId) ?? [];
  list.push({
    messageId,
    senderId: 'sentinel',
    senderName: 'Sentinel',
    text: text.trim().slice(0, 1000),
    timestamp: Date.now(),
    role: 'BOT',
    isBot: true,
  });

  const cutoff = Date.now() - TTL_MS;
  const trimmed = list.filter((e) => e.timestamp >= cutoff).slice(-MAX_ENTRIES);
  buffers.set(chatId, trimmed);
}

export function getChatWindow(chatId: string): ChatEntry[] {
  const list = buffers.get(chatId) ?? [];
  const cutoff = Date.now() - TTL_MS;
  return list.filter((e) => e.timestamp >= cutoff);
}

export function clearChat(chatId: string): void {
  buffers.delete(chatId);
}

function normalizeTs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

// ── deterministic classification ─────────────────────────────
//
// ONLY two cases need a deterministic response. Everything else
// goes to the LLM with full context — no pattern matching.

export type IncomingKind = 'bare-mention' | 'empty' | 'process';

/**
 * Classify a message that has already been determined to be for
 * Sentinel (mentioned, DM, or passive-listen match).
 *
 * Returns:
 *   'bare-mention' — "@sentinel" alone (or with only punctuation)
 *   'empty'        — only punctuation, emoji, or symbols
 *   'process'      — anything else → goes to the LLM with context
 */
export function classifyIncoming(text: string): IncomingKind {
  // Strip the mention itself.
  const stripped = text.replace(/@sentinel\b/gi, '').trim();

  // Nothing left → bare mention.
  if (stripped.length === 0) return 'bare-mention';

  // Nothing but punctuation/emoji/symbols → empty.
  const contentChars = stripped.replace(/[\p{P}\p{S}\s]/gu, '');
  if (contentChars.length === 0) return 'empty';

  return 'process';
}

// ── formatting for LLM ───────────────────────────────────────

const ROLE_TAG: Record<SenderRole, string> = {
  BOT: 'BOT',
  ADMIN: 'ADMIN',
  OFFICIAL: 'OFFICIAL',
  MEETING: 'MEETING',
  MEMBER: 'MEMBER',
};

function trim(text: string, n: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

/**
 * Format a chat window for inclusion in the LLM prompt.
 * `maxEntries` trims to the last N entries (default: everything in the window).
 */
export function formatWindowForPrompt(
  entries: ChatEntry[],
  maxEntries = 20,
): string {
  if (entries.length === 0) return '(no recent messages in this chat)';

  const slice = entries.slice(-maxEntries);
  const lines: string[] = [];

  for (const e of slice) {
    const time = new Date(e.timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push(
      `[${time}] [${ROLE_TAG[e.role]}] ${e.senderName}: ${trim(e.text, 220)}`,
    );
  }

  return lines.join('\n');
}

/**
 * Format a quoted message as its own clearly-labeled block, separate
 * from the rolling chat window. Passed to the copilot as
 * AskOptions.quotedBlock.
 */
export function formatQuotedBlock(text: string, senderName?: string): string {
  const who = senderName && senderName.trim() ? senderName.trim() : 'someone';
  return `[In reply to ${who}]: "${trim(text, 500)}"`;
}
