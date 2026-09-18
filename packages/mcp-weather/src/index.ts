#!/usr/bin/env node
import { defineTool, failure, serve, structured } from "@jev-chat/mcp-kit";
import { z } from "zod";

import { forecast, geocode, TEMP_UNITS, WHEN } from "./openmeteo.ts";

await serve("weather", "0.1.0", (server) => {
  defineTool(
    server,
    "get_weather",
    {
      title: "Weather",
      description: "Current conditions or forecast for a city (data: Open-Meteo, CC-BY 4.0).",
      inputSchema: {
        place: z
          .string()
          .describe("City name, optionally with region, e.g. 'Seattle' or 'Portland, Maine'"),
        when: z
          .enum(WHEN)
          .default("today")
          .describe(
            "Time window; this_weekend is the coming Saturday and Sunday, or just today on a Sunday",
          ),
        at: z
          .string()
          .optional()
          .describe(
            "With when='at_time': the time in the place's local time, e.g. 'in 2 hours', '5pm', 'saturday morning'",
          ),
        units: z
          .enum(TEMP_UNITS)
          .default("fahrenheit")
          .describe("Temperature unit (also sets wind speed to mph or km/h)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ place, when, at, units }) => {
      const found = await geocode(place);
      if (!found) return failure(`Couldn't find a place called "${place}".`);
      const out = await forecast(found, when, units, at);
      return structured(out.text, out);
    },
  );
});
