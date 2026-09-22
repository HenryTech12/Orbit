import { getContentType, type WAMessage } from "@whiskeysockets/baileys";
import type { WhatsAppMessage } from "../types/whatsapp.js";

export function normalizeWhatsAppMessage(
  message: WAMessage,
): WhatsAppMessage | null {
  if (!message.message || message.key.fromMe) {
    return null;
  }

  const messageType = getContentType(message.message);

  if (messageType !== "conversation" && messageType !== "extendedTextMessage") {
    console.log(`Unsupported WhatsApp message type: ${messageType}`);
  }

  const text =
  message.message.conversation ||
  message.message.extendedTextMessage?.text ||
  message.message.documentWithCaptionMessage?.message?.documentMessage?.caption ||
  message.message.imageMessage?.caption ||
  message.message.videoMessage?.caption ||
  message.message.documentMessage?.caption ||
  "";

  if (!text.trim()) {
    return null;
  }

  const chatId = message.key.remoteJid;

  if (!chatId) {
    return null;
  }

  const contextInfo = message.message.extendedTextMessage?.contextInfo;

  return {
    messageId: message.key.id || crypto.randomUUID(),
    chatId,
    senderId: message.key.participant || chatId,
    senderName: message.pushName ?? undefined,
    text,
    messageType,
    isGroup: chatId.endsWith("@g.us"),
    timestamp: Number(message.messageTimestamp || Date.now()),
    mentionedJids: contextInfo?.mentionedJid
      ? [...contextInfo.mentionedJid]
      : [],
    rawMessage: message,
  };
}
