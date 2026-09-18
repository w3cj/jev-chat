import type { Op, Unit } from "@jev-chat/mcp-units/units";
import { z } from "zod";

import type { NumberCandidate } from "../../jev/pools.ts";
import { candidateQ, choiceQ } from "../../jev/questions.ts";
import { rawFallback, readResult, type SingleStepAdapter } from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";

const convertResult = z.object({
  text: z.string(),
  value: z.number(),
  result: z.number(),
  from: z.string(),
  to: z.string(),
});
const calculateResult = z.object({
  text: z.string(),
  op: z.string(),
  a: z.number(),
  b: z.number(),
  result: z.number(),
  total: z.number().optional(),
});

const UNIT_OPTIONS: Record<Unit, string> = {
  celsius: "°C, Celsius, centigrade",
  fahrenheit: "°F, Fahrenheit (US temperatures)",
  kelvin: "K, Kelvin",
  meters: "m, metres",
  kilometers: "km, kilometres",
  centimeters: "cm",
  miles: "mi, miles",
  feet: "ft, feet",
  inches: "in, inches",
  kilograms: "kg, kilos",
  grams: "g, grams",
  pounds: "lb, lbs, pounds (weight)",
  ounces: "oz, ounces (weight)",
  liters: "L, litres",
  milliliters: "mL",
  cups: "cups",
  gallons: "gal, gallons",
  mph: "miles per hour",
  kmh: "km/h, kilometres per hour",
};

export const convertUnits: SingleStepAdapter = {
  id: "units.convert_units",
  server: "units",
  mcpName: "convert_units",
  label: "Convert units",
  description:
    "Convert a value between units: temperature (°F/°C), distance, weight, volume, speed",
  examples: ["350F in celsius", "5 miles in km"],
  questions: (p) => ({
    value: candidateQ(
      "For a unit conversion: which number should be converted? It can come from the message or from a result shown earlier.",
      p.numbers,
      "No suitable number",
    ),
    from: choiceQ(
      "For a unit conversion: which unit is the value currently in? For a value from an earlier result, use that result's unit.",
      UNIT_OPTIONS,
    ),
    to: choiceQ("For a unit conversion: which unit should it be converted to?", UNIT_OPTIONS),
  }),
  build(a, p) {
    const args = new Args(a);
    const shown = args.pick("value", p.numbers)?.shown;
    if (shown?.unit && shown.unit in UNIT_OPTIONS) {
      args.set("from", shown.unit, "earlier result", args.key("value"));
    } else {
      args.option("from");
    }
    args.option("to");
    if (shown) args.fixed("__of", shown.label);
    return args.require("value", "What number should I convert?");
  },
  present(result, args) {
    const r = readResult(result, convertResult, "convert_units");
    if (!r) return rawFallback(result);
    const of = typeof args.__of === "string" ? `${args.__of}, converted` : "converted value";
    return {
      text: r.text,
      card: { type: "calc", expression: `${r.value} ${r.from} → ${r.to}`, result: r.text },
      lastResult: {
        summary: r.text,
        items: [],
        numbers: [{ value: r.result, label: `${of} to ${r.to}`, unit: r.to }],
      },
    };
  },
};

const OP_OPTIONS: Record<Op, string> = {
  add: "Add two numbers",
  subtract: "Subtract the second number from the first",
  multiply: "Multiply",
  divide: "Divide the first number by the second",
  percent_of: "A percentage of an amount (e.g. 15% of 80)",
  tip: "A tip percentage on a bill (e.g. 20% tip on $64)",
};

/**
 * Jev's picks for the two operands. When both land on the same number from the message and the
 * message has others, the likeliest pair of different message numbers instead.
 */
function operands(args: Args, pool: NumberCandidate[]) {
  const a = args.candidate("a", pool);
  const b = args.candidate("b", pool);
  const typed = pool.filter((c) => c.source === "message");
  if (!a || a !== b || a.source !== "message" || typed.length < 2) return { a, b };

  const pa = new Map(args.ranked("a"));
  const pb = new Map(args.ranked("b"));
  let best = { a, b, p: -1 };
  for (const x of typed) {
    for (const y of typed) {
      const p = (pa.get(x.key) ?? 0) * (pb.get(y.key) ?? 0);
      if (x !== y && p > best.p) best = { a: x, b: y, p };
    }
  }
  return { a: best.a, b: best.b };
}

function calcExpression(r: z.infer<typeof calculateResult>): string {
  switch (r.op) {
    case "tip":
      return `${r.a}% tip on ${r.b}`;
    case "percent_of":
      return `${r.a}% of ${r.b}`;
    default:
      return r.text.split("=")[0].trim();
  }
}

export const calculate: SingleStepAdapter = {
  id: "units.calculate",
  server: "units",
  mcpName: "calculate",
  label: "Calculate",
  description: "Simple maths: add, subtract, multiply, divide, percentages, tips",
  examples: ["What's a 20% tip on $64?", "15% of 80"],
  questions: (p) => ({
    op: choiceQ("For a maths request: which operation is asked for?", OP_OPTIONS),
    a: candidateQ(
      "For a maths request: which number is the FIRST operand (for percentages and tips: the percentage)?",
      p.numbers,
      "No suitable number",
    ),
    b: candidateQ(
      "For a maths request: which number is the SECOND operand (for percentages and tips: the amount)?",
      p.numbers,
      "No suitable number",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    args.option("op");
    for (const [name, c] of Object.entries(operands(args, p.numbers))) {
      if (c) args.set(name, c.value, c.source, args.key(name));
    }
    return args.requireAll(["op", "a", "b"], "numbers", "Which numbers should I use?");
  },
  present(result) {
    const r = readResult(result, calculateResult, "calculate");
    if (!r) return rawFallback(result);
    // Only tips carry a total, and those are money.
    const formatted = r.total !== undefined ? r.result.toFixed(2) : String(r.result);
    return {
      text: r.text,
      card: {
        type: "calc",
        expression: calcExpression(r),
        result: formatted,
        detail: r.total !== undefined ? `Total with tip: ${r.total.toFixed(2)}` : undefined,
      },
      lastResult: {
        summary: r.text,
        items: [],
        numbers: [
          { value: r.result, label: "calculation result" },
          ...(r.total !== undefined ? [{ value: r.total, label: "total including tip" }] : []),
        ],
      },
    };
  },
};
