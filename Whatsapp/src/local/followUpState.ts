import type { LocalSearchResult } from './localRetriever.js';

export interface LastExchange {
  question: string;
  answer: string;
  evidence: LocalSearchResult[];
  mode: 'grounded' | 'inferred' | 'general' | 'none';
  documentContext?: { fileName: string; text: string }; // last document discussed
  ts: number;
}

const lastByChat = new Map<string, LastExchange>();
const TTL_MS = 20 * 60 * 1000;

export function setLastExchange(chatId: string, ex: LastExchange): void {
  lastByChat.set(chatId, ex);
}

export function getLastExchange(chatId: string): LastExchange | null {
  const ex = lastByChat.get(chatId);
  if (!ex || Date.now() - ex.ts > TTL_MS) return null;
  return ex;
}
