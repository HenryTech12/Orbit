import {
  extractSentinelQuestion,
  isSentinelMention,
} from './mentionDetector.js';
import { copilotApi } from '../api/copilotApi.js';
import { isIgnoredSender } from '../local/botFilter.js';
import {
  parseAnalyticsQuery,
  buildAnalyticsReport,
  formatAnalyticsReport,
} from '../local/analytics.js';
import { parseAdminLookup, lookupAdminMessage } from '../local/adminLookup.js';
import {
  recordChatEntry,
  recordBotReply,
  classifyIncoming,
  formatWindowForPrompt,
  formatQuotedBlock,
  getChatWindow,
} from './chatContext.js';
import type { CopilotAskResponse } from '../types/sentinel.js';
import type { WhatsAppMessage, WhatsAppReply } from '../types/whatsapp.js';

const CATCH_UP_QUESTION =
  'What did I miss in this conversation? Summarize the important recent updates, decisions, deadlines, and action items.';

const TRUST_LABELS: Record<string, string> = {
  CONFIRMED: 'CONFIRMED (official/admin source)',
  UNKNOWN: '(member-reported or inferred)',
  DISPUTED: 'DISPUTED (sources disagree)',
  STALE: 'POSSIBLY OUTDATED',
};

// ─────────────────────────────────────────────────────────────
// PASSIVE LISTENING — DISABLED FOR NOW
//
// Uncomment the HINT_TEXT constant and hintedChats set below,
// plus the block marked "PASSIVE LISTENING (COMMENTED OUT)"
// further down, to re-enable the bot replying to questions in
// groups without being mentioned.
// ─────────────────────────────────────────────────────────────
// const HINT_TEXT =
//   "\n\n💡 Tip: you don't have to @ me — I listen for questions. But @sentinel works too.";
//
// const hintedChats = new Set<string>();

const bareMentionShown = new Set<string>();

const BARE_MENTION_REPLY = `Sentinel here 👋

Ask me anything about the programme — deadlines, sessions, rules, contact info, or what someone said. For example:

• _what's the hackathon deadline?_
• _what did Diane last say?_
• _what did I miss this week?_

Or just type your question.`;

// ─────────────────────────────────────────────────────────────
// PASSIVE LISTENING — DISABLED FOR NOW
//
// isRelevantQuestion gates whether the bot answers in a group
// without being mentioned. Kept here so we can flip it back on.
// ─────────────────────────────────────────────────────────────
// function isRelevantQuestion(text: string): boolean {
//   const q = text.toLowerCase();
//
//   const questionSignal =
//     /\b(what|when|where|who|how|why|which|does anyone know|can someone|did anyone|is there|are there|any idea|anyone know)\b/.test(
//       q,
//     ) || text.trim().endsWith('?');
//
//   const domainTerm =
//     /\b(deadline|meeting|session|call|workshop|schedule|agenda|event|contact|email|phone|admin|lead|organizer|coordinator|diane|gift|munira|jeovaire|charles|hackathon|submission|mit|wadhwani|ignite|cohort|unis|criteria|guidelines|rules|requirements|prize|bootcamp|module)\b/.test(
//       q,
//     );
//
//   return questionSignal && domainTerm;
// }

// ─────────────────────────────────────────────────────────────
// Silent acknowledgments — "okay", "got it", "👍" in a group
// without a mention. Stay silent so the bot isn't noise.
// ─────────────────────────────────────────────────────────────
function isSilentAcknowledgment(text: string, isDM: boolean): boolean {
  if (isDM) return false;

  const t = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (t.length === 0 || t.length > 40) return false;

  return /^(alright|all right|ok|okay|k|kk|got it|gotcha|noted|understood|i see|nice|great|good|cool|awesome|perfect|fine|sure|yep|yeah|yup|yes|no|nope|nah|right|true|exactly|correct|indeed|fair enough|thanks|thank you|thx|ty|cheers|merci|no problem|np)( there| sentinel| everyone| all)?[.!]?$/.test(
    t,
  );
}

const SOURCE_EXCERPT_CHARS = 10;

