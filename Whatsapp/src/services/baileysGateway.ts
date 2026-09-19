import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

import qrcode from "qrcode-terminal";

import type { WhatsAppMessage } from "../types/whatsapp.js";
import type { WhatsAppGateway } from "./whatsappGateway.js";
import { normalizeWhatsAppMessage } from "./messageNormalizer.js";

export class BaileysGateway implements WhatsAppGateway {
  private sock?: ReturnType<typeof makeWASocket>;
  private processedMessageKeys = new Set<string>();
  private readonly maxProcessedMessageKeys = 1000;
  private messageHandler:
    | ((message: WhatsAppMessage) => Promise<void>)
    | undefined;

  onMessage(handler: (message: WhatsAppMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  getOwnJid(): string | undefined {
    return this.sock?.user?.id;
  }

  async start(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    this.sock = makeWASocket({
      auth: state,
    });

    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on(
      "connection.update",
      ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          console.log("\nScan this QR code with WhatsApp:\n");
          qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
          console.log("WhatsApp connected.");
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(
            `WhatsApp connection closed. Reconnect: ${shouldReconnect}`,
          );

          if (shouldReconnect) {
            void this.start();
          }
        }
      },
    );

    this.sock.ev.on("messages.upsert", async ({ messages }) => {
      console.log(
        "Incoming WhatsApp event:",
        JSON.stringify(messages, null, 2),
      );
      for (const message of messages) {
        const messageKey = JSON.stringify({
          remoteJid: message.key.remoteJid,
          participant: message.key.participant,
          fromMe: message.key.fromMe,
          id: message.key.id,
        });
        if (messageKey && this.processedMessageKeys.has(messageKey)) {
          console.log(`Skipping duplicate WhatsApp message: ${messageKey}`);
          continue;
        }

        if (messageKey) {
          this.processedMessageKeys.add(messageKey);
          if (this.processedMessageKeys.size > this.maxProcessedMessageKeys) {
            const oldestKey = this.processedMessageKeys.values().next().value;

            if (oldestKey) {
              this.processedMessageKeys.delete(oldestKey);
            }
          }
        }

        const normalizedMessage = normalizeWhatsAppMessage(message);
        if (!normalizedMessage) {
          continue;
        }

        if (this.messageHandler) {
          await this.messageHandler(normalizedMessage);
        }
      }
    });
  }

  async sendMessage(
    chatId: string,
    text: string,
    replyToMessageKey?: string,
    quotedMessage?: import("@whiskeysockets/baileys").WAMessage,
  ): Promise<void> {
    if (!this.sock) {
      throw new Error("WhatsApp socket is not connected.");
    }

    await this.sock.sendMessage(
      chatId,
      { text },
      quotedMessage ? { quoted: quotedMessage } : undefined,
    );

    console.log(
      `WhatsApp message sent → ${chatId}${
        replyToMessageKey ? ` (reply to ${replyToMessageKey})` : ""
      }`,
    );
  }
}
