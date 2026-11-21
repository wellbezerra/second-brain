import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPacket,
  numberDiff,
  packetPath,
  specViolation,
} from '../../scripts/review-packet-format.ts';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -10,3 +10,3 @@ export function a() {',
  ' const keep = 1;',
  '-const old = 2;',
  '+const fresh = 2;',
  ' return keep;',
].join('\n');

describe('review packet', () => {
  it('holds the spec and the diff verbatim, and nothing else', () => {
    const spec = { path: 'docs/specs/01-x.md', text: '# Spec 01\n\n- [ ] it works\n' };
    const packet = buildPacket({ branch: 'feat/x', base: 'main', spec, diff: DIFF });
    expect(packet).toContain('# Spec 01\n\n- [ ] it works');
    for (const line of ['const keep = 1;', '-const old = 2;', '+const fresh = 2;']) {
      expect(packet).toContain(line);
    }
    const headings = packet.split('\n').filter((line) => line.startsWith('## '));
    expect(headings).toEqual(['## Spec — docs/specs/01-x.md', '## Diff — main...feat/x']);
  });

  it('says so when a chore has no spec', () => {
    const packet = buildPacket({ branch: 'chore/x', base: 'main', spec: null, diff: DIFF });
    expect(packet).toContain('No spec');
  });

  it('keeps a diff that contains code fences inside its own fence', () => {
    const diff = `${DIFF}\n+\`\`\`\`\`\n+# not a heading of the packet\n+\`\`\`\`\``;
    const packet = buildPacket({ branch: 'docs/x', base: 'main', spec: null, diff });
    const fence = /^(`{6,})diff$/m.exec(packet)?.[1];
    expect(fence).toBeDefined();
    expect(packet.trimEnd().endsWith(fence as string)).toBe(true);
  });

  it('treats a CRLF diff like an LF one', () => {
    const lf = buildPacket({ branch: 'a/b', base: 'main', spec: null, diff: DIFF });
    const crlf = buildPacket({
      branch: 'a/b',
      base: 'main',
      spec: null,
      diff: DIFF.replaceAll('\n', '\r\n'),
    });
    expect(crlf).toBe(lf);
  });
});

describe('diff line numbers', () => {
  it('labels kept and added lines with their line in the new file', () => {
    const lines = numberDiff(DIFF).split('\n');
    expect(lines).toContain('  10  const keep = 1;');
    expect(lines).toContain('  11 +const fresh = 2;');
    expect(lines).toContain('  12  return keep;');
  });

  it('leaves removed lines without a number, since they are not in the new file', () => {
    expect(numberDiff(DIFF).split('\n')).toContain('     -const old = 2;');
  });
});

describe('packet location and spec path', () => {
  it('writes the packet for a branch under .harness/review/', () => {
    expect(packetPath('/repo', 'feat/hybrid-search')).toBe(
      join('/repo', '.harness', 'review', 'feat', 'hybrid-search.md'),
    );
  });

  it('accepts a spec inside docs/specs/', () => {
    expect(specViolation('/repo', 'docs/specs/06-hybrid-search.md')).toBeNull();
  });

  it('rejects a spec path that leaves docs/specs/', () => {
    expect(specViolation('/repo', 'docs/specs/../../.env')).not.toBeNull();
    expect(specViolation('/repo', 'README.md')).not.toBeNull();
  });
});
