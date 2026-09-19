import { readFile } from "node:fs/promises";

import { parseWhatsAppExport } from "../importers/whatsappExportParser.js";
import type { WhatsAppMessage } from "../types/whatsapp.js";

const HISTORY_FILE = "data/chat-orbit-team.txt";

let messages: WhatsAppMessage[] | null = null;

export async function getWhatsAppKnowledge(): Promise<
  WhatsAppMessage[]
> {
  if (messages) {
    return messages;
  }

  const content = await readFile(HISTORY_FILE, "utf8");

  messages = parseWhatsAppExport(
    content,
    "orbit-team-local",
  );

  console.log(
    `Loaded ${messages.length} WhatsApp messages from local history.`,
  );

  return messages;
}