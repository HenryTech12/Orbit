import { BaileysGateway } from "./services/baileysGateway.js";
import { processIncomingMessage } from "./services/whatsappService.js";
import { withRetry } from "./utils/retry.js";

const gateway = new BaileysGateway();

gateway.onMessage(async (message) => {
  const reply = await withRetry(() =>
    processIncomingMessage(message, gateway.getOwnJid()),
  );

  if (!reply) {
    return;
  }

  await withRetry(() =>
    gateway.sendMessage(
      message.chatId,
      reply,
      message.messageId,
      message.rawMessage,
    ),
  );
});

async function main() {
  console.log("Sentinel WhatsApp adapter starting...");

  await gateway.start();
}

main().catch((error) => {
  console.error("Adapter error:", error);
  process.exit(1);
});
