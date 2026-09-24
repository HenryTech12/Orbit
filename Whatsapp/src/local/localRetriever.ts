import type { WhatsAppMessage } from '../types/whatsapp.js';
import {
  getWhatsAppKnowledge,
  isMeetingMessage,
  isOfficialMessage,
  knowledgeVersion,
} from './whatsappKnowledgeStore.js';
import { isTrustedAdmin } from './trustedAdmins.js';
import { isBotMessage } from './botFilter.js';
import { detectTimePlan } from './timeQuery.js';
import type { TimePlan } from './timeQuery.js';
import {
  embed,
  isOllamaReady,
  cosineSim,
  chunkForEmbedding,
} from './embedder.js';
import { loadEmbeddingCache, saveEmbeddingCache } from './embeddingCache.js';

export interface LocalSearchResult {
  message: WhatsAppMessage;
  score: number;
  before?: WhatsAppMessage;
  after?: WhatsAppMessage;
}

export interface KnowledgeStats {
  chatCount: number;
  oldestMs?: number;
  newestMs?: number;
}

export interface Retrieval {
  results: LocalSearchResult[];
  plan: TimePlan;
  notes: string[];
  stats: KnowledgeStats;
}

interface Doc {
  message: WhatsAppMessage;
  tokens: Set<string>;
  norm: string;
}

interface Index {
  docs: Doc[];
  vocab: string[];
  vocabSet: Set<string>;
  df: Map<string, number>;
  /**
   * Vector index — contentKey(message) → array of chunk vectors (768-dim each).
   * Keyed by content hash, not messageId, so restarts never miss the cache.
   */
  vectors: Map<string, Float32Array[]>;
}

const DAY = 86_400_000;
const WINDOW_LIMIT = 16;

/**
 * Hybrid weighting: 60% vector, 40% keyword.
 */
const VECTOR_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;

/**
 * Fixed-scale normalization bounds.
 */
const VECTOR_FLOOR = 0.55;
const VECTOR_CEIL = 0.85;
const KEYWORD_SCALE = 6;

export function toMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

/**
 * Content-addressed cache key — stable across restarts even when
 * messageIds change or the filter set shifts. Same sender + same
 * timestamp + same text always produces the same key.
 */
