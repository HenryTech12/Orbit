// ─────────────────────────────────────────────────────────────
// Embedder — turns text into a 768-dim vector via Ollama.
//
// Runs locally on the same machine (or the same VPS) as the bot.
// No API keys, no rate limits, no external dependency.
//
// Model: nomic-embed-text (768 dims, ~275 MB on disk).
// ─────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'nomic-embed-text';

export const EMBEDDING_DIM = 768;

/** Embed a single piece of text. Throws if Ollama is unreachable. */
export async function embed(text: string): Promise<Float32Array> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama embedding failed (${res.status}): ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { embedding: number[] };
  if (!data.embedding || data.embedding.length === 0) {
    throw new Error('Ollama returned an empty embedding.');
  }

  return new Float32Array(data.embedding);
}

/** Check whether Ollama is up and the model is loaded. */
export async function isOllamaReady(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return Boolean(data.models?.some((m) => m.name.startsWith(EMBED_MODEL)));
  } catch {
    return false;
  }
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Sentence-aware chunker for embeddings.
 *
 * Splits text into chunks at sentence boundaries, targeting ~500 chars.
 * Merges tiny trailing fragments into the previous chunk.
 *
 * Used ONLY for embedding — the original message text is what gets
 * stored and shown. Chunking gives us focused vectors for long
 * messages (like the OFFICIAL hackathon brief) that would otherwise
 * have a broad, meaningless centroid embedding.
 */
export function chunkForEmbedding(
  text: string,
  targetSize = 500,
  minSize = 200,
): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= targetSize) return [clean];

  // Split on sentence boundaries (. ! ? followed by space + capital or digit)
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    // If adding this sentence would overflow, close the current chunk.
    if (current && current.length + sentence.length + 1 > targetSize) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  // Merge any chunk under minSize into its neighbor.
  if (chunks.length >= 2) {
    const merged: string[] = [];
    for (const chunk of chunks) {
      const last = merged[merged.length - 1];
      if (last && chunk.length < minSize) {
        merged[merged.length - 1] = `${last} ${chunk}`;
      } else if (last && last.length < minSize) {
        merged[merged.length - 1] = `${last} ${chunk}`;
      } else {
        merged.push(chunk);
      }
    }
    return merged;
  }

  return chunks;
}
