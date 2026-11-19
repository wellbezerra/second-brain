// Pure decisions for the Claude Code guard hook. Returns a reason to block, or null.
// The Bash analysis is a best-effort heuristic; the file-tool checks are exact.

import { posix, win32 } from 'node:path';
import { isEnvFile } from '../../scripts/hooks/rules.ts';

export type Context = {
  repoRoot: string;
  cwd: string;
  vault: string | undefined;
  tempDir: string;
  home: string;
  branch: string;
  platform: NodeJS.Platform;
};

const pathApi = (ctx: Context) => (ctx.platform === 'win32' ? win32 : posix);

/** `/c/Users/x` (Git Bash) → `C:\Users\x` on Windows; unchanged elsewhere. */
function nativePath(path: string, ctx: Context): string {
  const expanded = path.replace(/^~(?=$|[\\/])/, ctx.home);
  if (ctx.platform !== 'win32') return expanded;
  const msys = /^\/([a-zA-Z])(\/.*)?$/.exec(expanded);
  return msys ? `${msys[1]?.toUpperCase()}:${msys[2] ?? '\\'}` : expanded;
}

export function isInside(child: string, parent: string, ctx: Context): boolean {
  const api = pathApi(ctx);
  const fold = (p: string) => (ctx.platform === 'win32' ? p.toLowerCase() : p);
  const rel = api.relative(fold(api.resolve(parent)), fold(api.resolve(ctx.cwd, child)));
  return rel === '' || (!rel.startsWith('..') && !api.isAbsolute(rel));
}

export function checkWrite(target: string, ctx: Context): string | null {
  const path = pathApi(ctx).resolve(ctx.cwd, nativePath(target, ctx));
  if (ctx.vault && isInside(path, nativePath(ctx.vault, ctx), ctx)) {
    return `${target} is inside the vault (SECOND_BRAIN_VAULT). The vault is the user's personal data and is never written to.`;
  }
  if (!isInside(path, ctx.repoRoot, ctx)) {
    return `${target} is outside the repository. Writes are allowed only inside ${ctx.repoRoot}.`;
  }
  if (isEnvFile(path.replaceAll('\\', '/')))
    return `${target} is a .env file; those are off limits.`;
  return null;
}

const VAULT_VAR = /\$\{?SECOND_BRAIN_VAULT\}?|%SECOND_BRAIN_VAULT%|\$env:SECOND_BRAIN_VAULT/gi;
const SEGMENT_SPLIT = /&&|\|\||[;|\n]/;
const TOKEN = /"([^"]*)"|'([^']*)'|(\S+)/g;
const ALL_ARGS = new Set(['rm', 'rmdir', 'mkdir', 'touch', 'truncate', 'unlink', 'chmod', 'chown']);
const LAST_ARG = new Set(['cp', 'mv', 'ln', 'install', 'rsync', 'scp']);
const PS_WRITE = /^(set-content|add-content|out-file|new-item|remove-item|copy-item|move-item)$/i;

function tokenize(segment: string): string[] {
  return [...segment.matchAll(TOKEN)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

/** Paths a shell segment would write to, as far as a heuristic can tell. */
export function writeTargets(segment: string): string[] {
  const tokens = tokenize(segment.trim());
  const targets: string[] = [];
  tokens.forEach((token, i) => {
    const redirect = /^(?:\d|&)?>>?(.*)$/.exec(token);
    if (redirect) targets.push(redirect[1] || tokens[i + 1] || '');
  });
  const [command = '', ...rest] = tokens.filter((t) => !/^(?:\d|&)?>>?/.test(t));
  const args = rest.filter((t) => !t.startsWith('-'));
  const name = command.replace(/^.*[\\/]/, '').toLowerCase();
  if (ALL_ARGS.has(name)) targets.push(...args);
  if (LAST_ARG.has(name) && args.length > 1) targets.push(args.at(-1) ?? '');
  if (name === 'tee') targets.push(...args);
  if (name === 'sed' && rest.some((t) => /^-i/.test(t))) targets.push(...args.slice(1));
  if (PS_WRITE.test(name)) {
    const pathFlag = rest.findIndex((t) => /^-(path|literalpath|filepath|destination)$/i.test(t));
    targets.push(pathFlag >= 0 ? (rest[pathFlag + 1] ?? '') : (args[0] ?? ''));
  }
  return targets.filter((t) => t !== '' && !/^\$(?!\{?SECOND_BRAIN_VAULT)/i.test(t));
}

/** Heredoc bodies are data (commit messages, file contents), not commands. */
function stripHeredocs(command: string): string {
  return command.replace(/<<-?\s*['"]?(\w+)['"]?([^\n]*)\n[\s\S]*?\n\s*\1(?=\s|$)/g, '$2');
}

/** True when an argument of the segment names a .env file; quoted prose is ignored. */
function touchesEnvFile(segment: string): boolean {
  const tokens = tokenize(segment.trim());
  return tokens.some((token, i) => {
    const prev = tokens[i - 1] ?? '';
    if (/\s/.test(token) || /^-(m|-message)$/.test(prev)) return false;
    return isEnvFile(token.replace(/^[<>]+/, '').replaceAll('\\', '/'));
  });
}

export function checkBash(rawCommand: string, ctx: Context): string | null {
  const command = stripHeredocs(rawCommand);
  if (
    /\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*(?:\s(?:--force(?:-with-lease)?|-f)\b|\s\+\S)/.test(command)
  ) {
    return 'Force pushes are blocked.';
  }
  if (/\bgit\b[^;&|\n]*\b(?:commit|push)\b[^;&|\n]*\s(?:--no-verify|-n)\b/.test(command)) {
    return 'Skipping git hooks (--no-verify) is blocked; the hooks are the enforcement layer.';
  }
  if (/\bgit\b[^;&|\n]*\bcommit\b/.test(command) && ctx.branch === 'main') {
    return 'Committing on main is blocked. Create a branch: git switch -c <type>/<short-name>.';
  }
  if (command.split(SEGMENT_SPLIT).some(touchesEnvFile)) {
    return 'Commands that touch .env files are blocked; secrets never enter the context.';
  }
  const resolved = ctx.vault ? command.replace(VAULT_VAR, ctx.vault) : command;
  for (const segment of resolved.split(SEGMENT_SPLIT)) {
    for (const target of writeTargets(segment)) {
      if (/^\/dev\/null$|^nul$/i.test(target)) continue;
      const path = pathApi(ctx).resolve(ctx.cwd, nativePath(target, ctx));
      if (isInside(path, ctx.tempDir, ctx)) continue;
      const reason = checkWrite(path, ctx);
      if (reason) return reason;
    }
  }
  return null;
}
