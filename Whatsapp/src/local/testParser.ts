import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parseWhatsAppExport } from '../importers/whatsappExportParser.js';

const content = readFileSync('data/chat(3).txt', 'utf8');
const messages = parseWhatsAppExport(content, 'chat3');

console.log('Total:', messages.length);

// Count by day
const byDay = new Map<string, number>();
for (const m of messages) {
  const day = new Date(m.timestamp).toISOString().slice(0, 10);
  byDay.set(day, (byDay.get(day) ?? 0) + 1);
}

// Sort by date
const sorted = [...byDay.entries()].sort();
console.log('\nMessages per day:');
for (const [day, n] of sorted) {
  console.log(`  ${day}: ${n}`);
}
