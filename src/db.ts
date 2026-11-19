// O índice (ADR 004, ADR 007): um SQLite com manifesto, FTS5 e sqlite-vec.
// Invariante central: chunks.id = chunks_fts.rowid = chunks_vec.chunk_id.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export const SCHEMA_VERSION = 1;

export type IndexErrorKind =
  | "identity-mismatch"
  | "no-identity"
  | "schema"
  | "extension"
  | "invalid-input";

export class IndexError extends Error {
  override name = "IndexError";
  constructor(
    readonly kind: IndexErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Quem gerou os vetores. Vetores de identidades diferentes não se comparam (ADR 012). */
export interface IndexIdentity {
  provider: string;
  model: string;
  dim: number;
}

export interface FileInput {
  /** Relativo à raiz do vault, com `/`. */
  path: string;
  /** SHA-256 do conteúdo. */
  hash: string;
  /** Milissegundos desde a época, como `stat.mtimeMs`. */
  mtime: number;
  size: number;
  title: string | null;
}

export interface FileRow extends FileInput {
  id: number;
  /** Milissegundos desde a época. */
  indexedAt: number;
}

export interface ChunkInput {
  ord: number;
  heading: string | null;
  text: string;
}

export interface Counts {
  files: number;
  chunks: number;
  fts: number;
  vec: number;
}

/** `<vault>/.brain/index.db` (ADR 007). */
export function indexPath(vault: string): string {
  return join(vault, ".brain", "index.db");
}

const SCHEMA = `
CREATE TABLE files (
    id         INTEGER PRIMARY KEY,
    path       TEXT    NOT NULL UNIQUE,
    hash       TEXT    NOT NULL,
    mtime      REAL    NOT NULL,
    size       INTEGER NOT NULL,
    title      TEXT,
    indexed_at REAL    NOT NULL
);

CREATE TABLE chunks (
    id      INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    ord     INTEGER NOT NULL,
    heading TEXT,
    text    TEXT    NOT NULL,
    UNIQUE (file_id, ord)
);

CREATE INDEX chunks_by_file ON chunks(file_id);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
    text,
    heading,
    tokenize = 'unicode61 remove_diacritics 2'
);
`;

export class BrainIndex {
  private constructor(
    readonly path: string,
    private readonly db: Database.Database,
  ) {}

  /**
   * Abre (criando se preciso) e migra o índice. Com `identity`, grava-a na
   * primeira vez e cria a tabela vetorial; nas seguintes, recusa uma
   * identidade diferente. Sem `identity`, abre só para ler.
   */
  static open(path: string, identity?: IndexIdentity): BrainIndex {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    try {
      loadVec(db);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.pragma("synchronous = NORMAL");
      const index = new BrainIndex(path, db);
      index.migrate();
      if (identity) index.bind(identity);
      return index;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  pragma(name: string): unknown {
    return this.db.pragma(name, { simple: true });
  }

  /** Identidade gravada, ou `undefined` se ainda não houve indexação. */
  identity(): IndexIdentity | undefined {
    const provider = this.meta("provider");
    const model = this.meta("model");
    const dim = this.meta("dim");
    if (provider === undefined || model === undefined || dim === undefined) return undefined;
    return { provider, model, dim: Number(dim) };
  }

  meta(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  /** Roda `fn` numa transação; aninhada, vira savepoint. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /** Mapa caminho → linha do manifesto, para comparar com o disco. */
  manifest(): Map<string, FileRow> {
    const rows = this.db
      .prepare("SELECT id, path, hash, mtime, size, title, indexed_at AS indexedAt FROM files")
      .all() as FileRow[];
    return new Map(rows.map((row) => [row.path, row]));
  }

  /**
   * Grava a nota no manifesto e apaga os trechos antigos dela, numa
   * operação só: não existe janela com manifesto novo e trechos velhos.
   */
  upsertFile(file: FileInput): number {
    return this.transaction(() => {
      const { id } = this.db
        .prepare(
          `INSERT INTO files (path, hash, mtime, size, title, indexed_at)
           VALUES (@path, @hash, @mtime, @size, @title, @indexedAt)
           ON CONFLICT(path) DO UPDATE SET
             hash = excluded.hash, mtime = excluded.mtime, size = excluded.size,
             title = excluded.title, indexed_at = excluded.indexed_at
           RETURNING id`,
        )
        .get({ ...file, indexedAt: Date.now() }) as { id: number };
      this.deleteChunksOf(id);
      return id;
    });
  }

  /** Insere trechos e vetores nas três tabelas, com o mesmo id. Valida tudo antes de escrever. */
  insertChunks(fileId: number, chunks: readonly ChunkInput[], embeddings: readonly number[][]): void {
    const identity = this.identity();
    if (!identity || !this.hasVecTable()) {
      throw new IndexError(
        "no-identity",
        "o índice ainda não sabe qual modelo gerou os vetores; abra-o com a identidade do embedder",
      );
    }
    if (chunks.length !== embeddings.length) {
      throw new IndexError(
        "invalid-input",
        `${chunks.length} trechos e ${embeddings.length} vetores: as contagens precisam bater`,
      );
    }
    const wrong = embeddings.find((v) => v.length !== identity.dim);
    if (wrong) {
      throw new IndexError(
        "invalid-input",
        `vetor de dimensão ${wrong.length}, mas o índice é de ${identity.dim}`,
      );
    }

    const insertChunk = this.db.prepare(
      "INSERT INTO chunks (file_id, ord, heading, text) VALUES (?, ?, ?, ?) RETURNING id",
    );
    const insertFts = this.db.prepare("INSERT INTO chunks_fts (rowid, text, heading) VALUES (?, ?, ?)");
    const insertVec = this.db.prepare("INSERT INTO chunks_vec (chunk_id, embedding) VALUES (?, ?)");

    this.transaction(() => {
      chunks.forEach((chunk, i) => {
        const { id } = insertChunk.get(fileId, chunk.ord, chunk.heading, chunk.text) as { id: number };
        insertFts.run(id, chunk.text, chunk.heading ?? "");
        // vec0 exige inteiro de verdade na chave; número do JS chega como REAL.
        insertVec.run(BigInt(id), new Float32Array(embeddings[i]!));
      });
    });
  }

  /** Apaga a nota e tudo derivado dela. */
  dropFile(fileId: number): void {
    this.transaction(() => {
      this.deleteChunksOf(fileId);
      this.db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
    });
  }

  counts(): Counts {
    const count = (table: string) =>
      (this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    return {
      files: count("files"),
      chunks: count("chunks"),
      fts: count("chunks_fts"),
      vec: this.hasVecTable() ? count("chunks_vec") : 0,
    };
  }

  /** Ids de cada tabela, em ordem — o que o `reconcile` (spec 08) compara. */
  chunkIds(): { chunks: number[]; fts: number[]; vec: number[] } {
    const ids = (sql: string) =>
      (this.db.prepare(sql).raw().all() as [number | bigint][]).map(([id]) => Number(id));
    return {
      chunks: ids("SELECT id FROM chunks ORDER BY id"),
      fts: ids("SELECT rowid FROM chunks_fts ORDER BY rowid"),
      vec: this.hasVecTable() ? ids("SELECT chunk_id FROM chunks_vec ORDER BY chunk_id") : [],
    };
  }

  chunkText(chunkId: number): string | undefined {
    const row = this.db.prepare("SELECT text FROM chunks WHERE id = ?").get(chunkId) as
      | { text: string }
      | undefined;
    return row?.text;
  }

  /** Ids que casam com uma expressão FTS5, por relevância. Base da busca da spec 06. */
  matchText(query: string): number[] {
    return (
      this.db
        .prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank")
        .raw()
        .all(query) as [number][]
    ).map(([id]) => id);
  }

  /** Os `k` trechos mais próximos do vetor. Base da busca da spec 06. */
  nearest(vector: readonly number[], k: number): { chunkId: number; distance: number }[] {
    if (!this.hasVecTable()) return [];
    const rows = this.db
      .prepare(
        "SELECT chunk_id AS chunkId, distance FROM chunks_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance",
      )
      .all(new Float32Array(vector), k) as { chunkId: number | bigint; distance: number }[];
    return rows.map((r) => ({ chunkId: Number(r.chunkId), distance: r.distance }));
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const stored = this.meta("schema_version");
    if (stored === undefined) {
      this.transaction(() => {
        this.db.exec(SCHEMA);
        this.setMeta("schema_version", String(SCHEMA_VERSION));
      });
      return;
    }
    if (Number(stored) > SCHEMA_VERSION) {
      throw new IndexError(
        "schema",
        `o índice em ${this.path} foi criado por uma versão mais nova do Brain ` +
          `(esquema ${stored}; esta entende até ${SCHEMA_VERSION}). Atualize o Brain ou rode \`brain index --rebuild\`.`,
      );
    }
    // Esquema 1 é o primeiro: ainda não há migração a aplicar.
  }

  private bind(identity: IndexIdentity): void {
    const stored = this.identity();
    if (stored) {
      if (stored.provider !== identity.provider || stored.model !== identity.model || stored.dim !== identity.dim) {
        throw new IndexError(
          "identity-mismatch",
          `o índice em ${this.path} foi criado com ${describe(stored)}, mas a configuração pede ` +
            `${describe(identity)}. Vetores de modelos diferentes não se comparam. ` +
            "Rode `brain index --rebuild` para reindexar tudo com o modelo novo, ou volte a configuração para o anterior.",
        );
      }
      return;
    }
    if (!Number.isInteger(identity.dim) || identity.dim <= 0) {
      throw new IndexError("invalid-input", `dimensão inválida: ${identity.dim}`);
    }
    this.transaction(() => {
      this.setMeta("provider", identity.provider);
      this.setMeta("model", identity.model);
      this.setMeta("dim", String(identity.dim));
      // Vetores saem normalizados do embedder: distância L2 ordena como o cosseno (ADR 003/012).
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
           chunk_id  INTEGER PRIMARY KEY,
           embedding float[${identity.dim}]
         )`,
      );
    });
  }

  private hasVecTable(): boolean {
    return (
      this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chunks_vec'").get() !==
      undefined
    );
  }

  private deleteChunksOf(fileId: number): void {
    const ids = (
      this.db.prepare("SELECT id FROM chunks WHERE file_id = ?").raw().all(fileId) as [number][]
    ).map(([id]) => id);
    const deleteFts = this.db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
    const deleteVec = this.hasVecTable() ? this.db.prepare("DELETE FROM chunks_vec WHERE chunk_id = ?") : undefined;
    for (const id of ids) {
      deleteFts.run(id);
      deleteVec?.run(BigInt(id));
    }
    this.db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
  }
}

function describe(identity: IndexIdentity): string {
  return `${identity.provider} · ${identity.model} (${identity.dim} dimensões)`;
}

function loadVec(db: Database.Database): void {
  try {
    // better-sqlite3 só expõe a carga pela API em C: load_extension() em SQL
    // continua desligado, então não há o que desabilitar depois.
    sqliteVec.load(db);
  } catch (error) {
    throw new IndexError(
      "extension",
      `não consegui carregar a extensão sqlite-vec (${(error as Error).message}). ` +
        "Rode `brain doctor` para ver o que falta.",
    );
  }
}

export interface SqliteInfo {
  version: string;
  fts5: boolean;
  vec: { version: string } | { error: string };
}

/** Diagnóstico do SQLite embutido, num banco em memória. Para o `brain doctor`. */
export function sqliteInfo(): SqliteInfo {
  const db = new Database(":memory:");
  try {
    const version = (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v;
    let fts5 = true;
    try {
      db.exec("CREATE VIRTUAL TABLE t USING fts5(x)");
    } catch {
      fts5 = false;
    }
    let vec: SqliteInfo["vec"];
    try {
      sqliteVec.load(db);
      vec = { version: (db.prepare("SELECT vec_version() AS v").get() as { v: string }).v };
    } catch (error) {
      vec = { error: (error as Error).message };
    }
    return { version, fts5, vec };
  } finally {
    db.close();
  }
}
