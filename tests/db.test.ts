import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BrainIndex, IndexError, SCHEMA_VERSION, indexPath } from "../src/db.js";
import type { IndexIdentity } from "../src/db.js";
import { HashEmbedder } from "../src/hash-embedder.js";
import { tempDir } from "./helpers.js";

const embedder = new HashEmbedder();
const IDENTITY: IndexIdentity = { provider: "hash", model: "hash-64", dim: 64 };

/** `null` abre sem identidade (só leitura); omitido, usa a do HashEmbedder. */
function open(identity: IndexIdentity | null = IDENTITY, path = join(tempDir(), ".brain", "index.db")) {
  return { index: BrainIndex.open(path, identity ?? undefined), path };
}

const file = (path: string, hash = `h-${path}`) => ({
  path,
  hash,
  mtime: 1_700_000_000_000,
  size: 100,
  title: path.replace(/\.md$/, ""),
});

const chunks = (...texts: string[]) =>
  texts.map((text, ord) => ({ ord, heading: `Nota > Seção ${ord}`, text }));

async function addNote(index: BrainIndex, path: string, ...texts: string[]) {
  const id = index.upsertFile(file(path));
  index.insertChunks(id, chunks(...texts), await embedder.embed(texts));
  return id;
}

/** O invariante central: os mesmos ids nas três tabelas. */
function expectAligned(index: BrainIndex) {
  const ids = index.chunkIds();
  expect(ids.fts).toEqual(ids.chunks);
  expect(ids.vec).toEqual(ids.chunks);
  const counts = index.counts();
  expect(counts.fts).toBe(counts.chunks);
  expect(counts.vec).toBe(counts.chunks);
}

describe("abertura", () => {
  it("indexPath fica em <vault>/.brain/index.db", () => {
    expect(indexPath("/v")).toBe(join("/v", ".brain", "index.db"));
  });

  it("caminho inexistente cria diretório e arquivo", () => {
    const path = join(tempDir(), "a", "b", "index.db");
    const index = BrainIndex.open(path, IDENTITY);
    index.close();
    expect(existsSync(path)).toBe(true);
  });

  it("liga WAL e chaves estrangeiras", () => {
    const { index } = open();
    expect(index.pragma("journal_mode")).toBe("wal");
    expect(index.pragma("foreign_keys")).toBe(1);
    index.close();
  });

  it("abrir duas vezes não duplica tabela nem perde dado", async () => {
    const { index, path } = open();
    await addNote(index, "a.md", "primeiro texto da nota a");
    index.close();

    const again = BrainIndex.open(path, IDENTITY);
    expect(again.counts()).toEqual({ files: 1, chunks: 1, fts: 1, vec: 1 });
    expect(again.meta("schema_version")).toBe(String(SCHEMA_VERSION));
    again.close();
  });

  it("índice vazio conta zero em tudo", () => {
    const { index } = open();
    expect(index.counts()).toEqual({ files: 0, chunks: 0, fts: 0, vec: 0 });
    index.close();
  });
});

