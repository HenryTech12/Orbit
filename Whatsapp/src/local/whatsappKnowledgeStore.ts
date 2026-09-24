import { appendFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import pdf from 'pdf-parse';
import mammoth from 'mammoth';

import { parseWhatsAppExport } from '../importers/whatsappExportParser.js';
import type { WhatsAppMessage } from '../types/whatsapp.js';
import { isBotMessage } from './botFilter.js';

const DATA_DIR = 'data';
const OFFICIAL_DIR = 'official';
const MEETINGS_DIR = 'meetings';
const LIVE_FILE = path.join('live', 'live-messages.jsonl');
const DOCUMENTS_FILE = path.join('documents', 'registry.jsonl');

export const OFFICIAL_SENDER_ID = 'official';
export const MEETING_SENDER_ID = 'meeting';
export const DOCUMENT_SENDER_ID = 'document';

export const isOfficialMessage = (m: WhatsAppMessage): boolean =>
  m.senderId === OFFICIAL_SENDER_ID;
export const isMeetingMessage = (m: WhatsAppMessage): boolean =>
  m.senderId === MEETING_SENDER_ID;
export const isDocumentMessage = (m: WhatsAppMessage): boolean =>
  m.senderId === DOCUMENT_SENDER_ID;

export interface DocumentRecord {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  fileName: string;
  mimetype: string;
  size: number;
  filePath: string;
  caption: string;
  timestamp: number;
}

let loading: Promise<WhatsAppMessage[]> | null = null;
let version = 0;
/** Changes whenever knowledge changes, so the search index and answer cache refresh. */
export const knowledgeVersion = (): number => version;

async function loadAllExports(): Promise<WhatsAppMessage[]> {
  let entries: string[];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return [];
  }
  const txtFiles = entries
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort();

  const seenIds = new Set<string>();
  const all: WhatsAppMessage[] = [];

  for (const file of txtFiles) {
    const content = await readFile(path.join(DATA_DIR, file), 'utf8');
    const chatId = path.basename(file, path.extname(file));

    let parsed: WhatsAppMessage[];
    try {
      parsed = parseWhatsAppExport(content, chatId);
    } catch (error) {
      console.warn(`Skipping ${file}: failed to parse.`, error);
      continue;
    }

    let added = 0;
    for (const msg of parsed) {
      if (seenIds.has(msg.messageId)) continue;
      seenIds.add(msg.messageId);
      all.push(msg);
      added++;
    }
    console.log(
      `Loaded ${added} messages from ${file} (${parsed.length} parsed)`,
    );
  }
  return all;
}

export function chunkText(text: string, size = 700): string[] {
  const pieces = text
    .split(/\r?\n/)
    .flatMap((l) =>
      l.trim().length > size ? l.trim().split(/(?<=[.!?])\s+/) : [l.trim()],
    )
    .filter(Boolean)
    .flatMap((p) =>
      p.length > size
        ? (p.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [p])
        : [p],
    );

  const chunks: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (cur && cur.length + piece.length + 1 > size) {
      chunks.push(cur);
      cur = piece;
    } else {
      cur = cur ? `${cur}\n${piece}` : piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function cleanTranscript(fileName: string, raw: string): string {
  if (!fileName.toLowerCase().endsWith('.vtt')) return raw;
  return raw
    .split(/\r?\n/)
    .filter(
      (l) =>
        l.trim() &&
        !/^WEBVTT/.test(l) &&
        !/-->/.test(l) &&
        !/^\d+$/.test(l.trim()),
    )
    .join('\n');
}

/** Approved text files. Name a file 2026-09-22_wadhwani-session.txt to date it. */
async function loadFolder(
  dir: string,
  senderId: string,
  prefix: string,
): Promise<WhatsAppMessage[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => /\.(txt|vtt)$/i.test(f)).sort();
  } catch {
    return [];
  }

  const out: WhatsAppMessage[] = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const [raw, info] = await Promise.all([
      readFile(fullPath, 'utf8'),
      stat(fullPath),
    ]);
    const base = path.basename(file, path.extname(file));
    const dateMatch = base.match(/^(\d{4}-\d{2}-\d{2})[_\s-]*(.*)$/);
    const when = dateMatch
      ? new Date(`${dateMatch[1]}T12:00:00`).getTime()
      : info.mtimeMs;
    const title =
      (dateMatch ? dateMatch[2] : base).replace(/[_-]+/g, ' ').trim() || base;

    chunkText(cleanTranscript(file, raw)).forEach((chunk, i) => {
      out.push({
        messageId: `${senderId}-${file}-${i}`,
        chatId: `${senderId}:${file}`,
        senderId,
        senderName: `${prefix} — ${title}`,
        text: chunk,
        isGroup: true,
        timestamp: when,
      } as WhatsAppMessage);
    });
  }
  console.log(
    `Loaded ${out.length} ${senderId} chunks from ${files.length} file(s) in ${dir}/`,
  );
  return out;
}

