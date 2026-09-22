import type { WhatsAppMessage } from "../types/whatsapp.js";

export interface WhatsAppGateway {
  start(): Promise<void>;
  getOwnJid(): string | undefined;

  sendMessage(
    chatId: string,
    text: string,
    replyToMessageId?: string,
  ): Promise<void>;

  onMessage(handler: (message: WhatsAppMessage) => Promise<void>): void;
}
