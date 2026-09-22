import { importWhatsAppHistory } from '../services/whatsappHistoryService.js';

const filePath = process.argv[2];

if (!filePath) {
  console.error(
    'Usage: npm run import:whatsapp -- <path-to-exported-chat.txt>',
  );
  process.exit(1);
}

try {
  const count = await importWhatsAppHistory(filePath);

  console.log(
    `Successfully imported ${count} WhatsApp messages.`,
  );
} catch (error) {
  console.error('WhatsApp history import failed:', error);
  process.exit(1);
}