function formatReply(response: CopilotAskResponse): string {
  const lines = [response.answer];

  if (response.citations.length > 0) {
    lines.push(
      '',
      `Trust: ${TRUST_LABELS[response.status] ?? response.status}`,
      '',
      'Sources:',
      ...response.citations.slice(0, 2).map((c) => {
        const excerpt =
          c.excerpt.length > SOURCE_EXCERPT_CHARS
            ? c.excerpt.slice(0, SOURCE_EXCERPT_CHARS).trimEnd() + '…'
            : c.excerpt;
        const name = c.sourceName.replace(/^WhatsApp — /, '');
        return `• ${name}: ${excerpt}`;
      }),
    );
  }

  return lines.join('\n');
}

export async function handleMessage(
  message: WhatsAppMessage,
  sentinelJid?: string,
): Promise<WhatsAppReply | null> {
  if (isIgnoredSender(message.senderId, message.senderName)) {
    return null;
  }

  // Record EVERY message so the rolling window stays fresh.
  // This runs before any early return — the bot always learns,
  // even when it chooses not to reply.
  recordChatEntry(message);

  const text = message.text.trim();
  const isDM = !message.isGroup;
  const isMentioned = isSentinelMention(message, sentinelJid);

  // Silent acknowledgments in groups when NOT explicitly mentioned.
  if (!isMentioned && isSilentAcknowledgment(text, isDM)) {
    if (process.env.LOG_SKIPS === 'true') {
      console.log(`[skip-ack] "${text.slice(0, 40)}"`);
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // Analytics — works in DM and in group when mentioned.
  // ─────────────────────────────────────────────────────────────
  if (isDM || isMentioned) {
    const analyticsQuery = parseAnalyticsQuery(text);
    if (analyticsQuery) {
      const report = await buildAnalyticsReport(analyticsQuery);
      const formatted = formatAnalyticsReport(report, analyticsQuery.top ?? 10);

      recordBotReply(message.chatId, formatted.summary);

      return {
        text: formatted.text,
        replyToMessageId: message.messageId,
        mentions: formatted.mentions,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Admin lookup
  // ─────────────────────────────────────────────────────────────
  const adminLookup = isDM || isMentioned ? parseAdminLookup(text) : null;
  if (adminLookup) {
    const result = await lookupAdminMessage(adminLookup);
    if (result) {
      recordBotReply(message.chatId, result.text);
      return {
        text: result.text,
        replyToMessageId: message.messageId,
        mentions: result.mentions,
      };
    }
  }

  if (/^\/summary\b/i.test(text)) {
    const response = await copilotApi.ask({
      question: CATCH_UP_QUESTION,
      conversationId: message.chatId,
      userId: message.senderId,
    });
    const reply = formatReply(response);
    recordBotReply(message.chatId, reply);
    return {
      text: reply,
      replyToMessageId: message.messageId,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Document / media handling.
  // ─────────────────────────────────────────────────────────────
  const isDocumentMessage =
    message.messageType === 'documentMessage' ||
    message.messageType === 'documentWithCaptionMessage';

  if (isDocumentMessage) {
    if (!isMentioned) return null;
    const reply =
      "I couldn't open that file — it may be too large or an unsupported format. Try a PDF or DOCX under 25 MB.";
    recordBotReply(message.chatId, reply);
    return {
      text: reply,
      replyToMessageId: message.messageId,
    };
  }

  if (
    message.messageType !== 'conversation' &&
    message.messageType !== 'extendedTextMessage'
  ) {
    if (!isMentioned) return null;
    const reply =
      'Sentinel currently supports text, voice notes and documents only.';
    recordBotReply(message.chatId, reply);
    return {
      text: reply,
      replyToMessageId: message.messageId,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Reply gating.
  //
  // CURRENT BEHAVIOUR: only reply in groups when mentioned.
  // DMs always reply. Everything else is silently recorded.
  // ─────────────────────────────────────────────────────────────
  if (!isDM && !isMentioned) {
    if (process.env.LOG_SKIPS === 'true') {
      console.log(`[skip] "${text.slice(0, 60)}"`);
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // PASSIVE LISTENING (COMMENTED OUT)
  //
  // Uncomment this block AND the HINT_TEXT / hintedChats /
  // isRelevantQuestion sections at the top of the file to
  // re-enable replying to domain questions in groups without a
  // mention. Also uncomment the hint-appending block near the
  // bottom of this function.
  // ─────────────────────────────────────────────────────────────
  // const isRelevant = !isDM && !isMentioned && isRelevantQuestion(text);
  //
  // if (!isDM && !isMentioned && !isRelevant) {
  //   if (process.env.LOG_SKIPS === 'true') {
  //     console.log(`[skip] "${text.slice(0, 60)}"`);
  //   }
  //   return null;
  // }
  //
  // if (isRelevant) {
  //   console.log(`[listen] "${text.slice(0, 60)}"`);
  // }

  const rawQuestion = isMentioned ? extractSentinelQuestion(text) : text;

  // ─────────────────────────────────────────────────────────────
  // Deterministic classification.
  //
  // Only two cases need a fixed reply: bare mention and empty.
  // EVERYTHING ELSE goes to the LLM with the full recent-chat
  // window and, if present, the quoted message. There is no
  // pattern matching for follow-ups — the LLM decides.
  // ─────────────────────────────────────────────────────────────
  const kind = classifyIncoming(rawQuestion);

  if (kind === 'bare-mention') {
    const alreadyShown = bareMentionShown.has(message.chatId);
    bareMentionShown.add(message.chatId);
    const reply = alreadyShown
      ? '👋 What can I help with?'
      : BARE_MENTION_REPLY;
    recordBotReply(message.chatId, reply);
    return {
      text: reply,
      replyToMessageId: message.messageId,
    };
  }

  if (kind === 'empty') {
    const reply = "I don't see a message — what would you like to know?";
    recordBotReply(message.chatId, reply);
    return {
      text: reply,
      replyToMessageId: message.messageId,
    };
  }

  // Normalize catch-up phrasings before sending to the LLM.
  const normalizedQuestion =
    /^(what did i miss|what have i missed|catch me up|give me a catch[- ]up)\??$/i.test(
      rawQuestion,
    )
      ? CATCH_UP_QUESTION
      : rawQuestion;

  // Full context: recent chat window (always present, even if empty).
  const chatWindow = formatWindowForPrompt(getChatWindow(message.chatId));

  // Quoted message, if the user used WhatsApp's quote-reply.
  const quotedBlock =
    message.quotedText && message.quotedText.trim()
      ? formatQuotedBlock(message.quotedText, message.quotedSenderName)
      : undefined;

  const response = await copilotApi.ask({
    question: normalizedQuestion,
    conversationId: message.chatId,
    userId: message.senderId,
    chatWindow,
    quotedBlock,
  });

  // DM delivery — LLM decided this answer should go privately.
  if (response.sendViaDM && isMentioned && !isDM) {
    const senderJid = message.senderId;
    const senderDigits = senderJid
      .split('@')[0]
      .split(':')[0]
      .replace(/\D/g, '');
    const notification = senderDigits
      ? `📩 Sent to @${senderDigits} in DM.`
      : `📩 Sent in DM.`;

    recordBotReply(message.chatId, notification);

    return {
      text: notification,
      replyToMessageId: message.messageId,
      mentions: senderDigits ? [`${senderDigits}@s.whatsapp.net`] : [],
      dmTo: senderJid,
      dmText: formatReply(response),
    };
  }

  const replyText = formatReply(response);

  // ─────────────────────────────────────────────────────────────
  // PASSIVE LISTENING HINT (COMMENTED OUT)
  //
  // When passive listening is re-enabled, uncomment this block
  // so the "💡 Tip" appears once per chat when the bot replies
  // without being mentioned.
  // ─────────────────────────────────────────────────────────────
  // let replyText = formatReply(response);
  //
  // if (isRelevant && !hintedChats.has(message.chatId)) {
  //   hintedChats.add(message.chatId);
  //   replyText += HINT_TEXT;
  // }

  recordBotReply(message.chatId, replyText);

  return {
    text: replyText,
    replyToMessageId: message.messageId,
  };
}
