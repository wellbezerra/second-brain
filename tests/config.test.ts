import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  DEFAULTS,
  DEFAULT_MODELS,
  configPath,
  loadConfig,
  loadSettings,
  saveConfig,
} from "../src/config.js";
import { tempDir } from "./helpers.js";

function writeConfig(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
}

describe("configPath", () => {
  it("respeita XDG_CONFIG_HOME", () => {
    const xdg = tempDir();
    expect(configPath({ XDG_CONFIG_HOME: xdg })).toBe(
      join(xdg, "brain", "config.json"),
    );
  });

  it("cai em ~/.config sem XDG_CONFIG_HOME", () => {
    expect(configPath({})).toBe(
      join(homedir(), ".config", "brain", "config.json"),
    );
  });
});

describe("loadConfig", () => {
  it("argumento vence ambiente, que vence arquivo, que vence padrão", () => {
    const dir = tempDir();
    const file = join(dir, "config.json");
    writeConfig(file, {
      vault: join(dir, "arquivo"),
      model: "modelo-arquivo",
      ollama_url: "http://arquivo:1",
    });

    const env = {
      BRAIN_VAULT: join(dir, "ambiente"),
      BRAIN_MODEL: "modelo-ambiente",
    };

    const fromArgs = loadConfig({
      args: { vault: join(dir, "argumento") },
      env,
      file,
    });
    expect(fromArgs.vault).toBe(join(dir, "argumento"));
    expect(fromArgs.model).toBe("modelo-ambiente");
    expect(fromArgs.ollamaUrl).toBe("http://arquivo:1");
    expect(fromArgs.excludes).toEqual(DEFAULTS.excludes);
    expect(fromArgs.git).toBe(false);

    const fromEnv = loadConfig({ env, file });
    expect(fromEnv.vault).toBe(join(dir, "ambiente"));

    const fromFile = loadConfig({ env: {}, file });
    expect(fromFile.vault).toBe(join(dir, "arquivo"));
    expect(fromFile.model).toBe("modelo-arquivo");
  });

  it("BRAIN_OLLAMA_URL sobrepõe o arquivo", () => {
    const dir = tempDir();
    const file = join(dir, "config.json");
    writeConfig(file, { vault: dir, ollama_url: "http://arquivo:1" });
    const config = loadConfig({
      env: { BRAIN_OLLAMA_URL: "http://ambiente:2" },
      file,
    });
    expect(config.ollamaUrl).toBe("http://ambiente:2");
  });

  it("sem arquivo de configuração, devolve os padrões", () => {
    const dir = tempDir();
    const config = loadConfig({
      args: { vault: dir },
      env: {},
      file: join(dir, "nao-existe.json"),
    });
    expect(config).toEqual({ ...DEFAULTS, model: "text-embedding-3-small", vault: resolve(dir) });
    expect(DEFAULTS.provider).toBe("openai");
    expect(DEFAULT_MODELS).toEqual({
      openai: "text-embedding-3-small",
      gemini: "gemini-embedding-2",
      voyage: "voyage-4",
      ollama: "bge-m3",
    });
    expect(DEFAULTS.ollamaUrl).toBe("http://127.0.0.1:11434");
    expect(DEFAULTS.excludes).toEqual([
      ".obsidian",
      ".trash",
      ".git",
      ".brain",
      "node_modules",
    ]);
  });

  it("expande ~ e resolve o caminho para absoluto", () => {
    const dir = tempDir();
    const file = join(dir, "nao-existe.json");

    const tilde = loadConfig({ args: { vault: "~/notas" }, env: {}, file });
    expect(tilde.vault).toBe(join(homedir(), "notas"));

    const relative = loadConfig({ args: { vault: "notas" }, env: {}, file });
    expect(isAbsolute(relative.vault)).toBe(true);
    expect(relative.vault).toBe(resolve("notas"));
  });

  it("JSON inválido lança ConfigError que nomeia o arquivo", () => {
    const dir = tempDir();
    const file = join(dir, "config.json");
    writeConfig(file, "{ isto não é json");
    expect(() => loadConfig({ env: {}, file })).toThrow(ConfigError);
    expect(() => loadConfig({ env: {}, file })).toThrow(file);
  });

  it("vault ausente lança ConfigError com as três formas de resolver", () => {
    const dir = tempDir();
    const load = () =>
      loadConfig({ env: {}, file: join(dir, "nao-existe.json") });
    expect(load).toThrow(ConfigError);
    try {
      load();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("--vault");
      expect(message).toContain("BRAIN_VAULT");
      expect(message).toContain("brain init");
    }
  });

  it("BRAIN_VAULT vazio conta como ausente", () => {
    const dir = tempDir();
    expect(() =>
      loadConfig({
        env: { BRAIN_VAULT: "" },
        file: join(dir, "nao-existe.json"),
      }),
    ).toThrow(ConfigError);
  });
});

