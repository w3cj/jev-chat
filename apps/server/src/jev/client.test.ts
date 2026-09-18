import { afterEach, describe, expect, it, vi } from "vitest";

async function modelFor(value: string) {
  vi.stubEnv("TYPESAFE_MODEL", value);
  vi.resetModules();
  const { JEV_MODEL } = await import("./client.ts");
  return JEV_MODEL;
}

describe("JEV_MODEL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses TYPESAFE_MODEL when set", async () => {
    expect(await modelFor("jev-custom")).toBe("jev-custom");
  });

  it("falls back to jev-latest when TYPESAFE_MODEL is blank", async () => {
    expect(await modelFor("")).toBe("jev-latest");
    expect(await modelFor("  ")).toBe("jev-latest");
  });
});
