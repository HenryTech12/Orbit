import { getContentType, type WAMessage } from '@whiskeysockets/baileys';
import type { WhatsAppMessage } from '../types/whatsapp.js';

export function normalizeWhatsAppMessage(
  message: WAMessage,
): WhatsAppMessage | null {
  if (!message.message || message.key.fromMe) {
    return null;
  }

  const messageType = getContentType(message.message);

  const supported =
    messageType === 'conversation' ||
    messageType === 'extendedTextMessage' ||
    messageType === 'documentMessage' ||
    messageType === 'documentWithCaptionMessage' ||
    messageType === 'audioMessage';

  if (!supported) {
    console.log(`Unsupported WhatsApp message type: ${messageType}`);
  }

  const docMsg =
    message.message.documentMessage ??
    message.message.documentWithCaptionMessage?.message?.documentMessage;

  const audioMsg = message.message.audioMessage;

  const text =
    message.message.conversation ||
    message.message.extendedTextMessage?.text ||
    docMsg?.caption ||
    message.message.imageMessage?.caption ||
    message.message.videoMessage?.caption ||
    '';

  // Documents and voice messages may legitimately have no text — don't drop them.
  if (!text.trim() && !docMsg && !audioMsg) {
    return null;
  }

  const chatId = message.key.remoteJid;
  if (!chatId) return null;

  const contextInfo = message.message.extendedTextMessage?.contextInfo;

  // Quoted-message extraction
  const quoted = contextInfo?.quotedMessage as
    | {
        conversation?: string;
        extendedTextMessage?: { text?: string };
        imageMessage?: { caption?: string };
        videoMessage?: { caption?: string };
        documentMessage?: { caption?: string; fileName?: string };
      }
    | undefined;

  const quotedText =
    quoted?.conversation ||
    quoted?.extendedTextMessage?.text ||
    quoted?.imageMessage?.caption ||
    quoted?.videoMessage?.caption ||
    quoted?.documentMessage?.caption ||
    quoted?.documentMessage?.fileName ||
    undefined;

  const quotedMessageId = contextInfo?.stanzaId ?? undefined;

  // Prefer the real phone number over the LID for both groups and DMs.
  const keyWithAlt = message.key as {
    participantAlt?: string;
    remoteJidAlt?: string;
  };

  const isGroup = chatId.endsWith('@g.us');

  // For groups: participant is the sender.
  // For DMs: remoteJid IS the sender, but may be a LID — use remoteJidAlt if present.
  const senderId = isGroup
    ? keyWithAlt.participantAlt || message.key.participant || chatId
    : keyWithAlt.remoteJidAlt || chatId;

  return {
    messageId: message.key.id || crypto.randomUUID(),
    chatId,
    senderId,
    senderName: message.pushName ?? undefined,
    text,
    messageType,
    isGroup,
    timestamp: Number(message.messageTimestamp || Date.now()),
    mentionedJids: contextInfo?.mentionedJid
      ? [...contextInfo.mentionedJid]
      : [],
    rawMessage: message,

    quotedText,
    quotedMessageId,
    quotedSenderName: undefined,

    // Document metadata
    documentFileName: docMsg?.fileName ?? undefined,
    documentMimetype: docMsg?.mimetype ?? undefined,
    documentSize: docMsg?.fileLength ? Number(docMsg.fileLength) : undefined,

    // Voice metadata
    audioDurationSec: audioMsg?.seconds ?? undefined,
  };
}
