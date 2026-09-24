// ─────────────────────────────────────────────────────────────
// Audio service — downloads WhatsApp voice notes and transcribes
// them via Groq Whisper.
// ─────────────────────────────────────────────────────────────

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface TranscribedVoice {
  text: string;
  durationSec?: number;
}

/**
 * Download a WhatsApp voice message and transcribe it via Groq Whisper.
 * Returns null if download or transcription fails.
 */
export async function transcribeVoiceMessage(
  rawMessage: WAMessage,
): Promise<TranscribedVoice | null> {
  const audioMsg = rawMessage.message?.audioMessage;
  if (!audioMsg) return null;

  let buffer: Buffer;
  try {
    const result = await downloadMediaMessage(rawMessage, 'buffer', {});
    buffer = result as Buffer;
  } catch (error) {
    console.warn('Failed to download voice message:', (error as Error).message);
    return null;
  }

  if (!buffer || buffer.length === 0) {
    console.warn('Voice message download returned 0 bytes.');
    return null;
  }

  try {
    // Convert Buffer to a fresh Uint8Array to satisfy the DOM File type.
    const bytes = new Uint8Array(buffer);

    const transcription = await groq.audio.transcriptions.create({
      file: new File([bytes], 'voice.ogg', { type: 'audio/ogg' }),
      model: 'whisper-large-v3-turbo',
      response_format: 'text',
    } as never);

    const text =
      typeof transcription === 'string'
        ? transcription
        : ((transcription as { text?: string }).text ?? '');

    if (!text.trim()) return null;

    return {
      text: text.trim(),
      durationSec: audioMsg.seconds ?? undefined,
    };
  } catch (error) {
    console.warn('Groq transcription failed:', (error as Error).message);
    return null;
  }
}
