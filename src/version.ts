import { readFileSync } from "node:fs";

/** Versão do pacote, lida do package.json (fica um nível acima de src/ e de dist/). */
export function version(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return pkg.version;
}
