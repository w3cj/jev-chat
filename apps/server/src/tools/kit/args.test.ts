import { describe, expect, it } from "vitest";

import { Answers } from "../../jev/questions.ts";
import { Args } from "./args.ts";

const args = () =>
  new Args(
    new Answers(
      {
        t__units: { type: "choice", choice: "celsius" },
        t__when: { type: "choice", choice: "none" },
      },
      "t",
      new Set(),
    ),
  );

describe("Args.option", () => {
  it("records Jev's pick as an option", () => {
    const a = args();
    expect(a.option("units", "fahrenheit")).toBe("celsius");
    expect(a.sources).toEqual([
      { name: "units", value: "celsius", source: "option", questionKey: "t__units" },
    ]);
  });

  it("records the fallback as a default when Jev picked none", () => {
    const a = args();
    expect(a.option("when", "today")).toBe("today");
    expect(a.args).toEqual({ when: "today" });
    expect(a.sources).toEqual([
      { name: "when", value: "today", source: "default", questionKey: "t__when" },
    ]);
  });

  it("leaves the argument out when there is no pick and no fallback", () => {
    const a = args();
    expect(a.option("when")).toBeUndefined();
    expect(a.has("when")).toBe(false);
    expect(a.sources).toEqual([]);
  });
});
