import { readFileSync } from "node:fs";

/** Package version, read from package.json (one level above src/ and dist/). */
export function version(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  return pkg.version;
}
