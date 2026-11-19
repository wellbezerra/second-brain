// Thin wrappers over the git and Biome commands the hooks need.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function git(args: string[], input?: string): string {
  const result = spawnSync('git', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

export function gitBuffer(args: string[]): Buffer {
  const result = spawnSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

export const currentBranch = (): string => {
  const result = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
};

export const splitNul = (output: string): string[] => output.split('\0').filter(Boolean);

/** Runs the repository's own Biome; returns the exit status. */
export function biome(args: string[], repoRoot = join(import.meta.dirname, '..', '..')): number {
  const result = spawnSync(biomeCommand(args, repoRoot), {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
  });
  return result.status ?? 1;
}

/** One quoted command line: Windows needs a shell to run biome.cmd. */
export function biomeCommand(args: string[], repoRoot: string): string {
  const bin = join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'biome.cmd' : 'biome',
  );
  return [bin, ...args].map((arg) => `"${arg.replaceAll('"', '')}"`).join(' ');
}
