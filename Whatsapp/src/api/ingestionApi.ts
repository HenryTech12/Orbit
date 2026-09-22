import "dotenv/config";

import type { WhatsAppMessage } from "../types/whatsapp.js";

const USE_MOCK = process.env.WHATSAPP_USE_MOCK === "true";
const API_BASE_URL =
  process.env.SENTINEL_API_BASE_URL || "http://localhost:8000/api/v1";

export const ingestionApi = {
  async ingestMessage(message: WhatsAppMessage): Promise<void> {
    if (USE_MOCK) {
      console.log("\n--- Mock WhatsApp Ingestion ---");
      console.log(JSON.stringify(message, null, 2));
      console.log("-------------------------------\n");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/ingestion/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(
        `WhatsApp ingestion error: ${response.status} ${response.statusText}`,
      );
    }
  },
  
  async ingestMessages(
  messages: WhatsAppMessage[],
): Promise<void> {
  if (USE_MOCK) {
    console.log('\n--- Mock WhatsApp History Ingestion ---');
    console.log(`Messages: ${messages.length}`);
    console.log(JSON.stringify(messages, null, 2));
    console.log('----------------------------------------\n');
    return;
  }

  const response = await fetch(
    `${API_BASE_URL}/ingestion/whatsapp/batch`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `WhatsApp history ingestion error: ${response.status} ${response.statusText}`,
    );
  }
},
};
