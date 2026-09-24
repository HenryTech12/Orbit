// ─────────────────────────────────────────────────────────────
// Document registry — find a stored document by fuzzy name match
// so we can send it back when someone asks, or point content
// questions at the right stored file.
//
// Key changes vs. the previous version:
//   - Deduplicates records by filename (keeps the newest copy),
//     so the same PDF re-shared twice never appears twice in
//     "Other matches" or gets cited under two different senders.
//   - Returns a DocumentLookup { match, ambiguous } instead of a
//     single guess: when the top two candidates are close in
//     score, we surface the ambiguity instead of silently picking
//     one (this is what caused the wrong-file-with-fake-source bug).
//   - Sorting is fully deterministic (stable tie-break on
//     timestamp), so the same query always returns the same
//     result — no more flip-flopping on identical input.
// ─────────────────────────────────────────────────────────────

import {
  loadDocumentRecords,
  type DocumentRecord,
} from './whatsappKnowledgeStore.js';

export interface DocumentMatch {
  record: DocumentRecord;
  score: number;
}

export interface DocumentLookup {
  /** Best match, or null if nothing scored above threshold. */
  match: DocumentMatch | null;
  /** Near-tied alternatives to the best match. Non-empty means "ask, don't guess". */
  ambiguous: DocumentRecord[];
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'and',
  'or',
  'give',
  'send',
  'share',
  'need',
  'want',
  'me',
  'my',
  'this',
  'that',
  'please',
  'can',
  'could',
  'you',
  'again',
  'back',
  'pdf',
  'doc',
  'document',
  'file',
  'attachment',
  'resend',
  'get',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function overlapScore(queryTokens: string[], docText: string): number {
  const doc = docText.toLowerCase();
  let score = 0;

  for (const tok of queryTokens) {
    if (doc.includes(tok)) score += 1;
  }

  return score;
}

/**
 * Collapse duplicate uploads of the same file (same filename, re-shared
 * more than once) down to a single record — the most recently shared copy.
 * Without this, the same PDF can appear twice in "Other matches" and,
 * worse, get cited under whichever sender happened to upload the OLDER copy.
 */
function dedupeRecords(records: DocumentRecord[]): DocumentRecord[] {
  const byName = new Map<string, DocumentRecord>();

  for (const record of records) {
    const key = record.fileName.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || record.timestamp > existing.timestamp) {
      byName.set(key, record);
    }
  }

  return [...byName.values()];
}

function scoreRecord(
  record: DocumentRecord,
  query: string,
  queryTokens: string[],
): number {
  const haystack = `${record.fileName} ${record.caption ?? ''}`;
  let score = overlapScore(queryTokens, haystack);

  // Exact filename substring gets a big bonus.
  const qLower = query.toLowerCase();
  const fLower = record.fileName.toLowerCase();
  if (fLower.includes(qLower)) score += 10;

  // Filename tokens overlap with query tokens = strong signal.
  const fileTokens = tokenize(record.fileName.replace(/\.[a-z0-9]+$/i, ''));
  const fileOverlap = fileTokens.filter((t) =>
    queryTokens.some((q) => q.includes(t) || t.includes(q)),
  ).length;
  score += fileOverlap * 3;

  // Small, bounded recency nudge — must never be able to flip a real
  // content match, only break ties between otherwise-equal candidates.
  score += Math.min(record.timestamp / 1e13, 0.5);

  return score;
}

/**
 * Find the best matching document for a natural-language query.
 *
 * Returns { match: null, ambiguous: [] } when nothing scores above
 * threshold — callers must treat this as "I don't have that file",
 * never fall back to an unrelated link found elsewhere.
 *
 * Returns a non-empty `ambiguous` list when the top two candidates
 * are close enough that guessing would be unsafe — callers should
 * ask the user to pick, not silently return the top one.
 */
export async function findDocument(query: string): Promise<DocumentLookup> {
  const records = dedupeRecords(await loadDocumentRecords());
  if (records.length === 0) return { match: null, ambiguous: [] };

  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    // No meaningful tokens — treat as "the latest document".
    const newest = [...records].sort(
      (a, b) =>
        b.timestamp - a.timestamp || a.fileName.localeCompare(b.fileName),
    )[0];
    return { match: { record: newest, score: 0 }, ambiguous: [] };
  }

  const scored: DocumentMatch[] = records.map((record) => ({
    record,
    score: scoreRecord(record, query, queryTokens),
  }));

  // Deterministic sort: score first, then newest, then filename — so the
  // same query always returns the same result, every single time.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.record.timestamp - a.record.timestamp ||
      a.record.fileName.localeCompare(b.record.fileName),
  );

  const best = scored[0];
  if (best.score < 1) return { match: null, ambiguous: [] };

  // If the runner-up is close in score, don't guess: surface it as
  // ambiguous so the caller can ask the user to disambiguate instead
  // of silently returning a possibly-wrong file with false confidence.
  const runnerUp = scored[1];
  const tooClose =
    runnerUp && best.score > 0 && runnerUp.score / best.score >= 0.85;

  return {
    match: best,
    ambiguous: tooClose
      ? scored
          .slice(1, 3)
          .filter(
            (s) =>
              s.record.fileName.toLowerCase() !==
              best.record.fileName.toLowerCase(),
          )
          .map((s) => s.record)
      : [],
  };
}

/**
 * Return up to N alternative matches (excluding the best), for
 * disambiguation messages. Kept for compatibility with any caller
 * that wants alternatives separately from findDocument's own
 * `ambiguous` field (e.g. "no, I meant a different one" follow-ups).
 */
export async function findAlternatives(
  query: string,
  excludeFileName: string,
  limit = 2,
): Promise<DocumentRecord[]> {
  const records = dedupeRecords(await loadDocumentRecords());
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const excludeKey = excludeFileName.trim().toLowerCase();

  return records
    .filter((r) => r.fileName.trim().toLowerCase() !== excludeKey)
    .map((record) => ({
      record,
      score: overlapScore(
        queryTokens,
        `${record.fileName} ${record.caption ?? ''}`,
      ),
    }))
    .filter((x) => x.score >= 1)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.record.timestamp - a.record.timestamp ||
        a.record.fileName.localeCompare(b.record.fileName),
    )
    .slice(0, limit)
    .map((x) => x.record);
}
