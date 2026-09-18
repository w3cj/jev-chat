import { describe, expect, it } from "vitest";

import { fold, isPlace, placeCount } from "./places.ts";

describe("fold", () => {
  it("strips accents and case, so a snippet's plain spelling matches the stored name", () => {
    expect(fold("Zürich")).toBe("zurich");
    expect(fold("São Paulo")).toBe("sao paulo");
    expect(fold("Côte d'Ivoire")).toBe("cote d'ivoire");
  });
});

describe("isPlace", () => {
  it("knows countries, their native names and their capitals", () => {
    expect(isPlace("Japan")).toBe(true);
    expect(isPlace("France")).toBe(true);
    expect(isPlace("Tokyo")).toBe(true);
  });

  it("knows country subdivisions", () => {
    expect(isPlace("Washington")).toBe(true);
    expect(isPlace("Colorado")).toBe(true);
    expect(isPlace("Queensland")).toBe(true);
    expect(isPlace("Brandenburg")).toBe(true);
  });

  it("matches regardless of accents, in either direction", () => {
    expect(isPlace("Sao Paulo")).toBe(isPlace("São Paulo"));
    expect(isPlace("São Paulo")).toBe(true);
  });

  it("recognises the shape of a place even when the name is unknown", () => {
    expect(isPlace("Mount Rainier")).toBe(true);
    expect(isPlace("Lake Tahoe")).toBe(true);
    expect(isPlace("Pierce County")).toBe(true);
    expect(isPlace("Kyoto Prefecture")).toBe(true);
  });

  it("does not claim ordinary capitalised phrases", () => {
    for (const notAPlace of [
      "Wes Bos",
      "Apple Podcasts",
      "Show Notes",
      "Darknet Diaries",
      "Privacy Policy",
    ]) {
      expect(isPlace(notAPlace)).toBe(false);
    }
  });

  it("is backed by a generated list, not an empty file", () => {
    expect(placeCount()).toBeGreaterThan(1000);
  });
});
