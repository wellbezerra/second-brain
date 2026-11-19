import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../src/config.js";
import type { Settings } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { OllamaEmbedder } from "../src/embedders/ollama.js";
import { OpenAIEmbedder } from "../src/embedders/openai.js";
import { HashEmbedder } from "../src/hash-embedder.js";
import { fakeFetch, json, networkDown } from "./fake-fetch.js";
import { tempDir } from "./helpers.js";

/** Fake Ollama: `up` controls whether it answers, `models` what is pulled. */
function ollama(options: { up: boolean; models?: string[]; dim?: number }) {
  const { fetch } = fakeFetch((call) => {
    if (!options.up) networkDown();
    if (call.url.pathname === "/api/tags") return json({ models: (options.models ?? []).map((name) => ({ name })) });
    if (call.url.pathname === "/api/embed") {
      const input = call.body!.input as string[];
      return json({ embeddings: input.map(() => Array(options.dim ?? 1024).fill(0.5)) });
    }
    return new Response("404", { status: 404 });
  });
  return new OllamaEmbedder({ url: DEFAULTS.ollamaUrl, model: "bge-m3", fetch });
}

function openai(apiKey: string | undefined, status = 200) {
  const { fetch, calls } = fakeFetch((call) =>
    status === 200
      ? json({ data: (call.body!.input as string[]).map((_, index) => ({ index, embedding: Array(1536).fill(0.1) })) })
      : json({ error: { message: "bad key" } }, status),
  );
  return { embedder: new OpenAIEmbedder({ apiKey, fetch, sleep: async () => {} }), calls };
}

function settings(vault?: string): Settings {
  const base = { ...DEFAULTS, model: "text-embedding-3-small", excludes: [...DEFAULTS.excludes] };
  return vault === undefined ? base : { ...base, vault };
}

const statuses = (checks: { name: string; status: string }[]) =>
  Object.fromEntries(checks.map((c) => [c.name, c.status]));

describe("runDoctor", () => {
  it("tudo certo: todos os itens ok, na ordem, dizendo para onde os trechos vão", async () => {
    const { embedder, calls } = openai("sk-x");
    const checks = await runDoctor({ nodeVersion: "v24.11.0", settings: settings(tempDir()), embedder });
    expect(checks.map((c) => c.name)).toEqual(["node", "sqlite", "sqlite-vec", "provedor", "dimensão", "vault"]);
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    const provider = checks.find((c) => c.name === "provedor")!.detail;
    expect(provider).toContain("openai");
    expect(provider).toContain("text-embedding-3-small");
    expect(provider).toContain("api.openai.com");
    expect(checks.find((c) => c.name === "dimensão")!.detail).toContain("1536");
    // health already discovers the dimension: a single call.
    expect(calls).toHaveLength(1);
  });

  it("sem chave, o provedor falha sem chamar a rede, e a dimensão é pulada", async () => {
    const { embedder, calls } = openai(undefined);
    const checks = await runDoctor({ nodeVersion: "v24.11.0", settings: settings(tempDir()), embedder });
    expect(statuses(checks)).toEqual({ node: "ok", sqlite: "ok", "sqlite-vec": "ok", provedor: "fail", dimensão: "skip", vault: "ok" });
    expect(checks.find((c) => c.name === "provedor")!.detail).toContain("OPENAI_API_KEY");
    expect(calls).toEqual([]);
  });

  it("chave recusada falha o provedor", async () => {
    const { embedder } = openai("sk-errada", 401);
    const checks = await runDoctor({ nodeVersion: "v24.11.0", settings: settings(tempDir()), embedder });
    expect(statuses(checks).provedor).toBe("fail");
  });

  it("sem Ollama, só aquele item falha", async () => {
    const checks = await runDoctor({
      nodeVersion: "v24.11.0",
      settings: settings(tempDir()),
      embedder: ollama({ up: false }),
    });
    expect(statuses(checks)).toEqual({ node: "ok", sqlite: "ok", "sqlite-vec": "ok", provedor: "fail", dimensão: "skip", vault: "ok" });
    expect(checks.find((c) => c.name === "provedor")!.detail).toContain("ollama serve");
  });

  it("Ollama com modelo ausente falha com o comando de pull", async () => {
    const checks = await runDoctor({
      nodeVersion: "v24.11.0",
      settings: settings(tempDir()),
      embedder: ollama({ up: true, models: ["nomic-embed-text:latest"] }),
    });
    expect(statuses(checks)).toMatchObject({ provedor: "fail", dimensão: "skip" });
    expect(checks.find((c) => c.name === "provedor")!.detail).toContain("ollama pull bge-m3");
  });

  it("Ollama completo: ok, com a dimensão do modelo", async () => {
    const checks = await runDoctor({
      nodeVersion: "v24.11.0",
      settings: settings(tempDir()),
      embedder: ollama({ up: true, models: ["bge-m3:latest"], dim: 1024 }),
    });
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(checks.find((c) => c.name === "dimensão")!.detail).toContain("1024");
  });

  it("SQLite real: versão, FTS5 e sqlite-vec carregando", async () => {
    const checks = await runDoctor({ nodeVersion: "v24.0.0", settings: settings(tempDir()), embedder: new HashEmbedder() });
    expect(checks.find((c) => c.name === "sqlite")!.detail).toMatch(/^3\.\d+\.\d+ com FTS5$/);
    expect(checks.find((c) => c.name === "sqlite-vec")!.detail).toMatch(/^v\d+\.\d+/);
  });

  it("SQLite sem FTS5 ou sqlite-vec que não carrega falham com orientação", async () => {
    const checks = await runDoctor({
      nodeVersion: "v24.0.0",
      settings: settings(tempDir()),
      embedder: new HashEmbedder(),
      sqlite: () => ({ version: "3.40.0", fts5: false, vec: { error: "LoadExtension falhou" } }),
    });
    expect(statuses(checks)).toMatchObject({ sqlite: "fail", "sqlite-vec": "fail" });
    expect(checks.find((c) => c.name === "sqlite")!.detail).toContain("FTS5");
    expect(checks.find((c) => c.name === "sqlite-vec")!.detail).toContain("LoadExtension falhou");
  });

  it("Node antigo falha", async () => {
    const checks = await runDoctor({
      nodeVersion: "v22.3.0",
      settings: settings(tempDir()),
      embedder: new HashEmbedder(),
    });
    expect(statuses(checks).node).toBe("fail");
  });

  it("vault não configurado, inexistente ou arquivo falha", async () => {
    const root = tempDir();
    const file = join(root, "nota.md");
    writeFileSync(file, "");
    mkdirSync(join(root, "ok"));
    const embedder = new HashEmbedder();
    const vaultStatus = async (vault?: string) =>
      statuses(await runDoctor({ nodeVersion: "v24.0.0", settings: settings(vault), embedder })).vault;

    expect(await vaultStatus(undefined)).toBe("fail");
    expect(await vaultStatus(join(root, "nao-existe"))).toBe("fail");
    expect(await vaultStatus(file)).toBe("fail");
    expect(await vaultStatus(join(root, "ok"))).toBe("ok");
  });
});
