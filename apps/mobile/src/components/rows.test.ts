// Rule 17 parity with the web: every record the app lists links to its discogs.com page.
// The components need a React Native runtime, so this reads their source instead.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** The JSX that renderItem returns for one row of the list. */
function rowSource(component: string): string {
  const start = component.indexOf("renderItem=");
  expect(start).toBeGreaterThan(-1);
  return component.slice(start);
}

describe("record rows link to Discogs", () => {
  it("gives every ItemListPlayer row a 'View on Discogs' link to the item's page", () => {
    const row = rowSource(source("./ItemListPlayer.tsx"));
    expect(row).toMatch(/accessibilityLabel="View on Discogs"/);
    expect(row).toMatch(/accessibilityRole="link"/);
    expect(row).toContain("Linking.openURL(item.discogsUrl)");
    // Not behind a condition: unavailable records still link to their Discogs page.
    expect(row).not.toMatch(/\?\s*\(\s*<Pressable[^>]*View on Discogs/);
  });

  it("lists favorites, history and crates through ItemListPlayer", () => {
    for (const screen of [
      "../../app/(tabs)/favorites.tsx",
      "../../app/(tabs)/history.tsx",
      "../../app/crates/[id].tsx",
    ])
      expect(source(screen), screen).toContain("<ItemListPlayer");
  });

  it("keeps the Discogs link on Dig's record panel", () => {
    expect(source("./RecordPanel.tsx")).toMatch(
      /<Link label="View on Discogs" url=\{r\.discogsUrl\} \/>/,
    );
  });
});
