// Talks to a real Ollama. Skipped in CI and whenever Ollama is not reachable,
// so the suite stays green on machines without it.

import { describe, expect, it } from 'vitest';
import { DEFAULT_OLLAMA_URL, OllamaEmbedder } from '../../src/embedding/ollama.js';

const url = process.env.SECOND_BRAIN_OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
const model = process.env.SECOND_BRAIN_MODEL ?? 'bge-m3';

async function ollamaAvailable(): Promise<boolean> {
  if (process.env.CI) return false;
  try {
    const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1_000) });
    const body = (await response.json()) as { models?: Array<{ name: string }> };
    return (body.models ?? []).some((m) => m.name.split(':')[0] === model);
  } catch {
    return false;
  }
}

const available = await ollamaAvailable();

describe.skipIf(!available)(
  `OllamaEmbedder against ${url} (${model})`,
  { timeout: 120_000 },
  () => {
    it('returns one unit-length vector per text from the real model', async () => {
      const vectors = await new OllamaEmbedder(model, url).embed(['first note', 'second note']);
      expect(vectors).toHaveLength(2);
      const norm = Math.sqrt((vectors[0] ?? []).reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('ranks a paraphrase above an unrelated text', async () => {
      const [query, paraphrase, unrelated] = await new OllamaEmbedder(model, url).embed([
        'how often should I water tomatoes',
        'tomato plants need a drink every morning in summer',
        'the quarterly budget has an emergency fund line',
      ]);
      const dot = (a: number[] = [], b: number[] = []) =>
        a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
      expect(dot(query, paraphrase)).toBeGreaterThan(dot(query, unrelated));
    });
  },
);
