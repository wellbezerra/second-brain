import { describe, expect, it } from 'vitest';
import { FAKE_DIMENSION, FakeEmbedder } from '../../../src/embedding/fake.js';

const embedder = new FakeEmbedder();
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);

describe('FakeEmbedder', () => {
  it('gives the same text the same vector every time', async () => {
    const [first] = await embedder.embed(['sourdough starter hydration']);
    const [second] = await embedder.embed(['sourdough starter hydration']);
    expect(first).toEqual(second);
  });

  it('returns one unit-length vector per text, in input order', async () => {
    const vectors = await embedder.embed(['alpha', 'beta gamma', 'delta']);
    expect(vectors).toHaveLength(3);
    for (const vector of vectors) {
      expect(vector).toHaveLength(FAKE_DIMENSION);
      expect(dot(vector, vector)).toBeCloseTo(1, 6);
    }
  });

  it('places texts that share words closer than unrelated ones', async () => {
    const [query, related, unrelated] = await embedder.embed([
      'watering tomato plants',
      'tomato plants need watering every morning',
      'interval training for a 10k race',
    ]);
    expect(dot(query ?? [], related ?? [])).toBeGreaterThan(dot(query ?? [], unrelated ?? []));
  });

  it('ignores case and accents', async () => {
    const [a, b] = await embedder.embed(['Café Crème', 'cafe creme']);
    expect(a).toEqual(b);
  });

  it('returns nothing for no texts', async () => {
    expect(await embedder.embed([])).toEqual([]);
  });
});
