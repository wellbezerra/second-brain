// Pure scoring for the retrieval evals: no disk, no network, so unit tests can import it.

export const CASE_KINDS = ['typical', 'edge', 'no-answer'] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

export interface GoldenCase {
  id: string;
  kind: CaseKind;
  query: string;
  /** Vault-relative note paths; any one of them in the top k is a hit. Empty for no-answer. */
  expect: string[];
  /** The expected note contains instruction-shaped text; it must come back as plain data. */
  injection?: boolean;
}

export interface CaseResult {
  id: string;
  kind: CaseKind;
  hit: boolean;
  reciprocalRank: number;
  returned: string[];
}

export interface Score {
  count: number;
  hitRate: number;
  mrr: number;
}

export interface Summary extends Score {
  byKind: Record<CaseKind, Score>;
}

export interface Thresholds {
  hitRateAt5: number;
  mrr: number;
}

/**
 * Parses golden.jsonl. Blank lines are skipped; any malformed line throws with
 * its line number, so a broken case is never silently dropped.
 */
export function parseGolden(text: string): GoldenCase[] {
  const cases: GoldenCase[] = [];
  const ids = new Set<string>();
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;
    const where = `golden.jsonl line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`${where}: not valid JSON`);
    }
    const c = value as Partial<GoldenCase>;
    if (typeof c.id !== 'string' || c.id === '') throw new Error(`${where}: missing id`);
    if (ids.has(c.id)) throw new Error(`${where}: duplicate id ${c.id}`);
    if (!CASE_KINDS.includes(c.kind as CaseKind)) throw new Error(`${where}: unknown kind`);
    if (typeof c.query !== 'string') throw new Error(`${where}: missing query`);
    if (!Array.isArray(c.expect) || !c.expect.every((p) => typeof p === 'string')) {
      throw new Error(`${where}: expect must be a list of paths`);
    }
    if ((c.kind === 'no-answer') !== (c.expect.length === 0)) {
      throw new Error(`${where}: only no-answer cases have an empty expect list`);
    }
    ids.add(c.id);
    cases.push(c as GoldenCase);
  });
  return cases;
}

/**
 * Scores one case against the ranked note paths the retriever returned.
 * Answerable: a hit when an expected note is in the top k; RR is 1/rank of the first one.
 * No-answer: a hit (and RR 1) only when the retriever returned nothing.
 */
export function scoreCase(golden: GoldenCase, ranked: readonly string[], k = 5): CaseResult {
  const returned = ranked.slice(0, k);
  if (golden.kind === 'no-answer') {
    const hit = ranked.length === 0;
    return { id: golden.id, kind: golden.kind, hit, reciprocalRank: hit ? 1 : 0, returned };
  }
  const index = ranked.findIndex((path) => golden.expect.includes(path));
  const reciprocalRank = index === -1 ? 0 : 1 / (index + 1);
  return {
    id: golden.id,
    kind: golden.kind,
    hit: index !== -1 && index < k,
    reciprocalRank,
    returned,
  };
}

export function summarize(results: readonly CaseResult[]): Summary {
  const byKind = Object.fromEntries(
    CASE_KINDS.map((kind) => [kind, score(results.filter((r) => r.kind === kind))]),
  ) as Record<CaseKind, Score>;
  return { ...score(results), byKind };
}

/** Returns one message per metric below its threshold; empty means the gate passes. */
export function gate(summary: Score, thresholds: Thresholds): string[] {
  const failures: string[] = [];
  if (summary.hitRate < thresholds.hitRateAt5) {
    failures.push(`hit rate@5 ${fmt(summary.hitRate)} is below ${fmt(thresholds.hitRateAt5)}`);
  }
  if (summary.mrr < thresholds.mrr) {
    failures.push(`MRR ${fmt(summary.mrr)} is below ${fmt(thresholds.mrr)}`);
  }
  return failures;
}

export function fmt(value: number): string {
  return value.toFixed(3);
}

function score(results: readonly CaseResult[]): Score {
  const count = results.length;
  if (count === 0) return { count, hitRate: 0, mrr: 0 };
  const hits = results.filter((r) => r.hit).length;
  const rr = results.reduce((sum, r) => sum + r.reciprocalRank, 0);
  return { count, hitRate: hits / count, mrr: rr / count };
}
