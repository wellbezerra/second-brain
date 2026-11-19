// A stand-in for the real hybrid search (spec 06), kept in memory so the evals
// have something to measure before the SQLite index exists. It follows the
// spec's shape: chunk by heading, BM25 (heading weighted 2x) + vectors, fused by
// RRF with k = 60. When `brain search` lands, the eval runner calls it instead.
//
// Note text is data. Nothing here interprets it beyond tokenising it.

import type { Embedder } from '../../src/embedding/embedder.ts';

export interface Note {
  path: string;
  text: string;
}

interface Chunk {
  path: string;
  heading: string;
  tokens: string[];
  vector: number[];
}

const RRF_K = 60;
const PER_ENGINE = 15;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const STOPWORDS = new Set(
  (
    'a an and are as at be by can do does did for from had has have how i in is it its ' +
    'me my of on or our so than that the their them then there these this to was we ' +
    'were what when where which who why will with you your about into not no'
  ).split(' '),
);

export function tokenize(text: string): string[] {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return (folded.match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOPWORDS.has(t));
}

/** Splits a note by heading; each chunk keeps its heading path, front matter is dropped. */
export function chunkNote(note: Note): { heading: string; body: string }[] {
  const text = note.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const chunks: { heading: string; body: string }[] = [];
  const path: string[] = [];
  let body: string[] = [];
  let inFence = false;
  const flush = () => {
    const joined = body.join('\n').trim();
    if (joined !== '') chunks.push({ heading: path.join(' > '), body: joined });
    body = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('```')) inFence = !inFence;
    const match = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (match?.[1] && match[2] !== undefined) {
      flush();
      path.length = match[1].length - 1;
      path.push(match[2].trim());
    } else {
      body.push(line);
    }
  }
  flush();
  return chunks;
}

export class StubRetriever {
  private readonly chunks: Chunk[];
  private readonly embedder: Embedder;
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  private constructor(chunks: Chunk[], embedder: Embedder) {
    this.chunks = chunks;
    this.embedder = embedder;
    for (const chunk of chunks) {
      for (const token of new Set(chunk.tokens)) this.df.set(token, (this.df.get(token) ?? 0) + 1);
    }
    const total = chunks.reduce((sum, c) => sum + c.tokens.length, 0);
    this.avgLength = chunks.length === 0 ? 0 : total / chunks.length;
  }

  static async build(notes: readonly Note[], embedder: Embedder): Promise<StubRetriever> {
    const parts = notes.flatMap((note) =>
      chunkNote(note).map((c) => ({ path: note.path, heading: c.heading, body: c.body })),
    );
    const vectors = await embedder.embed(parts.map((p) => `${p.heading}\n${p.body}`));
    const chunks = parts.map((p, i) => ({
      path: p.path,
      heading: p.heading,
      // A hit on the heading path counts twice, as in spec 06.
      tokens: [...tokenize(p.heading), ...tokenize(p.heading), ...tokenize(p.body)],
      vector: vectors[i] ?? [],
    }));
    return new StubRetriever(chunks, embedder);
  }

  /**
   * Returns note paths, best first, one entry per note. An empty list means
   * "no answer": no query term occurs anywhere in the vault.
   */
  async search(query: string, limit = 10): Promise<string[]> {
    const terms = [...new Set(tokenize(query))];
    const keyword = this.bm25(terms);
    if (keyword.length === 0) return [];
    const [queryVector = []] = await this.embedder.embed([terms.join(' ')]);
    const semantic = this.chunks
      .map((chunk, index) => ({ index, score: dot(chunk.vector, queryVector) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, PER_ENGINE)
      .map((r) => r.index);

    const fused = new Map<number, number>();
    for (const list of [keyword, semantic]) {
      list.forEach((index, rank) => {
        fused.set(index, (fused.get(index) ?? 0) + 1 / (RRF_K + rank + 1));
      });
    }
    const ranked = [...fused.entries()]
      .sort((a, b) => b[1] - a[1] || cmp(this.chunks[a[0]]?.path, this.chunks[b[0]]?.path))
      .map(([index]) => this.chunks[index]?.path ?? '');
    return [...new Set(ranked)].slice(0, limit);
  }

  private bm25(terms: readonly string[]): number[] {
    const n = this.chunks.length;
    const scored: { index: number; score: number }[] = [];
    this.chunks.forEach((chunk, index) => {
      let score = 0;
      for (const term of terms) {
        const tf = chunk.tokens.filter((t) => t === term).length;
        if (tf === 0) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const norm = 1 - BM25_B + (BM25_B * chunk.tokens.length) / (this.avgLength || 1);
        score += (idf * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
      }
      if (score > 0) scored.push({ index, score });
    });
    return scored
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, PER_ENGINE)
      .map((r) => r.index);
  }
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function cmp(a = '', b = ''): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
