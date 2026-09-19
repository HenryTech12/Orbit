import {
  extractSentinelQuestion,
  isSentinelMention,
} from "./mentionDetector.js";
import { copilotApi } from "../api/copilotApi.js";
import type { WhatsAppMessage, WhatsAppReply } from "../types/whatsapp.js";
import { MOCK_SUMMARY_RESPONSE } from "../mock/mockData.js";

export async function handleMessage(
  message: WhatsAppMessage,
  sentinelJid?: string,
): Promise<WhatsAppReply | null> {
  const text = message.text.trim();

  if (/^\/summary\b/i.test(text)) {
    const citations = MOCK_SUMMARY_RESPONSE.sources
      .map((source) => `• ${source.sourceName}: ${source.excerpt}`)
      .join("\n");

    return {
      text: [
        MOCK_SUMMARY_RESPONSE.summary,
        "",
        `Trust: ${MOCK_SUMMARY_RESPONSE.status}`,
        "",
        "Sources:",
        citations,
      ].join("\n"),
      replyToMessageId: message.messageId,
    };
  }

  if (
    message.messageType !== "conversation" &&
    message.messageType !== "extendedTextMessage"
  ) {
    if (!isSentinelMention(message, sentinelJid)) {
      return null;
    }

    return {
      text: "Sentinel currently supports text questions only. Document and media understanding is not enabled yet.",
      replyToMessageId: message.messageId,
    };
  }

  if (!isSentinelMention(message, sentinelJid)) {
    return null;
  }

  const question = extractSentinelQuestion(text);
  
  const normalizedQuestion =
  /^(what did i miss|what have i missed|catch me up|give me a catch[- ]up)\??$/i.test(
    question,
  )
    ? "What did I miss in this conversation? Summarize the important recent updates, decisions, deadlines, and action items."
    : question;

  // Ignore an empty mention.
  if (!question) {
    return {
      text: "Please include a question after @sentinel.",
      replyToMessageId: message.messageId,
    };
  }

  const response = await copilotApi.ask({
    question: normalizedQuestion,
    conversationId: message.chatId,
    userId: message.senderId,
  });

  const citations = response.citations
    .map((citation) => `• ${citation.sourceName}: ${citation.excerpt}`)
    .join("\n");

  const replyText = [
    response.answer,
    "",
    `Trust: ${response.status}`,
    "",
    "Sources:",
    citations || "• No source citations available.",
  ].join("\n");

  return {
    text: replyText,
    replyToMessageId: message.messageId,
  };
}
