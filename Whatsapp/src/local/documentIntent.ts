export type DocumentIntent = 'send' | 'content' | null;

export interface DocumentRequest {
  intent: DocumentIntent;
  query: string;
  explicitLatest: boolean;
}

// Content questions FIRST — these must never be classified as "send".
const CONTENT_PATTERNS = [
  /\bdetails?\s+about\b/i,
  /\bwhat\s+(does\s+)?(it|this|that|the\s+pdf|the\s+doc(ument)?|the\s+file)\s+(say|contain|include)\b/i,
  /\bwhat'?s?\s+in\s+(it|this|that|the\s+pdf|the\s+doc(ument)?)\b/i,
  /\b(summar(y|ize|ise)|explain|describe)\b.{0,25}\b(it|this|that|pdf|doc(ument)?|file|guidelines?)\b/i,
  /\btell\s+me\s+(about|more\s+about)\b/i,
  /\b(content|contents)\s+of\b/i,
];

// Requires an explicit doc noun — pronoun alone ("give me it") is NOT enough.
const DOC_NOUN =
  /\b(pdf|docx?|document|guidelines?|guidline|brief|info\s*pack|guide|transcript|minutes?|file)\b/i;

const STRONG_TRANSFER_VERB =
  /\b(send|share|resend|re-?send|forward|attach|drop|dm|inbox)\b/i;
const WEAK_TRANSFER_VERB = /\b(give|get|pull|bring|show)\b/i;

const LANGUAGE_HINT =
  /\b(in\s+(french|spanish|arabic|amharic|swahili|portuguese))\b/i;

export function parseDocumentRequest(text: string): DocumentRequest | null {
  const t = text
    .trim()
    .replace(/^@sentinel\b/i, '')
    .trim();
  if (t.length === 0 || t.length > 200) return null;

  // Content questions take priority, no matter what verbs appear alongside them.
  if (CONTENT_PATTERNS.some((p) => p.test(t))) {
    const query = t
      .replace(
        /^(tell me|what does|what'?s|explain|describe|summarize|summarise)\b/i,
        '',
      )
      .trim();
    return { intent: 'content', query, explicitLatest: false };
  }

  const hasDocNoun = DOC_NOUN.test(t);
  const isSend =
    STRONG_TRANSFER_VERB.test(t) || (WEAK_TRANSFER_VERB.test(t) && hasDocNoun);

  if (!isSend) return null;

  // "in french" etc. is a translation request we don't support — flag it,
  // don't silently hand back an unrelated file as if it satisfied the ask.
  if (LANGUAGE_HINT.test(t)) {
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
