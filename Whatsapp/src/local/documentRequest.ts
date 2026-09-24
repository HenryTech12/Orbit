// ─────────────────────────────────────────────────────────────
// Classify a message as either:
//   'content' — a question ABOUT a document's contents ("give me
//               details about it", "what does it say", "summarize
//               the pdf") — this must fall through to the normal
//               Q&A path, which already has document text indexed.
//   'send'    — a request to receive the FILE ITSELF ("send me the
//               pdf", "share the guidelines again").
//   null      — not a document-related message at all.
//
// A file-send request MUST mention a document noun (pdf, doc, file,
// brief, guidelines, info pack...). "Send me a DM" or "send me a
// summary" are NOT file requests — those fall through to the LLM,
// which then decides via the DM: yes/no flag whether to deliver the
// answer as a private message.
// ─────────────────────────────────────────────────────────────

export type DocumentIntent = 'send' | 'content';

export interface DocumentRequest {
  intent: DocumentIntent;
  query: string;
  explicitLatest: boolean;
}

const CONTENT_PATTERNS = [
  /\bdetails?\s+about\b/i,
  /\bwhat\s+(does\s+)?(it|this|that|the\s+pdf|the\s+doc(ument)?|the\s+file)\s+(say|contain|include)\b/i,
  /\bwhat'?s?\s+in\s+(it|this|that|the\s+pdf|the\s+doc(ument)?)\b/i,
  /\b(summar(y|ize|ise)|explain|describe)\b.{0,25}\b(it|this|that|pdf|doc(ument)?|file|guidelines?)\b/i,
  /\btell\s+me\s+(about|more\s+about)\b/i,
  /\b(content|contents)\s+of\b/i,
];

const DOC_NOUN =
  /\b(pdf|docx?|document|guidelines?|guidline|brief|info\s*pack|guide|transcript|minutes?|file|attachment)\b/i;

const SEND_VERB =
  /\b(send|share|resend|re-?send|forward|attach|drop|dm|inbox|give|get|pull|bring|show)\b/i;

const UNSUPPORTED_TRANSLATION =
  /\bin\s+(french|spanish|arabic|amharic|swahili|portuguese|german|italian)\b/i;

export function parseDocumentRequest(text: string): DocumentRequest | null {
  const t = text
    .trim()
    .replace(/^@sentinel\b/i, '')
    .trim();
  if (t.length === 0 || t.length > 200) return null;

  // 1. Content questions win outright.
  if (CONTENT_PATTERNS.some((p) => p.test(t))) {
    const query = t
      .replace(
        /^(tell me|what does|what'?s|explain|describe|summarize|summarise)\b/i,
        '',
      )
      .trim();
    return { intent: 'content', query, explicitLatest: false };
  }

  // 2. File-send request — REQUIRES BOTH a send verb AND a doc noun.
  const hasDocNoun = DOC_NOUN.test(t);
  const hasSendVerb = SEND_VERB.test(t);

  if (!hasDocNoun || !hasSendVerb) return null;

  if (UNSUPPORTED_TRANSLATION.test(t)) {
    return {
      intent: 'send',
      query: '__UNSUPPORTED_TRANSLATION__',
      explicitLatest: false,
    };
  }

  const trimmed = t
    .replace(
      /\b(send|share|resend|re-?send|give|forward|pull|bring|show|attach|drop|dm|inbox|get|me|us|my|please|can|could|you|the|a|an|that|this|it|again|back|to|for|of|in|on|privately|private|pdf|doc|docx|document|file|attachment|asap|now)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  const explicitLatest =
    /\b(latest|last|newest|most recent|recent|first|original)\b/i.test(t) ||
    trimmed.length === 0;

  return { intent: 'send', query: trimmed, explicitLatest };
}
