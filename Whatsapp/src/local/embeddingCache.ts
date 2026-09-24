import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EMBEDDING_DIM } from './embedder.js';

const CACHE_DIR = '.cache';
const CACHE_FILE = path.join(CACHE_DIR, 'embeddings.json');
const CACHE_FORMAT_VERSION = 2; // bumped: now stores arrays of chunk vectors

interface CacheEntry {
  id: string;
  vectors: number[][];
}

interface CacheFile {
  version: number;
  model: string;
  dim: number;
  entries: CacheEntry[];
}

export async function loadEmbeddingCache(): Promise<
  Map<string, Float32Array[]>
> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw) as CacheFile;
    if (data.version !== CACHE_FORMAT_VERSION) {
      console.log(
        `[vectors] Cache format mismatch (found v${data.version}, need v${CACHE_FORMAT_VERSION}) — rebuilding.`,
      );
      return new Map();
    }
    if (data.dim !== EMBEDDING_DIM) return new Map();

    const out = new Map<string, Float32Array[]>();
    for (const entry of data.entries) {
      out.set(
        entry.id,
        entry.vectors.map((v) => new Float32Array(v)),
      );
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function saveEmbeddingCache(
  model: string,
  embeddings: Map<string, Float32Array[]>,
): Promise<void> {
  const entries: CacheEntry[] = [...embeddings.entries()].map(([id, vecs]) => ({
    id,
    vectors: vecs.map((v) => Array.from(v)),
  }));

  const data: CacheFile = {
    version: CACHE_FORMAT_VERSION,
    model,
    dim: EMBEDDING_DIM,
    entries,
  };

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(data), 'utf8');
    console.log(`Saved embedding cache: ${entries.length} messages.`);
  } catch (error) {
    console.warn('Could not save embedding cache:', (error as Error).message);
  }
}
