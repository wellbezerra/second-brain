// Heading-driven splitting of a note into chunks (ADR 008).
// The constants are not configuration: changing them breaks comparison between indexes.
import { FenceTracker, parseHeading } from "./markdown.js";

export const TARGET_CHARS = 1200;
export const OVERLAP_CHARS = 150;
export const MIN_CHARS = 60;

export interface Chunk {
  /** Path `title > h1 > h2 > ...`. */
  heading: string;
  text: string;
  /** Position of the chunk in the note, starting at 0. */
  ordinal: number;
}

/** Text sent to the embedding model. */
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
  // A short chunk is noise, unless the whole note is short.
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

/** An indivisible, already split piece, with the separator that joins it to the previous one. */
interface Piece {
  text: string;
  sep: string;
}

function splitSection(lines: Line[]): string[] {
  const whole = trimBlock(lines.map((l) => l.text).join("\n"));
  if (whole.length <= TARGET_CHARS) return [whole];

  const pieces: Piece[] = [];
  for (const paragraph of paragraphs(lines)) {
    // Split by sentence only when the paragraph alone exceeds the target; never code.
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

/** Paragraphs separated by a blank line; a code block is a single paragraph. */
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
    // Entering or leaving a code block also closes the paragraph.
    if (prev && prev.code !== line.code && current.length > 0) flush();
    if (!line.code && line.text.trim() === "") flush();
    else current.push(line);
  }
  flush();
  return out;
}

/** Sentences of a paragraph, each with the separator that precedes it. */
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

/** Last resort: cut at the whitespace (preferably a line break) closest to the target. */
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

/** Joins pieces into chunks of up to TARGET_CHARS, each starting with the tail of the previous one. */
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

/** Up to `size` characters from the end of `text`, starting at the beginning of a word. */
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
