import { ingestionApi } from "../api/ingestionApi.js";
import type { WhatsAppMessage } from "../types/whatsapp.js";
import { handleMessage } from "./messageHandler.js";

export async function processIncomingMessage(
  message: WhatsAppMessage,
  sentinelJid?: string,
): Promise<string | null> {
  try {
    await ingestionApi.ingestMessage(message);

    const reply = await handleMessage(message, sentinelJid);

    if (!reply) {
      return null;
    }

    return reply.text;
  } catch (error) {
    console.error("Failed to process WhatsApp message:", error);

    return "Sorry, Sentinel could not process this request right now. Please try again shortly.";
  }
}
