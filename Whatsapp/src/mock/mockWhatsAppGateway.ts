import type { WhatsAppMessage } from "../types/whatsapp.js";
import type { WhatsAppGateway } from "../services/whatsappGateway.js";

export class MockWhatsAppGateway implements WhatsAppGateway {
  private messageHandler:
    | ((message: WhatsAppMessage) => Promise<void>)
    | undefined;
  getOwnJid(): string | undefined {
    return undefined;
  }
  onMessage(handler: (message: WhatsAppMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    console.log("Mock WhatsApp gateway started.");

    const testMessage: WhatsAppMessage = {
      messageId: "mock-message-001",
      chatId: "orbit-demo-group",
      senderId: "user-001",
      senderName: "Demo User",
      text: "@sentinel What is the Milestone 1 deadline?",
      isGroup: true,
      timestamp: Date.now(),
    };

    if (this.messageHandler) {
      await this.messageHandler(testMessage);
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    replyToMessageId?: string,
  ): Promise<void> {
    console.log("\n--- Mock WhatsApp Send ---");
    console.log(`Chat: ${chatId}`);

    if (replyToMessageId) {
      console.log(`Replying to: ${replyToMessageId}`);
    }

    console.log(text);
    console.log("--------------------------\n");
  }
}
