import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MIN_CHARS,
  OVERLAP_CHARS,
  TARGET_CHARS,
  chunkNote,
  embeddingText,
} from "../src/chunk.js";
import { readNote } from "../src/vault.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/vault", import.meta.url));
const fixture = (path: string) => chunkNote(readNote(FIXTURE, path));

const words = (text: string) => text.match(/[\p{L}\p{N}]+/gu) ?? [];

describe("constantes", () => {
  it("seguem a spec 02", () => {
    expect([TARGET_CHARS, OVERLAP_CHARS, MIN_CHARS]).toEqual([1200, 150, 60]);
  });
});

describe("chunkNote com o vault de exemplo", () => {
  it("nota sem heading gera um trecho com o título como heading", () => {
    const chunks = fixture("simples.md");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBe("simples");
    expect(chunks[0]!.text).toMatch(/^Uma nota simples/);
  });

  it("headings aninhados produzem o caminho completo", () => {
    const chunks = fixture("Projetos/Alfa/arquitetura.md");
    expect(chunks.map((c) => c.heading)).toEqual([
      "Projeto Alfa",
      "Projeto Alfa > Arquitetura",
      "Projeto Alfa > Arquitetura > Decisões > Qdrant",
      "Projeto Alfa > Arquitetura > Riscos",
    ]);
    expect(chunks[2]!.text).toMatch(/^Rejeitada pelo custo/);
  });

  it("heading # igual ao título não se repete no caminho", () => {
    const chunks = fixture("Diario/2026-11-19.md");
    expect(chunks.map((c) => c.heading)).toEqual([
      "Diário > Vetorização",
      "Diário > Ação",
    ]);
  });

  it("# dentro de bloco de código não quebra a nota", () => {
    const chunks = fixture("codigo.md");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBe("Script de backup");
    expect(chunks[0]!.text).toContain("# copia o vault");
    expect(chunks[0]!.text).toContain("## isto também não é heading");
    expect(chunks[0]!.text).toContain("Depois do bloco de código");
  });

  it("nota vazia ou só com frontmatter gera zero trechos", () => {
    expect(fixture("vazia.md")).toEqual([]);
    expect(fixture("so-frontmatter.md")).toEqual([]);
  });

  it("frontmatter não entra no texto", () => {
    const all = fixture("Projetos/Alfa/arquitetura.md").map((c) => c.text).join("\n");
    expect(all).not.toContain("tags:");
    expect(all).not.toContain("Wellington");
  });

  it("nota longa é repartida por parágrafo, com sobreposição", () => {
    const chunks = fixture("longa.md");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Nota longa");
      expect(chunk.text.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
    for (let i = 1; i < chunks.length; i++) {
      const previousTail = chunks[i - 1]!.text.slice(-40);
      expect(chunks[i]!.text).toContain(previousTail);
    }
    // Paragraphs that fit the target are not cut: every chunk ends at a paragraph end.
    const paragraphEnds = readNote(FIXTURE, "longa.md")
      .body.split("\n\n")
      .map((p) => p.trim().slice(-30));
    for (const chunk of chunks) {
      expect(paragraphEnds).toContain(chunk.text.slice(-30));
    }
  });

  it("acentuação é preservada", () => {
    const text = fixture("Diario/2026-11-19.md")[0]!.text;
    expect(text).toContain("vetorização e indexação");
  });
});

const note = (body: string, title = "Nota") => ({ title, body });

describe("chunkNote", () => {
  it("10.000 caracteres sem parágrafo nem pontuação são repartidos", () => {
    const body = "palavra ".repeat(1250);
    const chunks = chunkNote(note(body));
    expect(chunks.length).toBeGreaterThan(8);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
  });

  it("uma linha de 10.000 caracteres sem espaço também é repartida", () => {
    const chunks = chunkNote(note("x".repeat(10_000)));
    expect(chunks.length).toBeGreaterThan(8);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
  });

  it("parágrafo gigante é repartido por sentença", () => {
    const sentence = "Esta é uma sentença de tamanho médio sobre busca híbrida e fusão de rankings.";
    const chunks = chunkNote(note(Array(40).fill(sentence).join(" ")));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.text.trimEnd()).toMatch(/\.$/);
    }
  });

  it("pula níveis vazios no caminho de headings", () => {
    const body = "# Topo\n\n### Fundo\n\n" + "conteúdo suficiente para passar do mínimo de caracteres. ".repeat(2);
    expect(chunkNote(note(body)).map((c) => c.heading)).toEqual(["Nota > Topo > Fundo"]);
  });

  it("heading irmão substitui o anterior e limpa os mais profundos", () => {
    const filler = " texto que ocupa espaço suficiente para não ser descartado como ruído.";
    const body = `# A\n\n## B\n\n### C\n\nem C${filler}\n\n## D\n\nem D${filler}`;
    expect(chunkNote(note(body)).map((c) => c.heading)).toEqual([
      "Nota > A > B > C",
      "Nota > A > D",
    ]);
  });

  it("~~~ também abre bloco de código, e só fecha com a mesma cerca", () => {
    const body =
      "~~~\n# não\n```\n# ainda não\nlinha de código dentro do bloco cercado por til\n~~~\n\n# Sim\n\n" + "texto da seção depois do bloco, longo o bastante. ".repeat(2);
    const headings = chunkNote(note(body)).map((c) => c.heading);
    expect(headings).toEqual(["Nota", "Nota > Sim"]);
  });

  it("descarta trechos curtos, mas nota curta continua buscável", () => {
    const filler = "texto que ocupa espaço suficiente para não ser descartado como ruído.";
    const mixed = chunkNote(note(`# Longa\n\n${filler}\n\n# Curta\n\nVer também.`));
    expect(mixed.map((c) => c.heading)).toEqual(["Nota > Longa"]);

    const short = chunkNote(note("Só isto."));
    expect(short).toHaveLength(1);
    expect(short[0]!.text).toBe("Só isto.");
  });

  it("numera os trechos em ordem", () => {
    expect(fixture("longa.md").map((c) => c.ordinal)).toEqual(
      fixture("longa.md").map((_, i) => i),
    );
  });
});

