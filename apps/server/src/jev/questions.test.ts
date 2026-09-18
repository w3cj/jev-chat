import { describe, expect, it } from "vitest";

import type { JevAnswerJson } from "../shared/types.ts";
import { Answers, ranked, runnerUp } from "./questions.ts";

const choice = (probabilities: Record<string, number>, pick?: string): JevAnswerJson => ({
  type: "choice",
  choice: pick ?? Object.entries(probabilities).toSorted((a, b) => b[1] - a[1])[0]?.[0],
  probabilities,
});

describe("ranked", () => {
  it("orders the options by probability, best first", () => {
    expect(ranked(choice({ a: 0.2, b: 0.7, c: 0.1 })).map(([k]) => k)).toEqual(["b", "a", "c"]);
  });

  it("leaves out the none option, which is an escape hatch rather than a rival", () => {
    expect(ranked(choice({ a: 0.3, none: 0.6 })).map(([k]) => k)).toEqual(["a"]);
  });

  it("is empty for a missing answer", () => {
    expect(ranked(undefined)).toEqual([]);
  });
});

describe("runnerUp", () => {
  it("names the second option when the top two are close", () => {
    expect(runnerUp(choice({ a: 0.4, b: 0.35 }), 0.15)).toBe("b");
  });

  it("stays quiet when the winner is clear", () => {
    expect(runnerUp(choice({ a: 0.8, b: 0.1 }), 0.15)).toBeUndefined();
  });

  it("stays quiet when there is only one real option", () => {
    expect(runnerUp(choice({ a: 0.4, none: 0.6 }), 0.15)).toBeUndefined();
  });
});

describe("Answers", () => {
  const raw: Record<string, JevAnswerJson> = {
    w__place: choice({ c1: 0.7, c2: 0.2, none: 0.1 }),
    w__skip: choice({ c1: 0.1, none: 0.9 }),
    w__yes: { type: "noul", noul: 0.8 },
  };
  const read = () => {
    const used = new Set<string>();
    return { a: new Answers(raw, "w", used), used };
  };

  it("reads a Choice under its prefixed key and records the read", () => {
    const { a, used } = read();
    expect(a.choice("place")).toBe("c1");
    expect(used).toEqual(new Set(["w__place"]));
  });

  it("treats none, and a missing answer, as no choice", () => {
    const { a, used } = read();
    expect(a.choice("skip")).toBeUndefined();
    expect(a.choice("absent")).toBeUndefined();
    expect(used).toEqual(new Set(["w__skip", "w__absent"]));
  });

  it("ranks a Choice's real options and records the read", () => {
    const { a, used } = read();
    expect(a.ranked("place")).toEqual([
      ["c1", 0.7],
      ["c2", 0.2],
    ]);
    expect(used).toEqual(new Set(["w__place"]));
  });

  it("reads a Noul's probability, zero when missing", () => {
    const { a, used } = read();
    expect(a.noul("yes")).toBe(0.8);
    expect(a.noul("absent")).toBe(0);
    expect(used).toEqual(new Set(["w__yes", "w__absent"]));
  });

  it("finds the chosen candidate in a pool", () => {
    const { a } = read();
    const pool = ["Rome", "Paris"].map((v, i) => ({
      key: `c${i + 1}`,
      value: v,
      label: v,
      source: "message",
    }));
    expect(a.candidate("place", pool)?.value).toBe("Rome");
    expect(a.candidate("skip", pool)).toBeUndefined();
  });
});
