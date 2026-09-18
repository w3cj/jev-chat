#!/usr/bin/env node
import { defineTool, serve, structured } from "@jev-chat/mcp-kit";
import { z } from "zod";

import { calculate, convert, OPS, UNITS } from "./units.ts";

await serve("units", "0.1.0", (server) => {
  defineTool(
    server,
    "convert_units",
    {
      title: "Convert units",
      description:
        "Convert a value between units of temperature, length, weight, volume or speed (e.g. 350 fahrenheit to celsius, 5 miles to kilometers).",
      inputSchema: {
        value: z.number().describe("The number to convert"),
        from: z.enum(UNITS).describe("Unit the value is in"),
        to: z.enum(UNITS).describe("Unit to convert to"),
      },
      outputSchema: {
        value: z.number(),
        from: z.string(),
        result: z.number(),
        to: z.string(),
        text: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ value, from, to }) => {
      const out = convert(value, from, to);
      return structured(out.text, out);
    },
  );

  defineTool(
    server,
    "calculate",
    {
      title: "Calculate",
      description:
        "Simple maths on two numbers: add, subtract, multiply, divide, percent_of (a% of b), tip (a% tip on b, with total).",
      inputSchema: {
        op: z.enum(OPS).describe("Operation"),
        a: z.number().describe("First number (the percentage for percent_of and tip)"),
        b: z.number().describe("Second number (the amount for percent_of and tip)"),
      },
      outputSchema: {
        op: z.string(),
        a: z.number(),
        b: z.number(),
        result: z.number(),
        total: z.number().optional(),
        text: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ op, a, b }) => {
      const out = calculate(op, a, b);
      return structured(out.text, out);
    },
  );
});
