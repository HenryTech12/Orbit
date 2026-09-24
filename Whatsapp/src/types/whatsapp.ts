import type { WAMessage } from '@whiskeysockets/baileys';

export interface WhatsAppMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  text: string;
  isGroup: boolean;
  timestamp: number;
  mentionedJids?: string[];
  messageType?: string;
  rawMessage?: WAMessage;
  quotedText?: string;
  quotedSenderName?: string;
  quotedMessageId?: string;

  // NEW — document metadata (populated when the message is a file share)
  documentFileName?: string; // "hackathon-brief.pdf"
  documentMimetype?: string; // "application/pdf"
  documentSize?: number; // bytes
  audioDurationSec?: number; // NEW — voice message duration
}

export interface WhatsAppReply {
  text: string;
  replyToMessageId?: string;
  mentions?: string[];
  dmTo?: string;
  dmText?: string;
  document?: {
    path: string; // documents/{id}.pdf
    fileName: string;
    mimetype: string;
  };
}
