import { describe, expect, it } from "vitest";

import { buildArgs, runBuild, textResult, toolResult } from "../kit/testkit.ts";
import { calculate, convertUnits } from "./units.ts";

const shownWeather = (unit?: string) => ({
  recent: [],
  results: [
    {
      toolId: "weather.get_weather",
      label: "Weather",
      args: {},
      summary: "",
      items: [],
      numbers: [{ value: 61, label: "high on Friday in Seattle, °F", unit }],
    },
  ],
});

describe("convertUnits.build", () => {
  it("converts a number from the message", () => {
    expect(
      buildArgs(convertUnits, {
        message: "350F in celsius",
        answers: { value: "350", from: "fahrenheit", to: "celsius" },
      }),
    ).toEqual({
      value: 350,
      from: "fahrenheit",
      to: "celsius",
    });
  });

  it("reuses a number from an earlier result", () => {
    const { result } = runBuild(convertUnits, {
      message: "What's the high in celsius?",
      state: shownWeather(),
      answers: { value: "61", from: "fahrenheit", to: "celsius" },
    });
    expect(result.ok && result.args).toMatchObject({ value: 61, to: "celsius" });
    expect(result.sources[0]).toMatchObject({ name: "value", source: "earlier result" });
  });

  it("takes the unit of an earlier number from its result, not from Jev", () => {
    const { result } = runBuild(convertUnits, {
      message: "What's the high in celsius?",
      state: shownWeather("celsius"),
      answers: { value: "61", from: "fahrenheit", to: "fahrenheit" },
    });
    expect(result.ok && result.args).toMatchObject({
      value: 61,
      from: "celsius",
      to: "fahrenheit",
      __of: "high on Friday in Seattle, °F",
    });
  });

  it("asks for a number when none is available", () => {
    const { result } = runBuild(convertUnits, {
      message: "convert to celsius",
      answers: { from: "fahrenheit", to: "celsius" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("value");
  });
});

describe("convertUnits.present", () => {
  it("shows the conversion and keeps the result for the next turn", () => {
    const out = convertUnits.present(
      toolResult({
        text: "350°F = 176.67°C",
        value: 350,
        result: 176.67,
        from: "fahrenheit",
        to: "celsius",
      }),
      {},
    );
    expect(out.card).toMatchObject({ type: "calc", expression: "350 fahrenheit → celsius" });
    expect(out.lastResult?.numbers).toEqual([
      { value: 176.67, label: "converted value to celsius", unit: "celsius" },
    ]);
  });

  it("labels a converted earlier number with what it was", () => {
    const out = convertUnits.present(
      toolResult({
        text: "84°F = 28.89°C",
        value: 84,
        result: 28.89,
        from: "fahrenheit",
        to: "celsius",
      }),
      { __of: "high on Friday, Sep 18 in Denver, °F" },
    );
    expect(out.lastResult?.numbers[0].label).toBe(
      "high on Friday, Sep 18 in Denver, °F, converted to celsius",
    );
  });

  it("falls back to the tool's text on an unexpected shape", () => {
    expect(
      convertUnits.present(textResult("Can't convert miles to kilograms."), {}).card?.type,
    ).toBe("error");
  });
});

describe("calculate.build", () => {
  it("maps the percentage and the amount onto the right operands", () => {
    expect(
      buildArgs(calculate, {
        message: "What's a 20% tip on $64?",
        answers: { op: "tip", a: "20", b: "64" },
      }),
    ).toEqual({
      op: "tip",
      a: 20,
      b: 64,
    });
  });

  it("uses another number from the message when both operands pick the same one", () => {
    expect(
      buildArgs(calculate, {
        message: "add 5 to twenty six",
        answers: { op: "add", a: "5", b: "5" },
      }),
    ).toEqual({ op: "add", a: 5, b: 26 });
  });

  it("uses a number twice when it's the only one in the message", () => {
    expect(
      buildArgs(calculate, {
        message: "add 5 and 5",
        state: shownWeather(),
        answers: { op: "add", a: "5", b: "5" },
      }),
    ).toEqual({ op: "add", a: 5, b: 5 });
  });

  it("asks when an operand is missing", () => {
    const { result } = runBuild(calculate, { message: "add 5", answers: { op: "add", a: "5" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("numbers");
  });
});

describe("calculate.present", () => {
  it("formats a tip to two decimals and shows the total", () => {
    const out = calculate.present(
      toolResult({
        text: "20% tip on 64.00 = 12.80 (total 76.80)",
        op: "tip",
        a: 20,
        b: 64,
        result: 12.8,
        total: 76.8,
      }),
      {},
    );
    expect(out.card).toMatchObject({
      type: "calc",
      expression: "20% tip on 64",
      result: "12.80",
      detail: "Total with tip: 76.80",
    });
    expect(out.lastResult?.numbers.map((n) => n.value)).toEqual([12.8, 76.8]);
  });

  it("spells out a percentage of an amount", () => {
    const out = calculate.present(
      toolResult({ text: "15% of 80 = 12", op: "percent_of", a: 15, b: 80, result: 12 }),
      {},
    );
    expect(out.card).toMatchObject({ type: "calc", expression: "15% of 80", result: "12" });
  });

  it("uses the tool's own expression for plain arithmetic", () => {
    const out = calculate.present(
      toolResult({ text: "12 × 4 = 48", op: "multiply", a: 12, b: 4, result: 48 }),
      {},
    );
    expect(out.card).toMatchObject({ type: "calc", expression: "12 × 4", result: "48" });
  });
});
