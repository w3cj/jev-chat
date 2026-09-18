import { round as roundTo, unit } from "mathjs";

export const UNITS = [
  "celsius",
  "fahrenheit",
  "kelvin",
  "meters",
  "kilometers",
  "centimeters",
  "miles",
  "feet",
  "inches",
  "kilograms",
  "grams",
  "pounds",
  "ounces",
  "liters",
  "milliliters",
  "cups",
  "gallons",
  "mph",
  "kmh",
] as const;
export type Unit = (typeof UNITS)[number];

export const OPS = ["add", "subtract", "multiply", "divide", "percent_of", "tip"] as const;
export type Op = (typeof OPS)[number];

// US customary cups and gallons, as mathjs defines them
const MATHJS_UNIT: Record<Unit, string> = {
  celsius: "degC",
  fahrenheit: "degF",
  kelvin: "K",
  meters: "m",
  kilometers: "km",
  centimeters: "cm",
  miles: "mi",
  feet: "ft",
  inches: "inch",
  kilograms: "kg",
  grams: "g",
  pounds: "lb",
  ounces: "oz",
  liters: "L",
  milliliters: "mL",
  cups: "cup",
  gallons: "gal",
  mph: "mi/h",
  kmh: "km/h",
};

const SYMBOL: Partial<Record<Unit, string>> = { celsius: "°C", fahrenheit: "°F", kelvin: "K" };

function round(n: number): number {
  return roundTo(n, 2);
}

function label(n: number, u: Unit): string {
  return SYMBOL[u] ? `${n}${SYMBOL[u]}` : `${n} ${u}`;
}

/** Convert `value` between two units of the same dimension, rounded to two decimals. */
export function convert(value: number, from: Unit, to: Unit) {
  const source = unit(value, MATHJS_UNIT[from]);
  if (!source.equalBase(unit(MATHJS_UNIT[to]))) throw new Error(`Can't convert ${from} to ${to}.`);
  const result = round(source.toNumber(MATHJS_UNIT[to]));
  return { value, from, result, to, text: `${label(value, from)} = ${label(result, to)}` };
}

/**
 * Apply `op` to `a` and `b`, rounded to two decimals. For percent_of and tip, `a` is the
 * percentage and `b` the amount.
 */
export function calculate(op: Op, a: number, b: number) {
  switch (op) {
    case "add":
      return { op, a, b, result: round(a + b), text: `${a} + ${b} = ${round(a + b)}` };
    case "subtract":
      return { op, a, b, result: round(a - b), text: `${a} − ${b} = ${round(a - b)}` };
    case "multiply":
      return { op, a, b, result: round(a * b), text: `${a} × ${b} = ${round(a * b)}` };
    case "divide":
      if (b === 0) throw new Error("Can't divide by zero.");
      return { op, a, b, result: round(a / b), text: `${a} ÷ ${b} = ${round(a / b)}` };
    case "percent_of": {
      const result = round((a / 100) * b);
      return { op, a, b, result, text: `${a}% of ${b} = ${result}` };
    }
    case "tip": {
      const result = round((a / 100) * b);
      const total = round(b + result);
      return {
        op,
        a,
        b,
        result,
        total,
        text: `${a}% tip on ${b.toFixed(2)} = ${result.toFixed(2)} (total ${total.toFixed(2)})`,
      };
    }
    default:
      throw new Error(`Unknown operation: ${String(op)}`);
  }
}
