// Feature flags (ADR 014): typed, off by default, read from the configuration
// file's `features` list and overridden by SECOND_BRAIN_FEATURES.

export const FEATURES = ['init'] as const;
export type Feature = (typeof FEATURES)[number];
export type Flags = Readonly<Record<Feature, boolean>>;

const isFeature = (name: string): name is Feature => (FEATURES as readonly string[]).includes(name);

/**
 * `fromFile` lists the features switched on in the configuration file.
 * `fromEnv` is a comma-separated list; `name` turns a feature on, `-name` off.
 */
export function resolveFlags(
  fromFile: readonly string[] | undefined,
  fromEnv: string | undefined,
): Flags {
  const flags: Record<Feature, boolean> = { init: false };
  for (const name of fromFile ?? []) if (isFeature(name)) flags[name] = true;
  for (const raw of (fromEnv ?? '').split(',')) {
    const item = raw.trim();
    const on = !item.startsWith('-');
    const name = on ? item : item.slice(1);
    if (isFeature(name)) flags[name] = on;
  }
  return flags;
}