describe("identidade do índice: provedor, modelo e dimensão", () => {
  it("é gravada na primeira abertura com identidade", () => {
    const { index } = open();
    expect(index.identity()).toEqual(IDENTITY);
    index.close();
  });

  it("reabrir com a mesma identidade funciona", () => {
    const { index, path } = open();
    index.close();
    expect(() => BrainIndex.open(path, IDENTITY).close()).not.toThrow();
  });

  it.each([
    ["dimensão", { ...IDENTITY, dim: 128 }],
    ["modelo", { ...IDENTITY, model: "outro" }],
    ["provedor", { ...IDENTITY, provider: "openai" }],
  ])("%s diferente é erro citando --rebuild", (_, other) => {
    const { index, path } = open();
    index.close();
    const error = (() => {
      try {
        BrainIndex.open(path, other).close();
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(IndexError);
    expect((error as IndexError).kind).toBe("identity-mismatch");
    expect((error as Error).message).toContain("brain index --rebuild");
    expect((error as Error).message).toContain("hash");
  });

  it("abrir sem identidade não cria a tabela vetorial, e serve para ler", () => {
    const { index, path } = open(null);
    expect(index.identity()).toBeUndefined();
    expect(index.counts()).toEqual({ files: 0, chunks: 0, fts: 0, vec: 0 });
    index.close();
    // Depois, a primeira indexação define a identidade.
    const later = BrainIndex.open(path, IDENTITY);
    expect(later.identity()).toEqual(IDENTITY);
    later.close();
  });

  it("sem identidade, inserir trechos é erro", async () => {
    const { index } = open(null);
    const id = index.upsertFile(file("a.md"));
    expect(() => index.insertChunks(id, chunks("x"), [[1]])).toThrow(IndexError);
    index.close();
  });

  it("índice já identificado abre sem identidade e informa a dele", async () => {
    const { index, path } = open();
    await addNote(index, "a.md", "texto");
    index.close();
    const reader = BrainIndex.open(path);
    expect(reader.identity()).toEqual(IDENTITY);
    expect(reader.counts().vec).toBe(1);
    reader.close();
  });

  it("schema mais novo que o desta versão é erro", () => {
    const { index, path } = open();
    index.setMeta("schema_version", String(SCHEMA_VERSION + 1));
    index.close();
    expect(() => BrainIndex.open(path, IDENTITY)).toThrow(/versão mais nova/);
  });
});

describe("escrita", () => {
  it("upsertFile devolve o mesmo id para o mesmo caminho e apaga os trechos antigos", async () => {
    const { index } = open();
    const id = await addNote(index, "a.md", "um", "dois", "três");
    expect(index.counts().chunks).toBe(3);

    const again = index.upsertFile(file("a.md", "hash-novo"));
    expect(again).toBe(id);
    expect(index.counts()).toEqual({ files: 1, chunks: 0, fts: 0, vec: 0 });
    expect(index.manifest().get("a.md")!.hash).toBe("hash-novo");
    index.close();
  });

  it("manifest mapeia caminho para a linha do arquivo", async () => {
    const { index } = open();
    await addNote(index, "b.md", "x");
    await addNote(index, "pasta/a.md", "y");
    const manifest = index.manifest();
    expect([...manifest.keys()].sort()).toEqual(["b.md", "pasta/a.md"]);
    expect(manifest.get("b.md")).toMatchObject({ path: "b.md", hash: "h-b.md", size: 100, title: "b" });
    expect(manifest.get("b.md")!.indexedAt).toBeGreaterThan(0);
    index.close();
  });

  it("contagens diferentes de trechos e vetores falham antes de escrever", async () => {
    const { index } = open();
    const id = index.upsertFile(file("a.md"));
    const vectors = await embedder.embed(["um"]);
    expect(() => index.insertChunks(id, chunks("um", "dois"), vectors)).toThrow(/2 trechos e 1 vetores/);
    expect(index.counts()).toEqual({ files: 1, chunks: 0, fts: 0, vec: 0 });
    index.close();
  });

  it("vetor com dimensão errada falha antes de escrever", async () => {
    const { index } = open();
    const id = index.upsertFile(file("a.md"));
    const good = await embedder.embed(["um"]);
    expect(() => index.insertChunks(id, chunks("um", "dois"), [good[0]!, [1, 2, 3]])).toThrow(/dimensão 3/);
    expect(index.counts().chunks).toBe(0);
    index.close();
  });

  it("dropFile apaga a nota e tudo derivado dela", async () => {
    const { index } = open();
    const a = await addNote(index, "a.md", "um", "dois");
    await addNote(index, "b.md", "três");
    index.dropFile(a);
    expect(index.counts()).toEqual({ files: 1, chunks: 1, fts: 1, vec: 1 });
    expect(index.manifest().has("a.md")).toBe(false);
    expectAligned(index);
    index.close();
  });

  it("transação desfaz tudo se algo falhar no meio", async () => {
    const { index } = open();
    expect(() =>
      index.transaction(() => {
        const id = index.upsertFile(file("a.md"));
        index.insertChunks(id, chunks("um"), [Array(64).fill(0.1)]);
        throw new Error("falhou no meio");
      }),
    ).toThrow("falhou no meio");
    expect(index.counts()).toEqual({ files: 0, chunks: 0, fts: 0, vec: 0 });
    index.close();
  });

  it("guarda metadados livres, como a última indexação", () => {
    const { index } = open();
    expect(index.meta("last_index_at")).toBeUndefined();
    index.setMeta("last_index_at", "123");
    expect(index.meta("last_index_at")).toBe("123");
    index.close();
  });
});

describe("o invariante central", () => {
  it("depois de inserções, reindexações e exclusões, os ids das três tabelas são idênticos", async () => {
    const { index } = open();
    const ids: Record<string, number> = {};
    for (let round = 0; round < 5; round++) {
      for (let n = 0; n < 6; n++) {
        const path = `nota-${n}.md`;
        if ((round + n) % 4 === 0 && ids[path] !== undefined) {
          index.dropFile(ids[path]);
          delete ids[path];
        } else {
          const texts = Array.from({ length: 1 + ((round * n) % 4) }, (_, i) => `rodada ${round} nota ${n} trecho ${i}`);
          ids[path] = await addNote(index, path, ...texts);
        }
        expectAligned(index);
      }
    }
    expect(index.counts().files).toBe(Object.keys(ids).length);
    index.close();
  });
});

describe("as tabelas de busca funcionam como o desenho pede", () => {
  it("FTS5 ignora acentos e indexa o heading", async () => {
    const { index } = open();
    await addNote(index, "a.md", "estudo de vetorização local");
    expect(index.matchText("vetorizacao")).toHaveLength(1);
    expect(index.matchText("heading:secao")).toHaveLength(1);
    index.close();
  });

  it("a tabela vetorial devolve o vizinho mais próximo", async () => {
    const { index } = open();
    await addNote(index, "a.md", "busca híbrida com sqlite", "receita de bolo de cenoura");
    const [query] = await embedder.embed(["busca híbrida sqlite"]);
    const [first] = index.nearest(query!, 2);
    expect(index.chunkText(first!.chunkId)).toBe("busca híbrida com sqlite");
    index.close();
  });
});
