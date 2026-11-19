import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../src/config.js";
import { parseFrontmatter, readNote, readVault, scanVault } from "../src/vault.js";
import { tempDir } from "./helpers.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/vault", import.meta.url));
const EXCLUDES = DEFAULTS.excludes;

describe("scanVault", () => {
  it("devolve caminhos relativos, com /, em ordem estável", () => {
    const { files, warnings } = scanVault(FIXTURE, EXCLUDES);
    expect(files).toEqual([
      "Diario/2026-11-19.md",
      "Projetos/Alfa/arquitetura.md",
      "codigo.md",
      "longa.md",
      "sem-frontmatter.md",
      "simples.md",
      "so-frontmatter.md",
      "vazia.md",
    ]);
    expect(warnings).toEqual([]);
    expect(scanVault(FIXTURE, EXCLUDES).files).toEqual(files);
  });

  it("nunca entra em .obsidian, .brain, .git, pastas excluídas ou ocultas", () => {
    const root = tempDir();
    for (const dir of [".obsidian", ".brain", ".git", ".oculta", "node_modules", "a/node_modules"]) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "nota.md"), "não deveria aparecer");
    }
    writeFileSync(join(root, ".oculto.md"), "oculto");
    writeFileSync(join(root, "a", "visivel.md"), "visível");
    writeFileSync(join(root, "a", "imagem.png"), "");
    writeFileSync(join(root, "MAIUSCULA.MD"), "extensão em maiúscula");

    expect(scanVault(root, EXCLUDES).files).toEqual(["MAIUSCULA.MD", "a/visivel.md"]);
  });

  it("respeita exclusões configuradas", () => {
    const root = tempDir();
    mkdirSync(join(root, "Arquivo"));
    writeFileSync(join(root, "Arquivo", "velha.md"), "velha");
    writeFileSync(join(root, "nova.md"), "nova");
    expect(scanVault(root, [...EXCLUDES, "Arquivo"]).files).toEqual(["nova.md"]);
  });

  it("ignora links para pastas", () => {
    const root = tempDir();
    mkdirSync(join(root, "real"));
    writeFileSync(join(root, "real", "nota.md"), "nota");
    // "junction" no Windows não exige permissão; nos outros sistemas é ignorado.
    symlinkSync(join(root, "real"), join(root, "atalho"), "junction");
    expect(scanVault(root, EXCLUDES).files).toEqual(["real/nota.md"]);
  });

  it("ignora links para arquivos", (ctx) => {
    const root = tempDir();
    writeFileSync(join(root, "nota.md"), "nota");
    try {
      symlinkSync(join(root, "nota.md"), join(root, "link.md"), "file");
    } catch {
      ctx.skip(); // Windows sem modo desenvolvedor não cria link de arquivo
    }
    expect(scanVault(root, EXCLUDES).files).toEqual(["nota.md"]);
  });

  it("raiz inexistente vira aviso, não exceção", () => {
    const { files, warnings } = scanVault(join(tempDir(), "nao-existe"), EXCLUDES);
    expect(files).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe("parseFrontmatter", () => {
  it("lê pares chave: valor de primeiro nível e tira aspas", () => {
    const { data, body } = parseFrontmatter(
      '---\ntitle: "Meu título"\nautor: Ana\ntags:\n  - a\n  - b\naninhado:\n  chave: valor\n---\nCorpo',
    );
    expect(data).toEqual({ title: "Meu título", autor: "Ana" });
    expect(body).toBe("Corpo");
  });

  it("sem delimitador de fechamento, o arquivo inteiro é corpo", () => {
    const text = "---\ntitle: X\nsem fechamento";
    expect(parseFrontmatter(text)).toEqual({ data: {}, body: text });
  });

  it("sem frontmatter, devolve o texto como corpo", () => {
    expect(parseFrontmatter("# Oi\n---\nfim")).toEqual({ data: {}, body: "# Oi\n---\nfim" });
  });
});

describe("readNote", () => {
  it("título vem do frontmatter, que fica fora do corpo", () => {
    const note = readNote(FIXTURE, "Projetos/Alfa/arquitetura.md");
    expect(note.path).toBe("Projetos/Alfa/arquitetura.md");
    expect(note.title).toBe("Projeto Alfa");
    expect(note.body).not.toContain("tags:");
    expect(note.body.startsWith("\nIntrodução")).toBe(true);
  });

  it("título vem do primeiro # quando não há frontmatter", () => {
    expect(readNote(FIXTURE, "sem-frontmatter.md").title).toBe("Reunião de planejamento");
  });

  it("título cai no nome do arquivo", () => {
    expect(readNote(FIXTURE, "simples.md").title).toBe("simples");
  });

  it("# dentro de bloco de código não vira título", () => {
    const root = tempDir();
    writeFileSync(join(root, "n.md"), "```\n# comentário\n```\n\ntexto");
    expect(readNote(root, "n.md").title).toBe("n");
  });

  it("normaliza CRLF e remove BOM", () => {
    const root = tempDir();
    writeFileSync(join(root, "w.md"), "﻿---\r\ntitle: Windows\r\n---\r\nlinha 1\r\nlinha 2\r\n");
    const note = readNote(root, "w.md");
    expect(note.title).toBe("Windows");
    expect(note.body).toBe("linha 1\nlinha 2\n");
  });
});

describe("readVault", () => {
  it("lê todas as notas do vault", () => {
    const { notes, warnings } = readVault(FIXTURE, EXCLUDES);
    expect(notes.map((n) => n.path)).toEqual(scanVault(FIXTURE, EXCLUDES).files);
    expect(warnings).toEqual([]);
  });
});
