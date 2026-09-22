import { readFile } from 'node:fs/promises';

import { ingestionApi } from '../api/ingestionApi.js';
import { parseWhatsAppExport } from '../importers/whatsappExportParser.js';

export async function importWhatsAppHistory(
  filePath: string,
  chatId?: string,
): Promise<number> {
  const content = await readFile(filePath, 'utf8');

  const messages = parseWhatsAppExport(
    content,
    chatId,
  );

  if (messages.length === 0) {
    throw new Error(
      'No WhatsApp messages were found in the exported file.',
    );
  }

  await ingestionApi.ingestMessages(messages);

  return messages.length;
}