import { describe, expect, it } from 'vitest';
import { type Context, checkBash, checkWrite } from '../../../.claude/hooks/policy.ts';

const posixCtx: Context = {
  repoRoot: '/work/repo',
  cwd: '/work/repo',
  vault: '/home/me/vault',
  tempDir: '/tmp',
  home: '/home/me',
  branch: 'feat/x',
  platform: 'linux',
};

describe('file writes', () => {
  it('allows a write inside the repository', () => {
    expect(checkWrite('/work/repo/src/a.ts', posixCtx)).toBeNull();
    expect(checkWrite('src/a.ts', posixCtx)).toBeNull();
  });

  it('blocks a write outside the repository, including via ../', () => {
    expect(checkWrite('/etc/hosts', posixCtx)).toMatch(/outside the repository/);
    expect(checkWrite('../other/a.ts', posixCtx)).toMatch(/outside the repository/);
  });

  it('blocks a write into the vault and names it', () => {
    expect(checkWrite('/home/me/vault/note.md', posixCtx)).toMatch(/inside the vault/);
  });

  it('blocks writing a .env file even inside the repository', () => {
    expect(checkWrite('/work/repo/.env', posixCtx)).toMatch(/\.env/);
  });

  it('understands Windows paths case-insensitively, including Git Bash spelling', () => {
    const win: Context = {
      ...posixCtx,
      repoRoot: 'C:\\Work\\Repo',
      cwd: 'C:\\Work\\Repo',
      vault: 'D:\\Vault',
      platform: 'win32',
    };
    expect(checkWrite('c:\\work\\repo\\src\\a.ts', win)).toBeNull();
    expect(checkWrite('/c/Work/Repo/src/a.ts', win)).toBeNull();
    expect(checkWrite('/d/Vault/x.md', win)).toMatch(/inside the vault/);
    expect(checkWrite('C:\\Windows\\x', win)).toMatch(/outside the repository/);
  });
});

describe('shell commands', () => {
  it.each([
    'echo hi > /etc/motd',
    'cp README.md /home/me/elsewhere/',
    'rm -rf "$SECOND_BRAIN_VAULT/Journal"',
    'sed -i s/a/b/ ~/notes.txt',
  ])('blocks a write outside the repository: %s', (command) => {
    expect(checkBash(command, posixCtx)).not.toBeNull();
  });

  it.each([
    'echo hi > out.txt',
    'npm test 2>/dev/null',
    'mkdir -p /tmp/scratch && cp a /tmp/scratch/',
    'cat "$SECOND_BRAIN_VAULT/Journal/today.md"',
    'git push -u origin feat/x',
  ])('lets a harmless command through: %s', (command) => {
    expect(checkBash(command, posixCtx)).toBeNull();
  });

  it('blocks a PowerShell write outside the repository on Windows', () => {
    const win: Context = {
      ...posixCtx,
      repoRoot: 'C:\\Work\\Repo',
      cwd: 'C:\\Work\\Repo',
      tempDir: 'C:\\Temp',
      platform: 'win32',
    };
    expect(checkBash('Set-Content -Path C:/outside/x.txt -Value 1', win)).toMatch(/outside/);
    expect(checkBash('Set-Content -Path .\\out.txt -Value 1', win)).toBeNull();
  });

  it('blocks force pushes in every spelling', () => {
    for (const command of [
      'git push --force',
      'git push -f origin feat/x',
      'git push origin +feat/x',
    ]) {
      expect(checkBash(command, posixCtx)).toMatch(/Force pushes/);
    }
  });

  it('blocks a commit on main but not on a feature branch', () => {
    expect(checkBash('git commit -m "x"', { ...posixCtx, branch: 'main' })).toMatch(/main/);
    expect(checkBash('git commit -m "x"', posixCtx)).toBeNull();
  });

  it('blocks skipping the git hooks', () => {
    expect(checkBash('git commit --no-verify -m x', posixCtx)).toMatch(/no-verify/);
  });

  it('blocks reading a .env file from the shell', () => {
    expect(checkBash('cat .env', posixCtx)).toMatch(/\.env/);
    expect(checkBash('cat config/.env.local', posixCtx)).toMatch(/\.env/);
    expect(checkBash('cat src/env.ts', posixCtx)).toBeNull();
  });

  it('does not mistake a commit message that mentions .env files for reading one', () => {
    expect(checkBash('git commit -m "chore: block .env files"', posixCtx)).toBeNull();
    const heredoc =
      "git commit -F - <<'EOF'\nchore: x\n\nBlocks .env files and --force pushes.\nEOF";
    expect(checkBash(heredoc, posixCtx)).toBeNull();
  });
});
