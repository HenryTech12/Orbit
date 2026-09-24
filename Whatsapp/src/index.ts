import { BaileysGateway } from './services/baileysGateway.js';
import { processIncomingMessage } from './services/whatsappService.js';
import { withRetry } from './utils/retry.js';

const gateway = new BaileysGateway();

gateway.onMessage(async (message) => {
  const reply = await withRetry(() =>
    processIncomingMessage(message, gateway.getOwnJid()),
  );

  if (!reply) {
    return;
  }

  // Send the text reply (if any) first.
  if (reply.text && reply.text.trim()) {
    await withRetry(() =>
      gateway.sendMessage(
        message.chatId,
        reply.text,
        reply.replyToMessageId ?? message.messageId,
        message.rawMessage,
        reply.mentions,
      ),
    );
  }

  // If a document was requested, send it.
  if (reply.document) {
    await withRetry(() =>
      gateway.sendDocument(
        message.chatId,
        reply.document!.path,
        reply.document!.fileName,
        reply.document!.mimetype,
        undefined,
        message.messageId,
        message.rawMessage,
      ),
    );
  }

  // DM delivery side-channel.
  if (reply.dmTo && reply.dmText) {
    await withRetry(() =>
      gateway.sendMessage(reply.dmTo as string, reply.dmText as string),
    );
  }
});

async function main() {
  console.log('Sentinel WhatsApp adapter starting...');
  await gateway.start();
}

main().catch((error) => {
  console.error('Adapter error:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await gateway.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await gateway.stop();
  process.exit(0);
});
