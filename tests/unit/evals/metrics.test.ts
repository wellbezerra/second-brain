import { describe, expect, it } from 'vitest';
import { type GoldenCase, gate, parseGolden, scoreCase, summarize } from '../../evals/metrics.ts';

const answerable: GoldenCase = { id: 'a', kind: 'typical', query: 'q', expect: ['x.md', 'y.md'] };
const noAnswer: GoldenCase = { id: 'n', kind: 'no-answer', query: 'q', expect: [] };

describe('scoreCase', () => {
  it('counts a hit at the rank of the first expected note', () => {
    expect(scoreCase(answerable, ['z.md', 'y.md'])).toMatchObject({
      hit: true,
      reciprocalRank: 0.5,
    });
  });

  it('misses when the expected note is below the top k', () => {
    const ranked = ['1', '2', '3', '4', '5', 'x.md'];
    expect(scoreCase(answerable, ranked)).toMatchObject({ hit: false, reciprocalRank: 1 / 6 });
  });

  it('misses with zero reciprocal rank when nothing expected comes back', () => {
    expect(scoreCase(answerable, [])).toMatchObject({ hit: false, reciprocalRank: 0 });
  });

  it('rewards a no-answer case only when nothing is returned', () => {
    expect(scoreCase(noAnswer, [])).toMatchObject({ hit: true, reciprocalRank: 1 });
    expect(scoreCase(noAnswer, ['x.md'])).toMatchObject({ hit: false, reciprocalRank: 0 });
  });
});

describe('summarize and gate', () => {
  const results = [
    scoreCase(answerable, ['x.md']),
    scoreCase(answerable, ['z.md', 'x.md']),
    scoreCase(noAnswer, ['x.md']),
  ];

  it('averages hit rate and MRR overall and per kind', () => {
    const summary = summarize(results);
    expect(summary.hitRate).toBeCloseTo(2 / 3);
    expect(summary.mrr).toBeCloseTo(0.5);
    expect(summary.byKind.typical).toMatchObject({ count: 2, hitRate: 1, mrr: 0.75 });
    expect(summary.byKind.edge.count).toBe(0);
  });

  it('fails the gate for each metric below its threshold', () => {
    const summary = summarize(results);
    expect(gate(summary, { hitRateAt5: 0.6, mrr: 0.5 })).toEqual([]);
    expect(gate(summary, { hitRateAt5: 0.9, mrr: 0.9 })).toHaveLength(2);
  });
});

describe('parseGolden', () => {
  it('reads one case per line and skips blank lines', () => {
    const text = '{"id":"a","kind":"typical","query":"q","expect":["x.md"]}\n\n';
    expect(parseGolden(text)).toHaveLength(1);
  });

  it.each([
    ['broken JSON', '{"id":', /line 1: not valid JSON/],
    ['an unknown kind', '{"id":"a","kind":"odd","query":"q","expect":[]}', /unknown kind/],
    [
      'an answerable case with nothing expected',
      '{"id":"a","kind":"edge","query":"q","expect":[]}',
      /empty expect/,
    ],
    [
      'a no-answer case with an expectation',
      '{"id":"a","kind":"no-answer","query":"q","expect":["x.md"]}',
      /empty expect/,
    ],
  ])('rejects %s', (_name, line, message) => {
    expect(() => parseGolden(line)).toThrow(message);
  });

  it('rejects duplicate ids with the line number', () => {
    const line = '{"id":"a","kind":"typical","query":"q","expect":["x.md"]}';
    expect(() => parseGolden(`${line}\n${line}`)).toThrow(/line 2: duplicate id a/);
  });
});
