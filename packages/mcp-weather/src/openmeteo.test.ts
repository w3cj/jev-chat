import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forecast, geocode, hourAt } from "./openmeteo.ts";

const DENVER_OFFSET = -6 * 3600;
const NOW = new Date("2026-09-18T20:15:00Z");

const hours = Array.from({ length: 48 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 18, i));
  return d.toISOString().slice(0, 16);
});

const response = {
  utc_offset_seconds: DENVER_OFFSET,
  current: {
    temperature_2m: 78,
    apparent_temperature: 78,
    weather_code: 3,
    wind_speed_10m: 1,
    relative_humidity_2m: 35,
  },
  hourly: {
    time: hours,
    temperature_2m: hours.map((_, i) => 50 + i),
    precipitation_probability: hours.map(() => 10),
    weather_code: hours.map(() => 2),
  },
  daily: {
    time: ["2026-09-18", "2026-09-19"],
    weather_code: [3, 3],
    temperature_2m_max: [84, 78],
    temperature_2m_min: [60, 55],
    precipitation_probability_max: [29, 58],
    wind_speed_10m_max: [16, 17],
  },
};

describe("hourAt", () => {
  it("reads a relative time from now in the place's local time, rounded to the hour", () => {
    expect(hourAt(response, "in 2 hours", NOW)).toMatchObject({
      time: "2026-09-18T16:00",
      label: "today at 4 PM",
      temperature: 66,
      condition: "Partly cloudy",
      precipitationChance: 10,
    });
  });

  it("reads a clock time as the place's local time", () => {
    expect(hourAt(response, "5pm", NOW).time).toBe("2026-09-18T17:00");
  });

  it("names the day for an hour after today", () => {
    expect(hourAt(response, "saturday at 9am", NOW)).toMatchObject({
      time: "2026-09-19T09:00",
      label: "Saturday, Sep 19 at 9 AM",
    });
  });

  it("throws for a phrase that isn't a time", () => {
    expect(() => hourAt(response, "banana", NOW)).toThrow(/what time/);
  });

  it("throws for a time outside the forecast", () => {
    expect(() => hourAt(response, "in 3 weeks", NOW)).toThrow(/next 7 days/);
  });
});

const DENVER = {
  name: "Denver",
  region: "Colorado",
  country: "United States",
  latitude: 39.74,
  longitude: -104.98,
  timezone: "America/Denver",
};

/** Stub Open-Meteo: geocoding answers with `places`, the forecast API with `response`. */
function stubOpenMeteo(places: object[] = []) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
    Response.json((input as string).includes("geocoding-api") ? { results: places } : response),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const requestedUrl = (fetch: ReturnType<typeof stubOpenMeteo>) =>
  new URL(fetch.mock.calls[0][0] as string);

describe("geocode", () => {
  afterEach(() => vi.unstubAllGlobals());

  const portlands = [
    {
      name: "Portland",
      admin1: "Oregon",
      country: "United States",
      country_code: "US",
      latitude: 45.5,
      longitude: -122.7,
      timezone: "America/Los_Angeles",
    },
    {
      name: "Portland",
      admin1: "Maine",
      country: "United States",
      country_code: "US",
      latitude: 43.7,
      longitude: -70.3,
      timezone: "America/New_York",
    },
    {
      name: "Portland",
      admin1: "Victoria",
      country: "Australia",
      country_code: "AU",
      latitude: -38.3,
      longitude: 141.6,
    },
  ];

  it("searches the name before the comma and takes the best match", async () => {
    const fetch = stubOpenMeteo(portlands);
    expect(await geocode("Portland")).toEqual({
      name: "Portland",
      region: "Oregon",
      country: "United States",
      latitude: 45.5,
      longitude: -122.7,
      timezone: "America/Los_Angeles",
    });
    await geocode("Portland, Maine");
    expect(requestedUrl(fetch).searchParams.get("name")).toBe("Portland");
  });

  it("picks among same-named places by region, country or country code", async () => {
    stubOpenMeteo(portlands);
    expect((await geocode("Portland, maine"))?.region).toBe("Maine");
    expect((await geocode("Portland, Australia"))?.region).toBe("Victoria");
    expect((await geocode("Portland, AU"))?.region).toBe("Victoria");
    expect((await geocode("Portland, Narnia"))?.region).toBe("Oregon");
  });

  it("lets Open-Meteo pick the timezone when the place has none", async () => {
    stubOpenMeteo(portlands);
    expect((await geocode("Portland, Victoria"))?.timezone).toBe("auto");
  });

  it("returns undefined when nothing matches", async () => {
    stubOpenMeteo([]);
    expect(await geocode("Atlantis")).toBeUndefined();
    vi.stubGlobal("fetch", async () => Response.json({}));
    expect(await geocode("Atlantis")).toBeUndefined();
  });

  it("throws when Open-Meteo fails or answers in an unexpected shape", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));
    await expect(geocode("Denver")).rejects.toThrow("Geocoding failed (500)");
    vi.stubGlobal("fetch", async () => Response.json({ results: [{ name: "Denver" }] }));
    await expect(geocode("Denver")).rejects.toThrow(/Unexpected Open-Meteo response/);
  });
});