export function contentKey(m: WhatsAppMessage): string {
  const raw = `${m.senderId}|${toMs(m.timestamp)}|${m.text}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  }
  return `c${(h >>> 0).toString(36)}`;
}

const isApproved = (m: WhatsAppMessage): boolean =>
  isOfficialMessage(m) || isMeetingMessage(m);

const STOP = new Set([
  'what',
  'when',
  'where',
  'who',
  'whom',
  'which',
  'why',
  'how',
  'is',
  'are',
  'was',
  'were',
  'the',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'should',
  'will',
  'we',
  'you',
  'your',
  'yours',
  'me',
  'my',
  'our',
  'us',
  'it',
  'its',
  'this',
  'that',
  'there',
  'have',
  'has',
  'had',
  'be',
  'been',
  'with',
  'from',
  'about',
  'tell',
  'give',
  'please',
  'any',
  'some',
  'sentinel',
  'detail',
  'details',
  'also',
  'just',
  'so',
  'if',
  'as',
  'by',
  'am',
  'not',
  'no',
  'yes',
  'today',
  'tomorrow',
  'tonight',
  'yesterday',
  'now',
]);

const GENERIC_WORDS = new Set([
  'summary',
  'summarize',
  'summarise',
  'summarized',
  'everything',
  'anything',
  'something',
  'happened',
  'happening',
  'happen',
  'discussed',
  'discussing',
  'discuss',
  'going',
  'news',
  'new',
  'update',
  'updates',
  'week',
  'weeks',
  'today',
  'tomorrow',
  'tonight',
  'yesterday',
  'recent',
  'recently',
  'lately',
  'miss',
  'missed',
  'catch',
  'recap',
  'highlights',
  'coming',
  'next',
  'upcoming',
  'plan',
  'planned',
  'schedule',
  'scheduled',
  'thing',
  'things',
  'make',
  'show',
  'list',
  'give',
  'tell',
  'being',
  'been',
  'latest',
  'last',
  'past',
  'previous',
  'this',
  'please',
  'whats',
  'group',
  'chat',
  'chats',
  'days',
  'day',
  'morning',
  'afternoon',
  'evening',
  'hours',
  'hour',
  'first',
  'earliest',
  'oldest',
  'message',
  'messages',
  'post',
  'posted',
  'announcement',
  'announcements',
  'newest',
  'most',
  'sent',
]);

const SYNONYMS: Record<string, string[]> = {
  deadline: ['due', 'submit', 'submission', 'close', 'date'],
  submit: ['submission', 'deadline', 'send', 'upload', 'email'],
  submission: ['submit', 'deadline', 'upload'],
  due: ['deadline', 'submit'],
  hackathon: ['challenge', 'competition'],
  prize: ['reward', 'cash', 'award', 'usd'],
  reward: ['prize', 'cash', 'award'],
  meet: ['session', 'call', 'workshop', 'link', 'schedule'],
  session: ['meeting', 'call', 'workshop', 'link', 'schedule'],
  workshop: ['session', 'meeting', 'call'],
  link: ['url', 'join', 'zoom', 'teams'],
  recording: ['record', 'replay', 'video'],
  deploy: ['deployment', 'host', 'announce'],
  rule: ['guideline', 'requirement', 'policy'],
  country: ['nationality', 'member'],
  mit: ['course', 'learn', 'invitation'],
  end: ['finish', 'close', 'until', 'deadline'],
  start: ['begin', 'open'],
  test: [
    'testing',
    'tester',
    'judge',
    'score',
    'scoring',
    'review',
    'evaluate',
  ],
  judge: ['score', 'scoring', 'test', 'evaluate'],
  bot: ['chatbot'],
  wadhwani: ['ignite'],
  ignite: ['wadhwani'],
  running: ['live', 'active', 'operational', 'trial', 'phase'],
  live: ['running', 'active', 'operational'],
  active: ['running', 'live', 'operational', 'confirmed'],
  confirmed: ['active', 'live', 'verified', 'official'],
};

// ── text helpers ─────────────────────────────────────────────

function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && /(ss|sh|ch|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss'))
    w = w.slice(0, -1);

  if (w.length > 5 && w.endsWith('ing')) {
    w = w.slice(0, -3);
    if (/[cv]$/.test(w)) w += 'e';
  } else if (w.length > 4 && w.endsWith('ed')) {
    w = w.slice(0, -2);
    if (/[cv]$/.test(w)) w += 'e';
  }
  return w.replace(/([bdgmnprt])\1$/, '$1');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(stem);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[^\p{L}\p{N}\s/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const MONTHS: Array<[string, string[]]> = [
  ['january', ['jan']],
  ['february', ['feb']],
  ['march', ['mar']],
  ['april', ['apr']],
  ['may', []],
  ['june', ['jun']],
  ['july', ['jul']],
  ['august', ['aug']],
  ['september', ['sept', 'sep']],
  ['october', ['oct']],
  ['november', ['nov']],
  ['december', ['dec']],
];

function extractDateTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const [full, shorts] of MONTHS) {
    const names = [full, ...shorts].join('|');
    const m1 = query.match(new RegExp(`\\b(?:${names})\\s+(\\d{1,2})\\b`));
    const m2 = query.match(
      new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${names})\\b`),
    );
    const day = m1?.[1] ?? m2?.[1];
    if (day) {
      for (const name of [full, ...shorts]) {
        terms.add(`${name} ${day}`);
        terms.add(`${day} ${name}`);
      }
    }
  }
  const numeric = query.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/);
  if (numeric) terms.add(`${numeric[1]}/${numeric[2]}`);
  return [...terms];
}

