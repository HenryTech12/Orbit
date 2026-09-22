import type { WhatsAppMessage } from '../types/whatsapp.js';

const MESSAGE_PATTERN =
  /^\[(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s*([^:]+):\s*(.*)$/;

export function parseWhatsAppExport(
  content: string,
  chatId = 'imported-whatsapp-chat',
): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = [];

  let currentMessage: WhatsAppMessage | null = null;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(MESSAGE_PATTERN);

    if (!match) {
      if (currentMessage && line.trim()) {
        currentMessage.text += `\n${line}`;
      }

      continue;
    }

    const [, date, time, senderName, text] = match;

    const timestamp = parseWhatsAppTimestamp(date, time);

    currentMessage = {
      messageId: crypto.randomUUID(),
      chatId,
      senderId: senderName.trim(),
      senderName: senderName.trim(),
      text,
      isGroup: true,
      timestamp,
    };

    messages.push(currentMessage);
  }

  return messages;
}

function parseWhatsAppTimestamp(
  date: string,
  time: string,
): number {
  const normalizedDate = date.replace(/[.-]/g, '/');

  const timestamp = Date.parse(
    `${normalizedDate} ${time}`,
  );

  return Number.isNaN(timestamp)
    ? Date.now()
    : timestamp;
}