async function loadLive(): Promise<WhatsAppMessage[]> {
  try {
    const raw = await readFile(LIVE_FILE, 'utf8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as WhatsAppMessage];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

/** Load all persisted document records. */
export async function loadDocumentRecords(): Promise<DocumentRecord[]> {
  try {
    const raw = await readFile(DOCUMENTS_FILE, 'utf8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as DocumentRecord];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

/**
 * Load stored documents and re-extract their text so they remain
 * searchable across restarts. Falls back to the caption if extraction
 * fails or the file has been removed from disk.
 */
async function loadDocumentKnowledge(): Promise<WhatsAppMessage[]> {
  const records = await loadDocumentRecords();
  if (records.length === 0) return [];

  const out: WhatsAppMessage[] = [];

  for (const rec of records) {
    let text = rec.caption ?? '';

    try {
      const buffer = await readFile(rec.filePath);
      const ext = path.extname(rec.filePath).toLowerCase();

      if (ext === '.pdf') {
        const parsed = await pdf(buffer);
        const extracted = parsed.text ?? '';
        if (extracted.trim().length > 50) text = extracted;
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ buffer });
        const extracted = result.value ?? '';
        if (extracted.trim().length > 50) text = extracted;
      }
    } catch (error) {
      console.warn(
        `Could not re-extract ${rec.fileName}:`,
        (error as Error).message,
      );
    }

    if (!text.trim()) continue;

    const chunks = chunkText(text, 700);
    chunks.forEach((chunk, i) => {
      out.push({
        messageId: `doc-${rec.messageId}-${i}`,
        chatId: `document:${rec.messageId}`,
        senderId: DOCUMENT_SENDER_ID,
        senderName: `📄 ${rec.fileName}`,
        text: chunk,
        isGroup: true,
        timestamp: rec.timestamp,
      } as WhatsAppMessage);
    });
  }

  console.log(
    `Loaded ${out.length} chunks from ${records.length} document(s).`,
  );
  return out;
}

export function getWhatsAppKnowledge(): Promise<WhatsAppMessage[]> {
  if (!loading) {
    loading = (async () => {
      const [exported, official, meetings, live, docs] = await Promise.all([
        loadAllExports(),
        loadFolder(OFFICIAL_DIR, OFFICIAL_SENDER_ID, 'OFFICIAL'),
        loadFolder(MEETINGS_DIR, MEETING_SENDER_ID, 'MEETING'),
        loadLive(),
        loadDocumentKnowledge(),
      ]);
      const seen = new Set(exported.map((m) => m.messageId));
      const all = [
        ...exported,
        ...official,
        ...meetings,
        ...live.filter((m) => !seen.has(m.messageId)),
        ...docs.filter((m) => !seen.has(m.messageId)),
      ];
      console.log(
        `Total: ${all.length} knowledge items loaded (${live.length} live, ${docs.length} document chunks).`,
      );
      return all;
    })();
  }
  return loading;
}

/**
 * Live-embed a message's text and add the vectors to the in-memory index.
 * Non-fatal — if Ollama is down or the embed call fails, we skip silently
 * and the message stays keyword-searchable.
 */
async function liveEmbed(slim: WhatsAppMessage): Promise<void> {
  try {
    const { embed, isOllamaReady, chunkForEmbedding } =
      await import('./embedder.js');
    const { addVectorToIndex } = await import('./localRetriever.js');

    if (!(await isOllamaReady())) return;

    const chunks = chunkForEmbedding(slim.text);
    const vectors: Float32Array[] = [];
    for (const chunk of chunks) {
      const vec = await embed(chunk);
      vectors.push(vec);
    }

    if (vectors.length > 0) {
      await addVectorToIndex(slim, vectors);
      console.log(
        `[vectors] Live-embedded ${slim.messageId} (${vectors.length} chunk${vectors.length === 1 ? '' : 's'})`,
      );
    }
  } catch (error) {
    console.warn(
      `[vectors] Live embed skipped for ${slim.messageId}:`,
      (error as Error).message,
    );
  }
}

/** Called for every group message the adapter receives, so today's chat becomes searchable. */
export async function addLiveMessage(m: WhatsAppMessage): Promise<boolean> {
  const text = (m.text ?? '').trim();
  if (!m.isGroup || !text) return false;
  if (/@sentinel\b/i.test(text) || /^\/summary\b/i.test(text)) return false;
  if (isBotMessage(m)) return false;

  const list = await getWhatsAppKnowledge();
  if (list.some((x) => x.messageId === m.messageId)) return false;

  const slim = {
    messageId: m.messageId,
    chatId: m.chatId,
    senderId: m.senderId,
    senderName: m.senderName,
    text,
    isGroup: true,
    timestamp: m.timestamp,
  } as WhatsAppMessage;

  list.push(slim);
  version++;

  try {
    await mkdir('live', { recursive: true });
    await appendFile(LIVE_FILE, JSON.stringify(slim) + '\n', 'utf8');
  } catch (error) {
    console.warn('Could not persist live message:', (error as Error).message);
  }

  // Embed immediately so the new message is vector-searchable without restart.
  // Fire-and-forget — we don't await so ingestion isn't delayed.
  void liveEmbed(slim);

  return true;
}

/** Persist a document record so it can be recalled later. */
export async function addDocumentRecord(record: DocumentRecord): Promise<void> {
  try {
    await mkdir('documents', { recursive: true });
    await appendFile(DOCUMENTS_FILE, JSON.stringify(record) + '\n', 'utf8');
  } catch (error) {
    console.warn(
      'Could not persist document record:',
      (error as Error).message,
    );
  }
}

/** Add document chunks to the in-memory knowledge list (for immediate search). */
export function addDocumentKnowledge(
  record: DocumentRecord,
  text: string,
): void {
  if (!text.trim()) return;
  if (!loading) return;

  void loading.then(async (list) => {
    const chunks = chunkText(text, 700);
    const slimMessages: WhatsAppMessage[] = [];

    chunks.forEach((chunk, i) => {
      const msg = {
        messageId: `doc-${record.messageId}-${i}`,
        chatId: `document:${record.messageId}`,
        senderId: DOCUMENT_SENDER_ID,
        senderName: `📄 ${record.fileName}`,
        text: chunk,
        isGroup: true,
        timestamp: record.timestamp,
      } as WhatsAppMessage;
      list.push(msg);
      slimMessages.push(msg);
    });
    version++;

    // Live-embed the new document chunks so they're immediately searchable.
    for (const msg of slimMessages) {
      void liveEmbed(msg);
    }
  });
}