function densityMultiplier(textLength: number): number {
  const score = 1.5 - Math.log10(Math.max(textLength, 50)) * 0.25;
  return Math.max(0.5, Math.min(1.5, score));
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

function fixedScale(value: number, floor: number, ceil: number): number {
  if (value <= floor) return 0;
  if (value >= ceil) return 1;
  return (value - floor) / (ceil - floor);
}

// ── index ────────────────────────────────────────────────────

let indexPromise: Promise<Index> | null = null;
let indexVersion = -1;

function getIndex(): Promise<Index> {
  if (!indexPromise || indexVersion !== knowledgeVersion()) {
    indexVersion = knowledgeVersion();
    indexPromise = buildIndex().catch((error) => {
      indexPromise = null;
      indexVersion = -1;
      throw error;
    });
  }
  return indexPromise;
}

export function invalidateIndex(): void {
  indexPromise = null;
  indexVersion = -1;
}

/** Add a single message's vectors to the live index without a full rebuild. */
export async function addVectorToIndex(
  message: WhatsAppMessage,
  chunks: Float32Array[],
): Promise<void> {
  if (!indexPromise) return;
  const index = await indexPromise;
  index.vectors.set(contentKey(message), chunks);
}

async function buildIndex(): Promise<Index> {
  const all = await getWhatsAppKnowledge();

  const seenKeys = new Set<string>();
  const usable = all
    .filter(
      (m) => m.text && m.text.trim() && (isApproved(m) || !isBotMessage(m)),
    )
    .filter((m) => {
      const key = `${m.senderId}|${toMs(m.timestamp)}|${m.text}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .sort((a, b) =>
      a.chatId === b.chatId
        ? a.timestamp - b.timestamp
        : a.chatId < b.chatId
          ? -1
          : 1,
    );

  const df = new Map<string, number>();
  const docs: Doc[] = usable.map((message) => {
    const tokens = new Set(tokenize(message.text));
    for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
    return { message, tokens, norm: ` ${normalize(message.text)} ` };
  });

  const vocab = [...df.keys()];
  const vectors = await buildVectors(docs);

  return { docs, vocab, vocabSet: new Set(vocab), df, vectors };
}

async function buildVectors(docs: Doc[]): Promise<Map<string, Float32Array[]>> {
  const ollamaUp = await isOllamaReady();
  if (!ollamaUp) {
    console.warn(
      '[vectors] Ollama not ready — falling back to keyword-only retrieval.',
    );
    return new Map();
  }

  const cache = await loadEmbeddingCache();

  // Remap loaded cache to content-addressed keys. Handles both:
  //  - old cache (keyed by messageId) → matched via messageId lookup
  //  - new cache (keyed by contentKey) → matched directly
  const byContent = new Map<string, Float32Array[]>();
  for (const d of docs) {
    const ck = contentKey(d.message);
    const hit = cache.get(ck) ?? cache.get(d.message.messageId) ?? undefined;
    if (hit && hit.length > 0) {
      byContent.set(ck, hit);
    }
  }

  console.log(
    `[vectors] Content keys matched: ${byContent.size}/${docs.length} (cache had ${cache.size} entries)`,
  );

  const toEmbed: Doc[] = [];
  for (const d of docs) {
    const ck = contentKey(d.message);
    if (!byContent.has(ck)) toEmbed.push(d);
  }

  if (toEmbed.length === 0) {
    console.log(`[vectors] All ${docs.length} from cache.`);
    return byContent;
  }

  console.log(`[vectors] Embedding ${toEmbed.length} new messages...`);
  const start = Date.now();
  let totalChunks = 0;

  for (let i = 0; i < toEmbed.length; i++) {
    const doc = toEmbed[i];
    const chunks = chunkForEmbedding(doc.message.text);
    const chunkVecs: Float32Array[] = [];

    for (const chunk of chunks) {
      try {
        const vec = await embed(chunk);
        chunkVecs.push(vec);
        totalChunks++;
      } catch (error) {
        console.warn(
          `[vectors] Failed to embed chunk of ${doc.message.messageId}:`,
          (error as Error).message,
        );
      }
    }

    if (chunkVecs.length > 0) {
      byContent.set(contentKey(doc.message), chunkVecs);
    }

    if ((i + 1) % 100 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `[vectors] ${i + 1}/${toEmbed.length} (${totalChunks} chunks, ${elapsed}s)`,
      );
    }
  }

  const totalSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[vectors] Done. ${byContent.size} messages, ${totalChunks} new chunks in ${totalSec}s.`,
  );

  await saveEmbeddingCache(
    process.env.EMBED_MODEL ?? 'nomic-embed-text',
    byContent,
  );

  return byContent;
}

// ── keyword search ───────────────────────────────────────────

export function isCatchUpQuery(question: string): boolean {
  return /(what did i miss|what have i missed|catch me up|give me a catch up|what s new)/.test(
    normalize(question),
  );
}

function buildQueryWeights(
  question: string,
  index: Index,
): Map<string, number> {
  const weights = new Map<string, number>();
  const base = [...new Set(tokenize(question))];

  for (const t of base) {
    weights.set(t, 1);

    if (!index.vocabSet.has(t) && t.length >= 5) {
      const max = t.length >= 8 ? 2 : 1;
      let found = 0;
      for (const v of index.vocab) {
        if (withinDistance(t, v, max)) {
          weights.set(v, Math.max(weights.get(v) ?? 0, 0.7));
          if (++found >= 5) break;
        }
      }
    }

    for (const s of SYNONYMS[t] ?? []) {
      const st = stem(s);
      if (!weights.has(st)) weights.set(st, 0.5);
    }
  }
  return weights;
}

function scoreKeyword(question: string, index: Index): Map<number, number> {
  const query = normalize(question);
  const weights = buildQueryWeights(question, index);
  const dateTerms = extractDateTerms(query);
  const out = new Map<number, number>();

  if (weights.size === 0 && dateTerms.length === 0) return out;

  const N = index.docs.length;
  const queryLower = query.toLowerCase();

  // Precompute query-side specificity signals (once, not per-doc).
  const queryAboutBot =
    /\b(sentinel|the bot|our bot|this bot|the chatbot|chatbot)\b/i.test(
      queryLower,
    );
  const queryWeekdays =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const queryHasDay = queryWeekdays.test(queryLower);

  index.docs.forEach((doc, pos) => {
    const m = doc.message;
    let score = 0;
    let strongMatches = 0;

    for (const [term, w] of weights) {
      if (doc.tokens.has(term)) {
        score += w * Math.log(1 + N / (1 + (index.df.get(term) ?? 0)));
        if (w >= 0.7) strongMatches++;
      }
    }

    const dateHit = dateTerms.some((d) => doc.norm.includes(` ${d} `));
    if (strongMatches === 0 && !dateHit) return;

    if (dateHit) score += 6;
    if (query.length >= 8 && doc.norm.includes(query)) score += 6;
    if (strongMatches >= 2) score *= 1.2;

    if (isTrustedAdmin(m.senderId, m.senderName)) score *= 1.2;

    // ── Specificity boost ─────────────────────────────────────
    // When the query is about Sentinel/the bot, messages that name
    // Sentinel or a known bot are far more likely to be the actual
    // answer than generic schedule messages. Same for concrete
    // weekday mentions when a day is being asked about.
    const docLower = m.text.toLowerCase();

    if (queryAboutBot) {
      const docMentionsBot =
        /\b(sentinel|orbit|jymns|uniconnect|nexus|meti_bot|podpal)\b/i.test(
          docLower,
        );
      if (docMentionsBot) score *= 1.8;
    }

    if (queryHasDay && queryWeekdays.test(docLower)) {
      score *= 1.4;
    }

    score *= densityMultiplier(m.text.length);
    out.set(pos, score);
  });

  return out;
}

async function scoreVector(
  question: string,
  index: Index,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (index.vectors.size === 0) return out;

  let queryVec: Float32Array;
  try {
    queryVec = await embed(question);
  } catch (error) {
    console.warn(
      '[vectors] Query embedding failed, skipping vector scoring:',
      (error as Error).message,
    );
    return out;
  }

  index.docs.forEach((doc, pos) => {
    const chunks = index.vectors.get(contentKey(doc.message));
    if (!chunks || chunks.length === 0) return;

    let best = 0;
    for (const vec of chunks) {
      const sim = cosineSim(queryVec, vec);
      if (sim > best) best = sim;
    }

    if (best >= VECTOR_FLOOR) {
      out.set(pos, best);
    }
  });

  return out;
}

export async function searchLocalKnowledge(
  question: string,
  limit = 6,
): Promise<LocalSearchResult[]> {
  const index = await getIndex();

  const keywordScores = scoreKeyword(question, index);
  const vectorScores = await scoreVector(question, index);

  if (keywordScores.size === 0 && vectorScores.size === 0) return [];

  const kwNorm = new Map<number, number>();
  for (const [pos, raw] of keywordScores) {
    kwNorm.set(pos, Math.min(1, raw / KEYWORD_SCALE));
  }

  const vNorm = new Map<number, number>();
  for (const [pos, sim] of vectorScores) {
    vNorm.set(pos, fixedScale(sim, VECTOR_FLOOR, VECTOR_CEIL));
  }

  const allPositions = new Set<number>([...kwNorm.keys(), ...vNorm.keys()]);

  const scored: Array<{ pos: number; score: number }> = [];
  for (const pos of allPositions) {
    const kw = kwNorm.get(pos) ?? 0;
    const v = vNorm.get(pos) ?? 0;
    const score = VECTOR_WEIGHT * v + KEYWORD_WEIGHT * kw;
    if (score <= 0) continue;
    scored.push({ pos, score });
  }

  // Supersession pass.
  for (const older of scored) {
    const oDoc = index.docs[older.pos];
    for (const newer of scored) {
      if (newer === older) continue;
      const nDoc = index.docs[newer.pos];
      if (nDoc.message.chatId !== oDoc.message.chatId) continue;
      if (toMs(nDoc.message.timestamp) <= toMs(oDoc.message.timestamp))
        continue;
      if (tokenOverlapRatio(oDoc.tokens, nDoc.tokens) >= 0.5) {
        older.score *= 0.3;
        break;
      }
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      toMs(index.docs[b.pos].message.timestamp) -
        toMs(index.docs[a.pos].message.timestamp),
  );

  const top = scored.slice(0, limit);

  // Approved-source rescue.
  const topScore = top[0]?.score ?? 0;
  if (topScore > 0) {
    const rescueFloor = topScore * 0.8;
    const approvedNearby = scored
      .filter(
        (s) =>
          isApproved(index.docs[s.pos].message) &&
          s.score >= rescueFloor &&
          !top.some((t) => t.pos === s.pos),
      )
      .slice(0, 2);

    if (approvedNearby.length > 0) {
      top.splice(0, 0, ...approvedNearby);
    }
  }

  const chosen = top.slice(0, limit + 2);

  return chosen.map(({ pos, score }) => {
    const doc = index.docs[pos];
    const near = (other?: Doc): WhatsAppMessage | undefined => {
      if (!other || other.message.chatId !== doc.message.chatId)
        return undefined;
      const close =
        isApproved(doc.message) ||
        Math.abs(toMs(other.message.timestamp) - toMs(doc.message.timestamp)) <=
          30 * 60_000;
      return close ? other.message : undefined;
    };
    return {
      message: doc.message,
      score,
      before: near(index.docs[pos - 1]),
      after: near(index.docs[pos + 1]),
    };
  });
}

// ── time-aware retrieval ─────────────────────────────────────

function isGenericQuestion(question: string): boolean {
  return (
    normalize(question)
      .split(' ')
      .filter((w) => w.length >= 3 && !STOP.has(w) && !GENERIC_WORDS.has(w))
      .length === 0
  );
}

const chatDocs = (index: Index): Doc[] =>
  index.docs.filter((d) => !isApproved(d.message));

function importance(m: WhatsAppMessage): number {
  const rank = isMeetingMessage(m)
    ? 4
    : isTrustedAdmin(m.senderId, m.senderName)
      ? 3
      : 1;
  return rank + Math.min(m.text.length / 300, 2);
}

function pickTop(docs: Doc[], limit: number): LocalSearchResult[] {
  return docs
    .map((d) => ({ message: d.message, score: importance(d.message) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => toMs(a.message.timestamp) - toMs(b.message.timestamp));
}

function windowResults(
  index: Index,
  startMs: number,
  endMs: number,
  limit: number,
): { items: LocalSearchResult[]; total: number } {
  const inWindow = index.docs.filter((d) => {
    if (isOfficialMessage(d.message) || d.message.text.length < 25)
      return false;
    const t = toMs(d.message.timestamp);
    return t >= startMs && t < endMs;
  });
  return { items: pickTop(inWindow, limit), total: inWindow.length };
}

function statsOf(index: Index): KnowledgeStats {
  const chats = chatDocs(index);
  let oldest = Infinity;
  let newest = 0;
  for (const d of chats) {
    const t = toMs(d.message.timestamp);
    if (!(t > 0)) continue;
    if (t < oldest) oldest = t;
    if (t > newest) newest = t;
  }
  if (newest === 0) return { chatCount: chats.length };
  return { chatCount: chats.length, oldestMs: oldest, newestMs: newest };
}

function futureDateTerms(now: Date, days: number): string[] {
  const terms: string[] = [];
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i <= days; i++) {
    const d = new Date(base.getTime() + i * DAY);
    const [full, shorts] = MONTHS[d.getMonth()];
    for (const name of [full, ...shorts]) {
      terms.push(`${d.getDate()} ${name}`, `${name} ${d.getDate()}`);
    }
  }
  return terms;
}

function upcomingResults(
  index: Index,
  now: Date,
  limit: number,
): LocalSearchResult[] {
  const terms = futureDateTerms(now, 10).map((t) => ` ${t} `);
  return index.docs
    .filter((d) => terms.some((t) => d.norm.includes(t)))
    .map((d) => ({
      message: d.message,
      score: importance(d.message) + (isApproved(d.message) ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export async function retrieveForQuestion(
  question: string,
  now: Date = new Date(),
): Promise<Retrieval> {
  const index = await getIndex();
  const plan = detectTimePlan(question, now);
  console.log(
    `[debug] Query: "${question}" | plan.window: ${plan.window ? `${plan.window.label} (${new Date(plan.window.startMs).toISOString()} → ${new Date(plan.window.endMs).toISOString()})` : 'none'} | recap: ${plan.recap}`,
  );
  const stats = statsOf(index);
  const notes: string[] = [];

  const temporal = Boolean(
    plan.window || plan.upcoming || plan.first || plan.latest || plan.recap,
  );
  const generic = temporal && isGenericQuestion(question);

  const merged: LocalSearchResult[] = [];
  const seen = new Set<string>();
  const push = (items: LocalSearchResult[]): void => {
    for (const r of items) {
      if (seen.has(r.message.messageId)) continue;
      seen.add(r.message.messageId);
      merged.push(r);
    }
  };

  if (!generic) push(await searchLocalKnowledge(question, 6));

  if (plan.first) {
    const byChat = new Map<string, Doc[]>();
    for (const d of chatDocs(index)) {
      if (d.message.text.length < 5) continue;
      const list = byChat.get(d.message.chatId) ?? [];
      list.push(d);
      byChat.set(d.message.chatId, list);
    }
    const biggest = [...byChat.values()].sort((a, b) => b.length - a.length)[0];
    if (biggest) {
      push(biggest.slice(0, 4).map((d) => ({ message: d.message, score: 1 })));
      notes.push(
        `These are the earliest messages in the largest chat loaded. The export may not reach the group's true beginning (oldest message loaded: ${stats.oldestMs ? fmtDate(stats.oldestMs) : 'unknown'}).`,
      );
    }
  }

  if (plan.latest) {
    const recent = chatDocs(index)
      .slice()
      .sort((a, b) => toMs(b.message.timestamp) - toMs(a.message.timestamp))
      .slice(0, 4);
    push(recent.reverse().map((d) => ({ message: d.message, score: 1 })));
  }

  if (plan.window) {
    const { items, total } = windowResults(
      index,
      plan.window.startMs,
      plan.window.endMs,
      WINDOW_LIMIT,
    );
    if (items.length > 0) {
      push(items);
      notes.push(
        total > items.length
          ? `Window "${plan.window.label}": showing the ${items.length} most important of ${total} messages.`
          : `Window "${plan.window.label}": all ${total} messages are shown.`,
      );
    } else {
      notes.push(`No messages from ${plan.window.label} are loaded.`);
    }
  }

  if (plan.upcoming) push(upcomingResults(index, now, 8));

  if (merged.length === 0 && generic && stats.newestMs) {
    const { items } = windowResults(
      index,
      stats.newestMs - 2 * DAY,
      stats.newestMs + 1,
      WINDOW_LIMIT,
    );
    push(items);
    notes.push(
      `Nothing matched that period, so these are the latest messages available (up to ${fmtDate(stats.newestMs)}).`,
    );
  }

  return { results: merged.slice(0, 24), plan, notes, stats };
}
