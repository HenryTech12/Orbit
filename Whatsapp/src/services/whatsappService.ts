import { ingestionApi } from '../api/ingestionApi.js';
import {
  addDocumentRecord,
  addDocumentKnowledge,
} from '../local/whatsappKnowledgeStore.js';
import { downloadAndExtractDocument } from './mediaService.js';
import { transcribeVoiceMessage } from './audioService.js';
import { handleMessage } from './messageHandler.js';
import type { WhatsAppMessage, WhatsAppReply } from '../types/whatsapp.js';

export async function processIncomingMessage(
  message: WhatsAppMessage,
  sentinelJid?: string,
): Promise<WhatsAppReply | null> {
  try {
    await ingestionApi.ingestMessage(message);

    // ─────────────────────────────────────────────────────────
    // Voice message capture — transcribe first, then treat the
    // transcript as a normal text message so it flows through
    // the same handler (mentions, passive listening, DM, etc.).
    // ─────────────────────────────────────────────────────────
    if (message.messageType === 'audioMessage' && message.rawMessage) {
      const transcribed = await transcribeVoiceMessage(message.rawMessage);

      if (transcribed) {
        console.log(
          `🎤 Transcribed voice note (${transcribed.durationSec ?? '?'}s): "${transcribed.text.slice(0, 80)}${transcribed.text.length > 80 ? '…' : ''}"`,
        );

        // Rewrite as a text message and process normally.
        const asText: WhatsAppMessage = {
          ...message,
          text: transcribed.text,
          messageType: 'conversation',
        };

        const reply = await handleMessage(asText, sentinelJid);
        return reply ?? null;
      }

      // Transcription failed. Reply only if explicitly addressed.
      const isMentioned = /@sentinel\b/i.test(message.text);
      if (!isMentioned && message.isGroup) return null;

      return {
        text: "I couldn't understand that voice message. Try again or type it?",
        replyToMessageId: message.messageId,
      };
    }

    // ─────────────────────────────────────────────────────────
    // Document capture — if this message is a file share, grab
    // the bytes, save them, extract text, and remember the file
    // so it can be recalled later.
    // ─────────────────────────────────────────────────────────
    if (message.documentFileName && message.rawMessage) {
      const doc = await downloadAndExtractDocument(
        message.rawMessage,
        message.messageId,
      );

      if (doc) {
        await addDocumentRecord({
          messageId: message.messageId,
          chatId: message.chatId,
          senderId: message.senderId,
          senderName: message.senderName,
          fileName: doc.fileName,
          mimetype: doc.mimetype,
          size: doc.size,
          filePath: doc.filePath,
          caption: message.text ?? '',
          timestamp: message.timestamp,
        });

        if (doc.text.trim()) {
          addDocumentKnowledge(
            {
              messageId: message.messageId,
              chatId: message.chatId,
              senderId: message.senderId,
              senderName: message.senderName,
              fileName: doc.fileName,
              mimetype: doc.mimetype,
              size: doc.size,
              filePath: doc.filePath,
              caption: message.text ?? '',
              timestamp: message.timestamp,
            },
            doc.text,
          );
        }

        console.log(
          `📄 Captured document ${doc.fileName} (${doc.size} bytes, extracted: ${doc.extractionOk})`,
        );

        const replyText = doc.extractionOk
          ? `📄 Got it — *${doc.fileName}*. Ask me anything about it.`
          : `📄 Saved *${doc.fileName}*. I couldn't read its text, but you can ask me to send it back later.`;

        return {
          text: replyText,
          replyToMessageId: message.messageId,
        };
      }
    }

    const reply = await handleMessage(message, sentinelJid);

    if (!reply) {
      return null;
    }

    return reply;
  } catch (error) {
    console.error('Failed to process WhatsApp message:', error);

    return {
      text: 'Sorry, Sentinel could not process this request right now. Please try again shortly.',
    };
  }
}
