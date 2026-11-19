import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../src/config.js";
import type { Settings } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { OllamaEmbedder } from "../src/embed.js";
import { tempDir } from "./helpers.js";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** Ollama falso: `up` controla se responde, `models` o que está baixado. */
function ollama(options: { up: boolean; models?: string[]; dim?: number }) {
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (!options.up) throw new TypeError("fetch failed");
    const path = new URL(String(input)).pathname;
    if (path === "/api/tags") return json({ models: (options.models ?? []).map((name) => ({ name })) });
    if (path === "/api/embed") {
      const input = JSON.parse(String(init!.body)).input as string[];
      return json({ embeddings: input.map(() => Array(options.dim ?? 1024).fill(0.5)) });
    }
    return new Response("404", { status: 404 });
  }) as typeof globalThis.fetch;
  return new OllamaEmbedder({ url: DEFAULTS.ollamaUrl, model: DEFAULTS.model, fetch });
}

function settings(vault?: string): Settings {
  return vault === undefined ? { ...DEFAULTS, excludes: [...DEFAULTS.excludes] } : { ...DEFAULTS, excludes: [...DEFAULTS.excludes], vault };
}

const statuses = (checks: { name: string; status: string }[]) =>
  Object.fromEntries(checks.map((c) => [c.name, c.status]));

describe("runDoctor", () => {
  it("tudo certo: todos os itens ok, na ordem", async () => {
    const vault = tempDir();
    const checks = await runDoctor({
      nodeVersion: "v24.11.0",
      settings: settings(vault),
      embedder: ollama({ up: true, models: ["bge-m3:latest"], dim: 1024 }),
    });
    expect(checks.map((c) => c.name)).toEqual(["node", "ollama", "modelo", "dimensão", "vault"]);
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(checks.find((c) => c.name === "dimensão")!.detail).toContain("1024");
  });

  it("sem Ollama, só aquele item falha; os que dependem dele são pulados", async () => {
    const checks = await runDoctor({
      nodeVersion: "v24.11.0",
      settings: settings(tempDir()),
      embedder: ollama({ up: false }),
    });
    expect(statuses(checks)).toEqual({
      node: "ok",
      ollama: "fail",
      modelo: "skip",
      dimensão: "skip",
      vault: "ok",
    });
    expect(checks.find((c) => c.name === "ollama")!.detail).toContain("ollama serve");
  });

  it("modelo ausente falha com o comando de pull", async () => {
    const checks = await runDoctor({
      nodeVersion: "v24.11.0",
      settings: settings(tempDir()),
      embedder: ollama({ up: true, models: ["nomic-embed-text:latest"] }),
    });
    expect(statuses(checks)).toMatchObject({ ollama: "ok", modelo: "fail", dimensão: "skip" });
    expect(checks.find((c) => c.name === "modelo")!.detail).toContain("ollama pull bge-m3");
  });

  it("Node antigo falha", async () => {
    const checks = await runDoctor({
      nodeVersion: "v22.3.0",
      settings: settings(tempDir()),
      embedder: ollama({ up: true, models: ["bge-m3"] }),
    });
    expect(statuses(checks).node).toBe("fail");
  });

  it("vault não configurado, inexistente ou arquivo falha", async () => {
    const root = tempDir();
    const file = join(root, "nota.md");
    writeFileSync(file, "");
    mkdirSync(join(root, "ok"));
    const embedder = ollama({ up: true, models: ["bge-m3"] });
    const vaultStatus = async (vault?: string) =>
      statuses(await runDoctor({ nodeVersion: "v24.0.0", settings: settings(vault), embedder })).vault;

    expect(await vaultStatus(undefined)).toBe("fail");
    expect(await vaultStatus(join(root, "nao-existe"))).toBe("fail");
    expect(await vaultStatus(file)).toBe("fail");
    expect(await vaultStatus(join(root, "ok"))).toBe("ok");
  });
});
