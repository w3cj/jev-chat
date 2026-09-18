import { describe, expect, it } from "vitest";

import { buildArgs, runBuild, textResult, toolResult } from "../kit/testkit.ts";
import { weather } from "./weather.ts";

const MESSAGE = "What's the weather in Seattle tomorrow?";

const forecast = {
  text: "Seattle Friday, Sep 18: Light rain, high 61°F, low 48°F, 70% chance of rain.",
  when: "tomorrow",
  units: "fahrenheit",
  degreeSymbol: "°F",
  place: { name: "Seattle", displayName: "Seattle, Washington" },
  current: { temperature: 55, feelsLike: 53, condition: "Overcast", windSpeed: 6, humidity: 81 },
  days: [
    {
      date: "2026-09-18",
      label: "Friday, Sep 18",
      condition: "Light rain",
      high: 61,
      low: 48,
      precipitationChance: 70,
      windMax: 11,
    },
  ],
};

describe("weather.build", () => {
  it("takes the place from the message and the window from the options", () => {
    expect(
      buildArgs(weather, {
        message: MESSAGE,
        answers: { place: "Seattle", when: "tomorrow", units: "fahrenheit" },
      }),
    ).toEqual({
      place: "Seattle",
      when: "tomorrow",
      units: "fahrenheit",
    });
  });

  it("defaults the window to today when Jev picks no option", () => {
    expect(
      buildArgs(weather, {
        message: "What's the weather in Denver?",
        answers: { place: "Denver" },
      }),
    ).toMatchObject({ when: "today" });
  });

  it("asks for the place rather than guessing one", () => {
    const { result } = runBuild(weather, {
      message: "What's the weather?",
      answers: { when: "today" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("place");
  });

  it("passes the time phrase for a specific time", () => {
    expect(
      buildArgs(weather, {
        message: "What's the weather in Denver in 2 hours?",
        answers: { place: "Denver", when: "at_time", at: "in 2 hours" },
      }),
    ).toMatchObject({ place: "Denver", when: "at_time", at: "in 2 hours" });
  });

  it("asks for the time when a specific time was meant but none was picked", () => {
    const { result } = runBuild(weather, {
      message: "What's the weather in Denver later?",
      answers: { place: "Denver", when: "at_time" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("at");
  });

  it("records where the place came from", () => {
    const { result } = runBuild(weather, {
      message: MESSAGE,
      answers: { place: "Seattle", when: "tomorrow" },
    });
    expect(result.sources[0]).toMatchObject({ name: "place", value: "Seattle", source: "message" });
  });
});

describe("weather.present", () => {
  it("builds a forecast card and exposes every temperature for follow-ups", () => {
    const out = weather.present(toolResult(forecast), { when: "tomorrow" });
    expect(out.card).toMatchObject({ type: "weather", place: "Seattle, Washington" });
    expect(out.text).toBe(forecast.text);
    expect(out.lastResult?.numbers.map((n) => n.value)).toEqual(expect.arrayContaining([61, 48]));
  });

  it("shows current conditions instead of days when the question was about now", () => {
    const out = weather.present(toolResult({ ...forecast, when: "now" }), { when: "now" });
    expect(out.card).toMatchObject({ type: "weather", current: { temperature: 55 }, days: [] });
  });

  it("falls back to the tool's own text when the result doesn't match the expected shape", () => {
    const out = weather.present(textResult('Couldn\'t find a place called "Atlantis".'), {});
    expect(out.card?.type).toBe("error");
    expect(out.text).toMatch(/Atlantis/);
  });
});
