import type { Card } from "@jev-chat/server/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeatherCard } from "./WeatherCard.tsx";

type Weather = Extract<Card, { type: "weather" }>;

function render(card: Partial<Weather>): string {
  return renderToStaticMarkup(
    <WeatherCard
      card={{
        type: "weather",
        place: "Denver",
        when: "now",
        degreeSymbol: "°F",
        days: [],
        ...card,
      }}
      interactive={false}
      busy={false}
      onAction={() => {}}
    />,
  );
}

describe("WeatherCard", () => {
  it("shows current conditions with an icon matched from the condition", () => {
    const html = render({
      current: {
        temperature: 50,
        feelsLike: 47,
        condition: "Light rain",
        windSpeed: 9,
        humidity: 80,
      },
    });

    expect(html).toContain("🌧️");
    expect(html).toContain("50°F");
    expect(html).toContain("Light rain · feels like 47");
  });

  it("shows one forecast hour and tonight's low", () => {
    const html = render({
      hour: { label: "at 3 pm", temperature: 61, condition: "Clear sky", precipitationChance: 5 },
      tonight: { low: 40, condition: "Overcast", precipitationChance: 20 },
    });

    expect(html).toContain("☀️");
    expect(html).toContain("at 3 pm");
    expect(html).toContain("Clear sky · 💧 5%");
    expect(html).toContain("🌙");
    expect(html).toContain("Low 40°F");
    expect(html).toContain("Overcast · 💧 20%");
  });

  it("falls back to a thermometer for unknown conditions", () => {
    const html = render({
      days: [
        {
          date: "2026-09-18",
          label: "Fri",
          high: 70,
          low: 50,
          condition: "Haze",
          precipitationChance: 0,
          windMax: 5,
        },
      ],
    });

    expect(html).toContain("🌡️");
    expect(html).toContain("repeat(1, minmax(0, 1fr))");
  });
});
