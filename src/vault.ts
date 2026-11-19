import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { FenceTracker, parseHeading } from "./markdown.js";

export interface Note {
  /** Caminho relativo à raiz do vault, sempre com `/`. */
  path: string;
  title: string;
  frontmatter: Record<string, string>;
  /** Texto sem o frontmatter, com quebras de linha normalizadas para `\n`. */
  body: string;
}

export interface ScanResult {
  files: string[];
  warnings: string[];
}

/**
 * Lista as notas `.md` do vault, relativas à raiz e em ordem estável.
 * Pula pastas excluídas, itens ocultos e links simbólicos; o que não dá para
 * ler vira aviso.
 */
export function scanVault(root: string, excludes: readonly string[]): ScanResult {
  const excluded = new Set(excludes.map((e) => e.replace(/\\/g, "/").replace(/\/+$/, "")));
  const files: string[] = [];
  const warnings: string[] = [];

  const walk = (dir: string, rel: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      warnings.push(`Não consegui ler ${dir}: ${(error as Error).message}`);
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      const relPath = rel === "" ? name : `${rel}/${name}`;
      if (name.startsWith(".") || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (excluded.has(name) || excluded.has(relPath)) continue;
        walk(join(dir, name), relPath);
      } else if (entry.isFile() && extname(name).toLowerCase() === ".md") {
        files.push(relPath);
      }
    }
  };

  walk(root, "");
  files.sort(compareCodeUnits);
  return { files, warnings };
}

/** Lê uma nota: separa frontmatter e corpo e resolve o título. */
export function readNote(root: string, path: string): Note {
  const raw = readFileSync(join(root, ...path.split("/")), "utf8");
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const { data, body } = parseFrontmatter(text);
  return { path, title: noteTitle(data, body, path), frontmatter: data, body };
}

export interface VaultNotes {
  notes: Note[];
  warnings: string[];
}

/** Varre e lê o vault inteiro. Nota ilegível vira aviso, não interrupção. */
export function readVault(root: string, excludes: readonly string[]): VaultNotes {
  const { files, warnings } = scanVault(root, excludes);
  const notes: Note[] = [];
  for (const file of files) {
    try {
      notes.push(readNote(root, file));
    } catch (error) {
      warnings.push(`Não consegui ler ${file}: ${(error as Error).message}`);
    }
  }
  return { notes, warnings };
}

/**
 * Frontmatter raso: só `chave: valor` de primeiro nível. Listas, blocos
 * aninhados e valores vazios são ignorados. Sem fechamento, tudo é corpo.
 */
export function parseFrontmatter(text: string): {
  data: Record<string, string>;
  body: string;
} {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() !== "---") return { data: {}, body: text };

  const close = lines.findIndex(
    (line, i) => i > 0 && (line.trimEnd() === "---" || line.trimEnd() === "..."),
  );
  if (close === -1) return { data: {}, body: text };

  const data: Record<string, string> = {};
  for (const line of lines.slice(1, close)) {
    const match = /^([A-Za-z0-9_][\w-]*):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!match) continue;
    const value = unquote(match[2]!);
    if (value === "" || /^[[{]/.test(value)) continue;
    data[match[1]!] = value;
  }
  return { data, body: lines.slice(close + 1).join("\n") };
}

function noteTitle(frontmatter: Record<string, string>, body: string, path: string): string {
  const fromFrontmatter = frontmatter.title?.trim();
  if (fromFrontmatter) return fromFrontmatter;

  const fence = new FenceTracker();
  for (const line of body.split("\n")) {
    if (fence.feed(line)) continue;
    const heading = parseHeading(line);
    if (heading?.level === 1 && heading.text !== "") return heading.text;
  }
  const name = basename(path);
  return name.slice(0, name.length - extname(name).length);
}

function unquote(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value);
  return match ? match[2]! : value;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
