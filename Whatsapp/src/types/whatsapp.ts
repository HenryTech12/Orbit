import type { WAMessage } from "@whiskeysockets/baileys";
export interface WhatsAppMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  text: string;
  isGroup: boolean;
  timestamp: number;
  mentionedJids?: string[];
  rawMessage?: WAMessage;
}

export interface WhatsAppReply {
  text: string;
  replyToMessageId?: string;
}