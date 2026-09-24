// ─────────────────────────────────────────────────────────────
// Context resolver — figures out what a message is actually
// asking about before retrieval runs.
//
// Handles four cases:
//   1. Bare mention:       "@sentinel"            → friendly intro
//   2. Quote-reply:        (quote) "@sentinel X"  → subject = quoted message
//   3. Referential:        "@sentinel is that right?" after a message
//                                                 → subject = previous message
//   4. Normal question:    "@sentinel what's X?"  → passthrough
// ─────────────────────────────────────────────────────────────

import type { WhatsAppMessage } from '../types/whatsapp.js';

const MAX_CONTEXT = 3;
const CONTEXT_TTL_MS = 5 * 60 * 1000; // 5 minutes — stale context is useless

interface ContextEntry {
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
}

const recentByChat = new Map<string, ContextEntry[]>();

/**
 * Record an incoming message for context resolution.
 * Called for EVERY message the adapter sees, whether it replies or not.
 */
export function recordContext(message: WhatsAppMessage): void {
  if (!message.text || !message.text.trim()) return;

  const list = recentByChat.get(message.chatId) ?? [];
  list.push({
    senderId: message.senderId,
    senderName: message.senderName ?? 'Someone',
    text: message.text.trim(),
    ts: Date.now(),
  });

  // Trim to last N and drop stale entries.
  const cutoff = Date.now() - CONTEXT_TTL_MS;
  const trimmed = list.filter((e) => e.ts >= cutoff).slice(-MAX_CONTEXT);
  recentByChat.set(message.chatId, trimmed);
}

/**
 * Get the most recent context entry that is NOT the current message.
 * Prioritizes a different sender, falls back to same sender.
 */
function lastContextFor(
  chatId: string,
  currentSenderId: string,
  currentMessageId?: string,
): ContextEntry | undefined {
  const list = recentByChat.get(chatId);
  if (!list || list.length === 0) return undefined;

  // Skip the last entry if it's this exact message (defensive).
  const candidates = [...list].reverse().filter((e) => {
    if (
      currentMessageId &&
      (e as ContextEntry & { messageId?: string }).messageId ===
        currentMessageId
    ) {
      return false;
    }
    return true;
  });

  // Prefer a different sender (question is more likely about someone else's message).
  const differentSender = candidates.find(
    (e) => e.senderId !== currentSenderId,
  );
  return differentSender ?? candidates[0];
}

// ── pronoun / referential detection ──────────────────────────

const REFERENTIAL_PRONOUNS =
  /\b(that|this|it|those|these|the above|the previous|the last one)\b/i;

const REFERENTIAL_QUESTION_STARTS =
  /^(is|are|was|were|did|does|do|can|could|should|will|would|why|how|so)\b/i;

function isReferentialQuestion(text: string): boolean {
  const t = text.trim();

  // Too short to be a full question on its own? Might be referential.
  if (t.length > 120) return false;

  // Starts with a pronoun reference or is a short verification question.
  if (REFERENTIAL_PRONOUNS.test(t)) return true;
  if (REFERENTIAL_QUESTION_STARTS.test(t) && t.length < 60) return true;

  // Common short verification questions.
  if (/^(right|correct|true|sure|really|ok|okay)\b/i.test(t)) return true;

  return false;
}

// ── the main resolver ────────────────────────────────────────

export interface ResolvedQuestion {
  kind: 'bare-mention' | 'quote-reply' | 'referential' | 'normal';
  question: string; // the question to ask, with context prepended if any
  contextNote?: string; // human-readable note about what context we used
}

export function resolveQuestion(
  message: WhatsAppMessage,
  extractedQuestion: string,
): ResolvedQuestion {
  const trimmed = extractedQuestion.trim();

  // Case 1 — bare mention, no question at all.
  if (!trimmed) {
    return { kind: 'bare-mention', question: '' };
  }

  // Case 2 — quote-reply.
  if (message.quotedText && message.quotedText.trim()) {
    const quoted = message.quotedText.trim();
    const question = `[Context: this message is a reply to a previous message that said: "${quoted.slice(0, 500)}"]\n\nQuestion: ${trimmed}`;
    return {
      kind: 'quote-reply',
      question,
      contextNote: 'quoting a previous message',
    };
  }

  // Case 3 — referential question about the previous message in chat.
  if (isReferentialQuestion(trimmed)) {
    const prev = lastContextFor(
      message.chatId,
      message.senderId,
      message.messageId,
    );
    if (prev) {
      const question = `[Context: the previous message in this chat, from ${prev.senderName}, was: "${prev.text.slice(0, 500)}"]\n\nQuestion: ${trimmed}`;
      return {
        kind: 'referential',
        question,
        contextNote: `referring to ${prev.senderName}'s previous message`,
      };
    }
  }

  // Case 4 — normal question.
  return { kind: 'normal', question: trimmed };
}

export function clearContext(chatId: string): void {
  recentByChat.delete(chatId);
}