describe("provedor", () => {
  const file = () => join(tempDir(), "config.json");

  it("argumento vence ambiente, que vence arquivo, que vence o padrão", () => {
    const f = file();
    writeConfig(f, { vault: "/v", provider: "voyage" });
    expect(loadConfig({ env: {}, file: f }).provider).toBe("voyage");
    expect(loadConfig({ env: { BRAIN_PROVIDER: "gemini" }, file: f }).provider).toBe("gemini");
    expect(
      loadConfig({ args: { provider: "ollama" }, env: { BRAIN_PROVIDER: "gemini" }, file: f }).provider,
    ).toBe("ollama");
    expect(loadConfig({ args: { vault: "/v" }, env: {}, file: file() }).provider).toBe("openai");
  });

  it("sem modelo, vale o padrão do provedor", () => {
    const config = loadConfig({ args: { vault: "/v", provider: "gemini" }, env: {}, file: file() });
    expect(config.model).toBe("gemini-embedding-2");
  });

  it("modelo do arquivo só vale para o provedor do arquivo", () => {
    const f = file();
    writeConfig(f, { vault: "/v", provider: "ollama", model: "nomic-embed-text" });
    expect(loadConfig({ env: {}, file: f }).model).toBe("nomic-embed-text");
    // Switching provider through the environment does not carry the Ollama model over to OpenAI.
    expect(loadConfig({ env: { BRAIN_PROVIDER: "openai" }, file: f }).model).toBe("text-embedding-3-small");
    // An explicit model always wins.
    expect(
      loadConfig({ args: { model: "text-embedding-3-large" }, env: { BRAIN_PROVIDER: "openai" }, file: f }).model,
    ).toBe("text-embedding-3-large");
  });

  it("provedor desconhecido é ConfigError que lista as opções", () => {
    const load = () => loadConfig({ args: { vault: "/v", provider: "claude" }, env: {}, file: file() });
    expect(load).toThrow(ConfigError);
    expect(load).toThrow(/openai, gemini, voyage ou ollama/);
  });

  it("provedor desconhecido no arquivo nomeia o arquivo", () => {
    const f = file();
    writeConfig(f, { vault: "/v", provider: "claude" });
    expect(() => loadConfig({ env: {}, file: f })).toThrow(f);
  });

  it("nunca lê chave de API do arquivo", () => {
    const f = file();
    writeConfig(f, { vault: "/v", openai_api_key: "sk-no-arquivo" });
    expect(JSON.stringify(loadConfig({ env: {}, file: f }))).not.toContain("sk-no-arquivo");
  });
});

describe("loadSettings", () => {
  it("não exige vault, e aplica a mesma precedência", () => {
    const dir = tempDir();
    const file = join(dir, "config.json");
    writeConfig(file, { model: "modelo-arquivo" });
    const settings = loadSettings({ env: { BRAIN_OLLAMA_URL: "http://x:1" }, file });
    expect(settings.vault).toBeUndefined();
    expect(settings.model).toBe("modelo-arquivo");
    expect(settings.ollamaUrl).toBe("http://x:1");
  });

  it("resolve o vault quando ele existe", () => {
    const dir = tempDir();
    const settings = loadSettings({ args: { vault: "~/x" }, env: {}, file: join(dir, "n.json") });
    expect(settings.vault).toBe(join(homedir(), "x"));
  });
});

describe("saveConfig", () => {
  it("cria o diretório, grava e preserva campos já existentes", () => {
    const dir = tempDir();
    const file = join(dir, "brain", "config.json");
    saveConfig({ vault: dir, model: "outro" }, file);
    saveConfig({ vault: dir }, file);
    const config = loadConfig({ env: {}, file });
    expect(config.vault).toBe(resolve(dir));
    expect(config.model).toBe("outro");
  });
});
