import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { VaultNotFoundError, initVault } from "../src/init.js";
import { tempDir } from "./helpers.js";

function setup() {
  const root = tempDir();
  const vault = join(root, "notas");
  const configFile = join(root, "config", "brain", "config.json");
  return { root, vault, configFile };
}

function readConfig(file: string) {
  return loadConfig({ env: {}, file });
}

describe("initVault", () => {
  it("num caminho inexistente, não cria nada sem confirmação", () => {
    const { root, vault, configFile } = setup();
    expect(() => initVault({ vault, configFile })).toThrow(VaultNotFoundError);
    expect(existsSync(vault)).toBe(false);
    expect(existsSync(configFile)).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it("com create, cria o vault inexistente", () => {
    const { vault, configFile } = setup();
    initVault({ vault, configFile, create: true });
    expect(existsSync(join(vault, ".brain"))).toBe(true);
  });

  it("recusa um caminho que é arquivo", () => {
    const { root, configFile } = setup();
    const file = join(root, "nota.md");
    writeFileSync(file, "# oi");
    expect(() => initVault({ vault: file, configFile, create: true })).toThrow(
      /não é um diretório/,
    );
  });

  it("cria .brain/ e grava o caminho absoluto na configuração", () => {
    const { vault, configFile } = setup();
    mkdirSync(vault);
    const result = initVault({ vault, configFile, model: "nomic-embed-text" });

    expect(existsSync(join(vault, ".brain"))).toBe(true);
    expect(result.vault).toBe(resolve(vault));
    expect(result.configFile).toBe(configFile);
    expect(result.created).toBe(false);

    const config = readConfig(configFile);
    expect(config.vault).toBe(resolve(vault));
    expect(config.model).toBe("nomic-embed-text");
    expect(config.git).toBe(false);
  });

  it("grava git: true quando pedido", () => {
    const { vault, configFile } = setup();
    mkdirSync(vault);
    initVault({ vault, configFile, git: true });
    expect(readConfig(configFile).git).toBe(true);
  });

  it("é idempotente", () => {
    const { vault, configFile } = setup();
    mkdirSync(join(vault, ".git"), { recursive: true });
    writeFileSync(join(vault, ".gitignore"), "*.tmp\n");

    initVault({ vault, configFile });
    const first = {
      config: readFileSync(configFile, "utf8"),
      gitignore: readFileSync(join(vault, ".gitignore"), "utf8"),
      entries: readdirSync(vault).sort(),
    };

    const second = initVault({ vault, configFile });
    expect(second.gitignoreUpdated).toBe(false);
    expect(readFileSync(configFile, "utf8")).toBe(first.config);
    expect(readFileSync(join(vault, ".gitignore"), "utf8")).toBe(
      first.gitignore,
    );
    expect(readdirSync(vault).sort()).toEqual(first.entries);
  });

  it("não desfaz o que já existe em .brain/", () => {
    const { vault, configFile } = setup();
    mkdirSync(join(vault, ".brain"), { recursive: true });
    writeFileSync(join(vault, ".brain", "index.db"), "dados");
    initVault({ vault, configFile });
    expect(readFileSync(join(vault, ".brain", "index.db"), "utf8")).toBe(
      "dados",
    );
  });

  describe(".gitignore", () => {
    it("acrescenta .brain/ a um .gitignore com conteúdo", () => {
      const { vault, configFile } = setup();
      mkdirSync(join(vault, ".git"), { recursive: true });
      writeFileSync(join(vault, ".gitignore"), "*.tmp\n.DS_Store");

      const result = initVault({ vault, configFile });

      expect(result.gitignoreUpdated).toBe(true);
      expect(readFileSync(join(vault, ".gitignore"), "utf8")).toBe(
        "*.tmp\n.DS_Store\n.brain/\n",
      );
    });

    it("cria o .gitignore se o repositório não tem um", () => {
      const { vault, configFile } = setup();
      mkdirSync(join(vault, ".git"), { recursive: true });
      initVault({ vault, configFile });
      expect(readFileSync(join(vault, ".gitignore"), "utf8")).toBe(".brain/\n");
    });

    it.each([".brain/", ".brain", "/.brain/"])(
      "não duplica a linha quando já existe %s",
      (line) => {
        const { vault, configFile } = setup();
        mkdirSync(join(vault, ".git"), { recursive: true });
        const content = `*.tmp\n${line}\n`;
        writeFileSync(join(vault, ".gitignore"), content);

        const result = initVault({ vault, configFile });

        expect(result.gitignoreUpdated).toBe(false);
        expect(readFileSync(join(vault, ".gitignore"), "utf8")).toBe(content);
      },
    );

    it("preserva CRLF de um .gitignore do Windows", () => {
      const { vault, configFile } = setup();
      mkdirSync(join(vault, ".git"), { recursive: true });
      writeFileSync(join(vault, ".gitignore"), "*.tmp\r\n.brain/\r\n");
      const result = initVault({ vault, configFile });
      expect(result.gitignoreUpdated).toBe(false);
    });

    it("não mexe em .gitignore fora de um repositório Git", () => {
      const { vault, configFile } = setup();
      mkdirSync(vault);
      const result = initVault({ vault, configFile });
      expect(result.gitignoreUpdated).toBe(false);
      expect(existsSync(join(vault, ".gitignore"))).toBe(false);
    });
  });
});
