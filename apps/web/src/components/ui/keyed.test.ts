import { describe, expect, it } from "vitest";

import { keyed } from "./keyed.ts";

describe("keyed", () => {
  it("keys each item by its id", () => {
    expect(keyed(["Boil water", "Add pasta"], (s) => s)).toEqual([
      { key: "Boil water", item: "Boil water" },
      { key: "Add pasta", item: "Add pasta" },
    ]);
  });

  it("keeps repeated ids unique", () => {
    const keys = keyed(["Stir.", "Wait.", "Stir.", "Stir."], (s) => s).map((k) => k.key);

    expect(keys).toEqual(["Stir.", "Wait.", "Stir.#1", "Stir.#2"]);
  });
});
