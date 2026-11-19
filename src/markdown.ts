// Reconhecimento mínimo de Markdown, compartilhado por vault.ts e chunk.ts.

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

/**
 * Acompanha se a linha corrente está dentro de um bloco de código cercado.
 * Uma cerca só fecha com o mesmo caractere e pelo menos o mesmo comprimento.
 */
export class FenceTracker {
  private open: string | undefined;

  /** Consome uma linha; devolve true se ela pertence a um bloco de código (cercas incluídas). */
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

/** Interpreta uma linha como heading ATX (`# Título`). Não sabe de cercas: quem chama sabe. */
export function parseHeading(line: string): Heading | undefined {
  const match = HEADING.exec(line);
  if (!match) return undefined;
  const text = (match[2] ?? "").replace(/(?:^|[ \t]+)#+$/, "").trim();
  return { level: match[1]!.length, text };
}
