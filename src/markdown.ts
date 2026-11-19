// Minimal Markdown recognition, shared by vault.ts and chunk.ts.

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

/**
 * Tracks whether the current line is inside a fenced code block.
 * A fence only closes with the same character and at least the same length.
 */
export class FenceTracker {
  private open: string | undefined;

  /** Consumes a line; returns true if it belongs to a code block (fences included). */
  feed(line: string): boolean {
    const match = FENCE_OPEN.exec(line);
    if (this.open === undefined) {
      if (match) this.open = match[1];
      return match !== null;
    }
    if (match && isClosing(line, this.open)) this.open = undefined;
    return true;
  }

  get inside(): boolean {
    return this.open !== undefined;
  }
}

function isClosing(line: string, open: string): boolean {
  const trimmed = line.trim();
  const char = open[0]!;
  return (
    trimmed.length >= open.length &&
    [...trimmed].every((c) => c === char)
  );
}

export interface Heading {
  level: number;
  text: string;
}

/** Parses a line as an ATX heading (`# Title`). Unaware of fences: the caller handles them. */
export function parseHeading(line: string): Heading | undefined {
  const match = HEADING.exec(line);
  if (!match) return undefined;
  const text = (match[2] ?? "").replace(/(?:^|[ \t]+)#+$/, "").trim();
  return { level: match[1]!.length, text };
}
