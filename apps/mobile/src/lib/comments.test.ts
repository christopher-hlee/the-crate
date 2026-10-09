import { SUPPORT_EMAIL_PLACEHOLDER } from "@app/core";
import { describe, expect, it } from "vitest";
import { withoutAuthor } from "./comments";
import { SUPPORT } from "./support";

describe("withoutAuthor", () => {
  it("drops every comment by the blocked author and keeps the rest in order", () => {
    const c = (id: string, displayName: string) => ({ id, author: { displayName } });
    const list = [c("1", "Troll"), c("2", "Digger One"), c("3", "Troll"), c("4", "Selector")];
    expect(withoutAuthor(list, "Troll").map((x) => x.id)).toEqual(["2", "4"]);
    expect(withoutAuthor(list, "Nobody")).toHaveLength(4);
  });
});

describe("support contact", () => {
  it("falls back to the marked placeholder when EXPO_PUBLIC_SUPPORT_EMAIL is unset", () => {
    if (process.env.EXPO_PUBLIC_SUPPORT_EMAIL) expect(SUPPORT.placeholder).toBe(false);
    else expect(SUPPORT).toEqual({ email: SUPPORT_EMAIL_PLACEHOLDER, placeholder: true });
  });
});
