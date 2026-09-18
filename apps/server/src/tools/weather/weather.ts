import type { TempUnit, When } from "@jev-chat/mcp-weather/openmeteo";
import { z } from "zod";

import { DEFAULT_TEMP_UNIT } from "../../config.ts";
import { candidateQ, choiceQ } from "../../jev/questions.ts";
import { rawFallback, readResult, type SingleStepAdapter } from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";

const conditions = z.object({
  temperature: z.number(),
  feelsLike: z.number(),
  condition: z.string(),
  windSpeed: z.number(),
  humidity: z.number(),
});

const weatherResult = z.object({
  text: z.string(),
  when: z.string(),
  units: z.string(),
  degreeSymbol: z.string(),
  place: z.object({ name: z.string(), displayName: z.string() }),
  current: conditions,
  tonight: z
    .object({ low: z.number(), condition: z.string(), precipitationChance: z.number() })
    .optional(),
  hour: z
    .object({
      label: z.string(),
      temperature: z.number(),
      condition: z.string(),
      precipitationChance: z.number(),
    })
    .optional(),
  days: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      condition: z.string(),
      high: z.number(),
      low: z.number(),
      precipitationChance: z.number(),
      windMax: z.number(),
    }),
  ),
});

const WHEN_OPTIONS: Record<When, string> = {
  now: "Right now / current conditions",
  at_time: "A specific time or a few hours from now (in 2 hours, at 5pm, Saturday morning)",
  today: "Today (the default when no time is mentioned)",
  tonight: "Tonight / this evening",
  tomorrow: "Tomorrow",
  this_weekend: "This weekend (the coming Saturday and Sunday)",
  next_7_days: "The coming week / next few days",
};

const UNIT_OPTIONS: Record<TempUnit, string> = {
  fahrenheit:
    DEFAULT_TEMP_UNIT === "fahrenheit"
      ? "Fahrenheit (default)"
      : "Fahrenheit (only if the user asks for Fahrenheit / imperial)",
  celsius:
    DEFAULT_TEMP_UNIT === "celsius"
      ? "Celsius (default)"
      : "Celsius (only if the user asks for Celsius / metric)",
};

export const weather: SingleStepAdapter = {
  id: "weather.get_weather",
  server: "weather",
  mcpName: "get_weather",
  label: "Weather",
  description: "Weather forecast or current conditions for a city (temperature, rain, wind)",
  examples: ["What's the weather in Denver tomorrow?", "Will it rain this weekend?"],
  questions: (p) => ({
    place: candidateQ(
      "For a weather request: which city or place does the user want the weather for? If they don't name one, pick the place from the earlier request.",
      p.text,
      "No place is mentioned anywhere",
    ),
    when: choiceQ(
      "For a weather request: which time window does the user ask about?",
      WHEN_OPTIONS,
    ),
    at: candidateQ(
      "For a weather request at a specific time: which phrase says the time (e.g. 'in 2 hours', 'at 5pm', 'saturday morning')?",
      p.text,
      "No specific time is mentioned",
    ),
    units: choiceQ("For a weather request: which temperature unit should be used?", UNIT_OPTIONS),
  }),
  build(a, p, partial) {
    const args = new Args(a, partial);
    args.pick("place", p.text);
    const when = args.option("when", "today");
    if (when === "at_time") args.pick("at", p.text);
    args.option("units", DEFAULT_TEMP_UNIT);
    if (!args.has("place")) {
      return args.missing("place", "Which city should I check the weather for?");
    }
    if (when === "at_time" && !args.has("at")) {
      return args.missing("at", "What time should I check the weather for?");
    }
    return args.ok();
  },
  present(result) {
    const w = readResult(result, weatherResult, "get_weather");
    if (!w) return rawFallback(result);
    const temp = (value: number, what: string) => ({
      value,
      label: `${what} in ${w.place.name}, ${w.degreeSymbol}`,
      unit: w.units,
    });
    const numbers = [
      temp(w.current.temperature, "current temperature"),
      ...w.days.flatMap((d) => [
        temp(d.high, `high on ${d.label}`),
        temp(d.low, `low on ${d.label}`),
      ]),
    ];
    if (w.tonight) numbers.push(temp(w.tonight.low, "tonight's low"));
    if (w.hour) numbers.push(temp(w.hour.temperature, `temperature ${w.hour.label}`));
    return {
      text: w.text,
      card: {
        type: "weather",
        place: w.place.displayName,
        when: w.when,
        degreeSymbol: w.degreeSymbol,
        current: w.when === "now" ? w.current : undefined,
        tonight: w.tonight,
        hour: w.hour,
        days: w.when === "now" || w.tonight || w.hour ? [] : w.days,
      },
      lastResult: { summary: w.text, items: [], numbers },
    };
  },
};
