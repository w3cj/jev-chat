import { describe, expect, it } from "vitest";

import { calculate, convert, UNITS } from "./units.ts";

describe("convert", () => {
  it("converts between all three temperature scales", () => {
    expect(convert(212, "fahrenheit", "celsius").result).toBe(100);
    expect(convert(0, "celsius", "fahrenheit").result).toBe(32);
    expect(convert(0, "celsius", "kelvin").result).toBe(273.15);
    expect(convert(300, "kelvin", "celsius").result).toBe(26.85);
  });

  it("round-trips a temperature back to where it started", () => {
    const c = convert(72, "fahrenheit", "celsius").result;
    expect(convert(c, "celsius", "fahrenheit").result).toBeCloseTo(72, 1);
  });

  it("converts length, mass, volume and speed", () => {
    expect(convert(5, "miles", "kilometers").result).toBe(8.05);
    expect(convert(1, "pounds", "grams").result).toBe(453.59);
    expect(convert(1, "gallons", "liters").result).toBe(3.79);
    expect(convert(60, "mph", "kmh").result).toBe(96.56);
  });

  it("uses US customary cups, gallons and ounces", () => {
    expect(convert(1, "cups", "milliliters").result).toBe(236.59);
    expect(convert(16, "ounces", "pounds").result).toBe(1);
    expect(convert(12, "inches", "feet").result).toBe(1);
    expect(convert(100, "centimeters", "meters").result).toBe(1);
    expect(convert(100, "kmh", "mph").result).toBe(62.14);
  });

  it("knows every unit it offers, and converts each one to itself", () => {
    for (const u of UNITS) expect(convert(7, u, u).result).toBe(7);
  });

  it("rounds halves up where binary floating point would round them down", () => {
    expect(convert(1.005, "meters", "meters").result).toBe(1.01);
  });

  it("rejects a conversion across dimensions", () => {
    expect(() => convert(1, "miles", "kilograms")).toThrow(/Can't convert/);
    expect(() => convert(1, "celsius", "meters")).toThrow(/Can't convert/);
  });

  it("writes temperatures with a degree symbol and other units with a name", () => {
    expect(convert(212, "fahrenheit", "celsius").text).toBe("212°F = 100°C");
    expect(convert(5, "miles", "kilometers").text).toBe("5 miles = 8.05 kilometers");
  });
});

describe("calculate", () => {
  it("does the four basic operations", () => {
    expect(calculate("add", 2, 3).result).toBe(5);
    expect(calculate("subtract", 10, 4).result).toBe(6);
    expect(calculate("multiply", 6, 7).result).toBe(42);
    expect(calculate("divide", 10, 4).result).toBe(2.5);
  });

  it("refuses to divide by zero", () => {
    expect(() => calculate("divide", 1, 0)).toThrow(/zero/);
  });

  it("treats the first operand as the percentage", () => {
    expect(calculate("percent_of", 15, 80).result).toBe(12);
  });

  it("returns the tip and the total including it", () => {
    const tip = calculate("tip", 20, 64);
    expect(tip.result).toBe(12.8);
    expect(tip).toHaveProperty("total", 76.8);
    expect(tip.text).toBe("20% tip on 64.00 = 12.80 (total 76.80)");
  });

  it("rounds to two decimals", () => {
    expect(calculate("divide", 10, 3).result).toBe(3.33);
  });
});
