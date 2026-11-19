// Retrieval evals: runs every golden case against the fixture vault with the
// FakeEmbedder and fails check-full when hit rate@5 or MRR drops below the
// thresholds in package.json ("evals"). Never reads SECOND_BRAIN_VAULT: the
// evals always measure the fixture vault.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { FakeEmbedder } from '../../src/embedding/fake.ts';
import {
  type CaseResult,
  fmt,
  gate,
  parseGolden,
  scoreCase,
  summarize,
  type Thresholds,
} from './metrics.ts';
import { type Note, StubRetriever } from './retriever.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const vault = join(root, 'tests', 'fixtures', 'vault');

function loadNotes(dir: string): Note[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return []; // .obsidian and other hidden folders
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return loadNotes(full);
    if (!entry.name.endsWith('.md')) return [];
    return [{ path: relative(vault, full).split(sep).join('/'), text: readFileSync(full, 'utf8') }];
  });
}

function report(results: readonly CaseResult[]): string {
  const summary = summarize(results);
  const lines = [
    `retrieval evals: ${summary.count} cases, hit rate@5 ${fmt(summary.hitRate)}, MRR ${fmt(summary.mrr)}`,
    ...Object.entries(summary.byKind).map(
      ([kind, s]) =>
        `  ${kind.padEnd(9)} ${s.count} cases, hit rate@5 ${fmt(s.hitRate)}, MRR ${fmt(s.mrr)}`,
    ),
  ];
  const misses = results.filter((r) => !r.hit);
  if (misses.length > 0) {
    lines.push('  misses:');
    for (const m of misses) lines.push(`    ${m.id} returned [${m.returned.join(', ')}]`);
  }
  return lines.join('\n');
}

test('retrieval quality stays at or above the thresholds', async () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { evals: Thresholds };
  const cases = parseGolden(readFileSync(join(here, 'golden.jsonl'), 'utf8'));
  const notes = loadNotes(vault);
  const known = new Set(notes.map((n) => n.path));
  for (const c of cases) {
    for (const path of c.expect) {
      expect(known.has(path), `${c.id} expects ${path}, which is not in the fixture vault`).toBe(
        true,
      );
    }
  }

  const retriever = await StubRetriever.build(notes, new FakeEmbedder());
  const results: CaseResult[] = [];
  for (const c of cases) results.push(scoreCase(c, await retriever.search(c.query)));

  const text = report(results);
  console.log(text);
  expect(gate(summarize(results), pkg.evals), text).toEqual([]);
});

test('instruction-shaped notes come back as ordinary results', async () => {
  const cases = parseGolden(readFileSync(join(here, 'golden.jsonl'), 'utf8'));
  const injection = cases.filter((c) => c.injection);
  expect(injection.length).toBeGreaterThanOrEqual(2);

  const retriever = await StubRetriever.build(loadNotes(vault), new FakeEmbedder());
  for (const c of injection) {
    const ranked = await retriever.search(c.query);
    expect(scoreCase(c, ranked).hit, `${c.id}: the injected note must be retrievable`).toBe(true);
  }
});
