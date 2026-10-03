// The one place feature flags are defined. Every flag defaults to off.

export const FEATURE_FLAGS = [
  "FEATURE_GETSONGBPM",
  "FEATURE_PLAYLIST_EXPORT",
  "FEATURE_CLEARED_LANE",
  "FEATURE_ADS",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type Flags = Readonly<Record<FeatureFlag, boolean>>;

const TRUE_VALUES = new Set(["1", "true", "on", "yes"]);

export function readFlags(env: Readonly<Record<string, string | undefined>>): Flags {
  const out = {} as Record<FeatureFlag, boolean>;
  for (const flag of FEATURE_FLAGS) {
    out[flag] = TRUE_VALUES.has((env[flag] ?? "").trim().toLowerCase());
  }
  return out;
}
