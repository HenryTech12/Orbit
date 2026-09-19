import type { WhatsAppMessage } from "../types/whatsapp.js";
import { getWhatsAppKnowledge } from "./whatsappKnowledgeStore.js";

export interface LocalSearchResult {
  message: WhatsAppMessage;
  score: number;
}

export async function searchLocalKnowledge(
  question: string,
  limit = 8,
): Promise<LocalSearchResult[]> {
  const messages = await getWhatsAppKnowledge();

  const query = normalize(question);
  const terms = extractSearchTerms(query);
  const intentTerms = getIntentTerms(query);
  const dateTerms = extractDateTerms(query);

  const results = messages
    .map((message) => {
      const text = normalize(message.text);

      let score = 0;

      // Exact question phrase.
      if (query.length >= 8 && text.includes(query)) {
        score += 10;
      }

      // Normal query terms.
      for (const term of terms) {
        if (text.includes(term)) {
          score += 1;
        }
      }

      // Intent terms.
      for (const term of intentTerms) {
        if (text.includes(term)) {
          score += 4;
        }
      }

      // Date-specific evidence.
      for (const dateTerm of dateTerms) {
        if (text.includes(dateTerm)) {
          score += 10;
        }
      }

      // Multiple matching terms indicate stronger relevance.
      const matchedTerms = terms.filter((term) => text.includes(term)).length;

      if (matchedTerms >= 2) {
        score += 3;
      }

      return {
        message,
        score,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.message.timestamp - a.message.timestamp;
    })
    .slice(0, limit);

  return results;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchTerms(query: string): string[] {
  const stopWords = new Set([
    "what",
    "when",
    "where",
    "who",
    "which",
    "why",
    "how",
    "is",
    "are",
    "was",
    "were",
    "the",
    "a",
    "an",
    "our",
    "in",
    "on",
    "of",
    "to",
    "for",
    "and",
    "or",
    "did",
    "do",
    "does",
    "we",
    "i",
    "me",
    "my",
    "this",
    "that",
    "it",
    "have",
    "has",
    "had",
    "be",
    "with",
    "from",
  ]);

  return [
    ...new Set(
      query
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !stopWords.has(term)),
    ),
  ];
}

function extractDateTerms(query: string): string[] {
  const terms: string[] = [];

  const monthMap: Record<string, string> = {
    january: "jan",
    february: "feb",
    march: "mar",
    april: "apr",
    may: "may",
    june: "jun",
    july: "jul",
    august: "aug",
    september: "sept",
    october: "oct",
    november: "nov",
    december: "dec",
  };

  for (const [fullMonth, shortMonth] of Object.entries(monthMap)) {
    const match = query.match(
      new RegExp(`\\b${fullMonth}\\s+(\\d{1,2})\\b`, "i"),
    );

    if (match) {
      const day = match[1];

      terms.push(`${fullMonth} ${day}`);
      terms.push(`${shortMonth} ${day}`);
    }
  }

  const shortMonthMatch = query.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sept|oct|nov|dec)\s+(\d{1,2})\b/i,
  );

  if (shortMonthMatch) {
    terms.push(`${shortMonthMatch[1]} ${shortMonthMatch[2]}`);
  }

  const numericDateMatch = query.match(
    /\b(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?\b/,
  );

  if (numericDateMatch) {
    terms.push(`${numericDateMatch[1]}/${numericDateMatch[2]}`);
  }

  return [...new Set(terms)];
}

function getIntentTerms(query: string): string[] {
  if (query.includes("milestone") || query.includes("milestone deadline")) {
    return ["milestone", "deadline", "milestone 1", "submission"];
  }

  if (query.includes("hackathon") || query.includes("hackathon deadline")) {
    return ["hackathon", "deadline", "submission", "sept 24", "september 24"];
  }

  if (
    query.includes("what did i miss") ||
    query.includes("catch me up") ||
    query.includes("missed")
  ) {
    return ["decision", "deadline", "action", "task", "update", "meeting"];
  }

  if (query.includes("meeting") || query.includes("meetings")) {
    return ["meeting", "call", "discussion"];
  }

  return [];
}
