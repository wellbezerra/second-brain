// Quebra de nota em trechos guiada por headings (ADR 008).
// As constantes não são configuração: mudá-las invalida a comparação entre índices.
import { FenceTracker, parseHeading } from "./markdown.js";

export const TARGET_CHARS = 1200;
export const OVERLAP_CHARS = 150;
export const MIN_CHARS = 60;

export interface Chunk {
  /** Caminho `título > h1 > h2 > ...`. */
  heading: string;
  text: string;
  /** Posição do trecho na nota, a partir de 0. */
  ordinal: number;
}

/** Texto enviado ao modelo de embedding. */
export function embeddingText(chunk: Chunk): string {
  return `${chunk.heading}\n\n${chunk.text}`;
}

export function chunkNote(note: { title: string; body: string }): Chunk[] {
  const raw: { heading: string; text: string }[] = [];
  for (const section of splitSections(note.title, note.body)) {
    for (const text of splitSection(section.lines)) {
      raw.push({ heading: section.heading, text });
    }
  }
  // Trecho curto é ruído — a menos que a nota inteira seja curta.
  const kept = raw.filter((c) => c.text.length >= MIN_CHARS);
  return (kept.length > 0 ? kept : raw).map((c, ordinal) => ({ ...c, ordinal }));
}

interface Line {
  text: string;
  code: boolean;
}

interface Section {
  heading: string;
  lines: Line[];
}

function splitSections(title: string, body: string): Section[] {
  const sections: Section[] = [];
  const stack: string[] = [];
  let lines: Line[] = [];
  const fence = new FenceTracker();

  const flush = () => {
    if (lines.some((l) => l.text.trim() !== "")) {
      sections.push({ heading: headingPath(title, stack), lines });
    }
    lines = [];
  };

  for (const text of body.split("\n")) {
    const code = fence.feed(text);
    const heading = code ? undefined : parseHeading(text);
    if (heading) {
      flush();
      stack.length = heading.level;
      stack[heading.level - 1] = heading.text;
      continue;
    }
    lines.push({ text, code });
  }
  flush();
  return sections;
}

function headingPath(title: string, stack: readonly (string | undefined)[]): string {
  const levels = stack.filter((h): h is string => h !== undefined && h !== "");
  if (levels[0] === title) levels.shift();
  return [title, ...levels].join(" > ");
}

/** Um pedaço indivisível já repartido, com o separador que o liga ao anterior. */
interface Piece {
  text: string;
  sep: string;
}

function splitSection(lines: Line[]): string[] {
  const whole = trimBlock(lines.map((l) => l.text).join("\n"));
  if (whole.length <= TARGET_CHARS) return [whole];

  const pieces: Piece[] = [];
  for (const paragraph of paragraphs(lines)) {
    // Sentença só quando o parágrafo sozinho estoura o alvo; código nunca.
    const parts: Piece[] =
      paragraph.code || paragraph.text.length <= TARGET_CHARS
        ? [{ text: paragraph.text, sep: "\n" }]
        : sentences(paragraph.text);
    let first = true;
    for (const part of parts) {
      for (const piece of hardSplit(part.text)) {
        pieces.push({ text: piece.text, sep: first ? "\n\n" : piece.sep || part.sep });
        first = false;
      }
    }
  }
  return pack(pieces);
}

/** Parágrafos separados por linha em branco; um bloco de código é um parágrafo só. */
function paragraphs(lines: Line[]): { text: string; code: boolean }[] {
  const out: { text: string; code: boolean }[] = [];
  let current: Line[] = [];
  const flush = () => {
    const text = trimBlock(current.map((l) => l.text).join("\n"));
    if (text !== "") out.push({ text, code: current.some((l) => l.code) });
    current = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prev = lines[i - 1];
    // Entrar ou sair de um bloco de código também fecha o parágrafo.
    if (prev && prev.code !== line.code && current.length > 0) flush();
    if (!line.code && line.text.trim() === "") flush();
    else current.push(line);
  }
  flush();
  return out;
}

/** Sentenças de um parágrafo, cada uma com o separador que a precede. */
function sentences(text: string): Piece[] {
  const parts = text.split(/(?<=[.!?…]["')\]]*)(\s+)/);
  const out: Piece[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i]!;
    if (sentence === "") continue;
    const ws = parts[i - 1] ?? "";
    out.push({ text: sentence, sep: ws.includes("\n") ? "\n" : " " });
  }
  return out;
}

/** Último recurso: corta no espaço (de preferência quebra de linha) mais próximo do alvo. */
function hardSplit(text: string): Piece[] {
  const out: Piece[] = [];
  let rest = text;
  let sep = "";
  while (rest.length > TARGET_CHARS) {
    const window = rest.slice(0, TARGET_CHARS + 1);
    let cut = window.lastIndexOf("\n");
    if (cut < TARGET_CHARS / 2) cut = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\t"));
    if (cut < TARGET_CHARS / 2) {
      out.push({ text: rest.slice(0, TARGET_CHARS), sep });
      rest = rest.slice(TARGET_CHARS);
      sep = "";
    } else {
      out.push({ text: rest.slice(0, cut), sep });
      sep = rest[cut]!;
      rest = rest.slice(cut + 1);
    }
  }
  if (rest !== "") out.push({ text: rest, sep });
  return out;
}

/** Junta pedaços em trechos de até TARGET_CHARS, cada um começando com a cauda do anterior. */
function pack(pieces: Piece[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current === "") {
      current = piece.text;
    } else if (current.length + piece.sep.length + piece.text.length <= TARGET_CHARS) {
      current += piece.sep + piece.text;
    } else {
      chunks.push(current);
      const room = TARGET_CHARS - piece.text.length - piece.sep.length;
      const tail = overlapTail(current, Math.min(OVERLAP_CHARS, room));
      current = tail === "" ? piece.text : tail + piece.sep + piece.text;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

/** Até `size` caracteres do fim de `text`, começando no início de uma palavra. */
function overlapTail(text: string, size: number): string {
  if (size <= 0) return "";
  if (text.length <= size) return text;
  const slice = text.slice(-size);
  if (/\s/.test(text[text.length - size - 1]!)) return slice.trimStart();
  const space = slice.search(/\s/);
  return space === -1 ? "" : slice.slice(space).trimStart();
}

function trimBlock(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, "").trimEnd();
}