describe("embeddingText", () => {
  it("é heading, linha em branco, texto", () => {
    expect(embeddingText({ heading: "A > B", text: "corpo", ordinal: 0 })).toBe("A > B\n\ncorpo");
  });
});

describe("propriedades", () => {
  const paragraph = (i: number, size: number) =>
    `Parágrafo ${i}: ` + "conteúdo variado sobre notas, índices e buscas. ".repeat(size).trim();

  const bodies = [
    Array.from({ length: 30 }, (_, i) => paragraph(i, 1 + (i % 7))).join("\n\n"),
    "# Um\n\n" + paragraph(1, 40) + "\n\n## Dois\n\n" + paragraph(2, 3) + "\n\n" + paragraph(3, 25),
    "```js\n" + "const x = 1; // # não é heading\n".repeat(60) + "```\n\n" + paragraph(4, 10),
    "palavra ".repeat(3000),
  ];

  it.each(bodies.map((b, i) => [i, b] as const))(
    "corpo %i: o conteúdo significativo é recuperado",
    (_, body) => {
      const chunks = chunkNote(note(body));
      const covered = new Set(chunks.flatMap((c) => words(c.text + " " + c.heading)));
      for (const word of words(body)) expect(covered).toContain(word);
    },
  );

  it.each(bodies.map((b, i) => [i, b] as const))(
    "corpo %i: nenhum trecho excede o alvo",
    (_, body) => {
      for (const chunk of chunkNote(note(body))) {
        expect(chunk.text.length).toBeLessThanOrEqual(TARGET_CHARS);
      }
    },
  );

  it.each(bodies.map((b, i) => [i, b] as const))(
    "corpo %i: a quebra é determinística",
    (_, body) => {
      expect(chunkNote(note(body))).toEqual(chunkNote(note(body)));
    },
  );
});
