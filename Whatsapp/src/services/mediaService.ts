// ─────────────────────────────────────────────────────────────
// Media service — downloads and extracts text from WhatsApp
// documents (PDF, DOCX) so they can be searched and resent.
// ─────────────────────────────────────────────────────────────

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const DOCS_DIR = 'documents';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ExtractedDocument {
  messageId: string;
  fileName: string;
  mimetype: string;
  size: number;
  filePath: string;
  text: string;
  extractionOk: boolean;
}

function extensionFor(fileName: string, mimetype: string): string {
  const fromName = path.extname(fileName).replace('.', '').toLowerCase();
  if (fromName) return fromName;
  if (mimetype === 'application/pdf') return 'pdf';
  if (
    mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  return 'bin';
}

export function isSupportedDocument(
  fileName: string,
  mimetype: string,
): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return true;
  if (lower.endsWith('.docx')) return true;
  if (mimetype === 'application/pdf') return true;
  if (
    mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true;
  }
  return false;
}

export function isTooLarge(size: number): boolean {
  return size > MAX_BYTES;
}

/**
 * Download a document message, save it to disk, and extract its text.
 * Returns null on download failure or unsupported file.
 */
export async function downloadAndExtractDocument(
  rawMessage: WAMessage,
  messageId: string,
): Promise<ExtractedDocument | null> {
  const docMessage =
    rawMessage.message?.documentMessage ??
    rawMessage.message?.documentWithCaptionMessage?.message?.documentMessage;

  if (!docMessage) return null;

  const fileName = docMessage.fileName ?? `document-${messageId}`;
  const mimetype = docMessage.mimetype ?? 'application/octet-stream';
  const size = Number(docMessage.fileLength ?? 0);

  if (!isSupportedDocument(fileName, mimetype)) return null;
  if (isTooLarge(size)) return null;

  let buffer: Buffer;
  try {
    const result = await downloadMediaMessage(rawMessage, 'buffer', {});
    buffer = result as Buffer;
  } catch (error) {
    console.warn(
      `Failed to download document ${fileName}:`,
      (error as Error).message,
    );
    return null;
  }

  if (!buffer || buffer.length === 0) return null;

  const ext = extensionFor(fileName, mimetype);
  await mkdir(DOCS_DIR, { recursive: true });
  const filePath = path.join(DOCS_DIR, `${messageId}.${ext}`);

  try {
    await writeFile(filePath, buffer);
  } catch (error) {
    console.warn(
      `Failed to save document ${fileName}:`,
      (error as Error).message,
    );
    return null;
  }

  let text = '';
  let extractionOk = false;

  try {
    if (ext === 'pdf') {
      const parsed = await pdf(buffer);
      text = parsed.text ?? '';
      extractionOk = text.trim().length > 50;
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value ?? '';
      extractionOk = text.trim().length > 50;
    }
  } catch (error) {
    console.warn(
      `Failed to extract text from ${fileName}:`,
      (error as Error).message,
    );
  }

  return {
    messageId,
    fileName,
    mimetype,
    size: buffer.length,
    filePath,
    text,
    extractionOk,
  };
}
