import {
  extractSentinelQuestion,
  isSentinelMention,
} from "./mentionDetector.js";
import { copilotApi } from "../api/copilotApi.js";
import type { WhatsAppMessage, WhatsAppReply } from "../types/whatsapp.js";

export async function handleMessage(
  message: WhatsAppMessage,
  sentinelJid?: string,
): Promise<WhatsAppReply | null> {
  const text = message.text.trim();

  if (!isSentinelMention(message, sentinelJid)) {
    return null;
  }

  const question = extractSentinelQuestion(text);

  // Ignore an empty mention.
  if (!question) {
    return {
      text: "Please include a question after @sentinel.",
      replyToMessageId: message.messageId,
    };
  }

  const response = await copilotApi.ask({
    question,
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