describe("forecast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks for the place's forecast in the chosen units", async () => {
    const fetch = stubOpenMeteo();
    await forecast(DENVER, "today", "celsius");
    const params = requestedUrl(fetch).searchParams;
    expect(params.get("latitude")).toBe("39.74");
    expect(params.get("timezone")).toBe("America/Denver");
    expect(params.get("temperature_unit")).toBe("celsius");
    expect(params.get("wind_speed_unit")).toBe("kmh");
  });

  it("describes current conditions for now", async () => {
    stubOpenMeteo();
    const out = await forecast(DENVER, "now", "fahrenheit");
    expect(out).toMatchObject({
      place: { ...DENVER, displayName: "Denver, Colorado" },
      degreeSymbol: "°F",
      current: {
        temperature: 78,
        feelsLike: 78,
        condition: "Overcast",
        windSpeed: 1,
        humidity: 35,
      },
      days: [{ date: "2026-09-18" }],
    });
    expect(out.text).toBe("Denver, Colorado now: Overcast, 78°F (feels like 78°F), wind 1 mph.");
    const celsius = await forecast(DENVER, "now", "celsius");
    expect(celsius.text).toBe(
      "Denver, Colorado now: Overcast, 78°C (feels like 78°C), wind 1 km/h.",
    );
  });

  it("summarises each selected day", async () => {
    stubOpenMeteo();
    const today = await forecast(DENVER, "today", "fahrenheit");
    expect(today.days).toEqual([
      {
        date: "2026-09-18",
        label: "Friday, Sep 18",
        condition: "Overcast",
        high: 84,
        low: 60,
        precipitationChance: 29,
        windMax: 16,
      },
    ]);
    expect(today.text).toBe(
      "Denver, Colorado Friday, Sep 18: Overcast, high 84°F, low 60°F, 29% chance of rain.",
    );
    expect((await forecast(DENVER, "tomorrow", "fahrenheit")).text).toBe(
      "Denver, Colorado Saturday, Sep 19: Overcast, high 78°F, low 55°F, 58% chance of rain.",
    );
    expect((await forecast(DENVER, "this_weekend", "fahrenheit")).days.map((x) => x.date)).toEqual([
      "2026-09-19",
    ]);
    const week = await forecast(DENVER, "next_7_days", "fahrenheit");
    expect(week.text.split("\n")).toHaveLength(2);
  });

  it("takes the coming Saturday and Sunday for this weekend, or just today on a Sunday", async () => {
    const weekendFrom = async (first: number) => {
      const time = Array.from({ length: 8 }, (_, i) => `2026-09-${first + i}`);
      const daily = Object.fromEntries(
        Object.keys(response.daily).map((k) => [k, time.map((_, i) => i)]),
      );
      vi.stubGlobal("fetch", async () => Response.json({ ...response, daily: { ...daily, time } }));
      return (await forecast(DENVER, "this_weekend", "fahrenheit")).days.map((x) => x.date);
    };
    expect(await weekendFrom(14)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(await weekendFrom(19)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(await weekendFrom(20)).toEqual(["2026-09-20"]);
  });

  it("reads tonight from the hours between 6pm and the next morning", async () => {
    stubOpenMeteo();
    const out = await forecast(DENVER, "tonight", "fahrenheit");
    expect(out.tonight).toEqual({ low: 68, condition: "Partly cloudy", precipitationChance: 10 });
    expect(out.text).toBe("Denver, Colorado tonight: Partly cloudy, low 68°F, 10% chance of rain.");
  });

  it("reads the hour for a time phrase", async () => {
    stubOpenMeteo();
    const out = await forecast(DENVER, "at_time", "fahrenheit", "in 2 hours");
    expect(out.hour).toMatchObject({ time: "2026-09-18T16:00", label: "today at 4 PM" });
    expect(out.days.map((x) => x.date)).toEqual(["2026-09-18"]);
    expect(out.text).toBe(
      "Denver, Colorado today at 4 PM: Partly cloudy, 66°F, 10% chance of rain.",
    );
  });

  it("needs a time phrase for at_time", async () => {
    stubOpenMeteo();
    await expect(forecast(DENVER, "at_time", "fahrenheit")).rejects.toThrow(/Which time/);
  });
});
