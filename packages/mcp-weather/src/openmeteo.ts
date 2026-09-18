import { fetchJson } from "@jev-chat/mcp-kit";
import * as chrono from "chrono-node";
import { z } from "zod";

export const WHEN = [
  "now",
  "at_time",
  "today",
  "tonight",
  "tomorrow",
  "this_weekend",
  "next_7_days",
] as const;
export type When = (typeof WHEN)[number];
export const TEMP_UNITS = ["fahrenheit", "celsius"] as const;
export type TempUnit = (typeof TEMP_UNITS)[number];

const CODES: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

/** A short description of a WMO weather code, as Open-Meteo reports them. */
export function condition(code: number): string {
  return CODES[code] ?? "Unknown";
}

const DAY_LABEL: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" };

export interface Place {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** The Open-Meteo response fields this server reads. */
const geocodeResponse = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        admin1: z.string().optional(),
        country: z.string().optional(),
        country_code: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().optional(),
      }),
    )
    .default([]),
});

const numbers = z.array(z.number().nullable()).default([]);

const forecastResponse = z.object({
  utc_offset_seconds: z.number(),
  current: z.object({
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    relative_humidity_2m: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()).default([]),
    temperature_2m: numbers,
    precipitation_probability: numbers,
    weather_code: numbers,
  }),
  daily: z.object({
    time: z.array(z.string()).default([]),
    weather_code: numbers,
    temperature_2m_max: numbers,
    temperature_2m_min: numbers,
    precipitation_probability_max: numbers,
    wind_speed_10m_max: numbers,
  }),
});
type ForecastResponse = z.infer<typeof forecastResponse>;

/**
 * The best match for a place name. Text after a comma (a region, country or country code) picks
 * among same-named places.
 */
export async function geocode(query: string): Promise<Place | undefined> {
  // "Portland, OR" → search "Portland"; Open-Meteo matches on the city name only
  const [name, region] = query.split(",");
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(name.trim())}`;
  const { results } = await fetchJson(url, geocodeResponse, {
    service: "Open-Meteo",
    request: "Geocoding",
  });
  const hint = region?.trim().toLowerCase();
  const match =
    (hint &&
      results.find((x) =>
        [x.admin1, x.country, x.country_code].some((v) => v?.toLowerCase().startsWith(hint)),
      )) ||
    results[0];
  if (!match) return undefined;
  return {
    name: match.name,
    region: match.admin1,
    country: match.country,
    latitude: match.latitude,
    longitude: match.longitude,
    timezone: match.timezone ?? "auto",
  };
}

export interface Day {
  date: string;
  label: string;
  condition: string;
  high: number;
  low: number;
  precipitationChance: number;
  windMax: number;
}

function weekday(day: Day): number {
  return new Date(`${day.date}T12:00:00`).getDay();
}

export interface Hour {
  time: string;
  label: string;
  temperature: number;
  condition: string;
  precipitationChance: number;
}

/**
 * The forecast hour nearest to a time phrase like "in 2 hours" or "saturday at 5pm", read as the
 * place's local time. Throws when the phrase isn't a time or falls outside the forecast.
 */
export function hourAt(d: ForecastResponse, at: string, now = new Date()): Hour {
  const offsetMs = d.utc_offset_seconds * 1000;
  const parsed = chrono.parseDate(
    at,
    { instant: now, timezone: offsetMs / 60_000 },
    { forwardDate: true },
  );
  if (!parsed) throw new Error(`Couldn't tell what time "${at}" means.`);
  // Hourly times are local wall-clock strings like "2026-09-18T16:00"; +30 min rounds to the nearest hour.
  const local = new Date(parsed.getTime() + offsetMs + 30 * 60_000).toISOString().slice(0, 13);
  const time = `${local}:00`;
  const i = d.hourly.time.indexOf(time);
  if (i < 0) throw new Error("I only have hourly forecasts for the next 7 days.");

  const date = new Date(`${time}:00`);
  const clock = date.toLocaleTimeString("en-US", { hour: "numeric" });
  const day = date.toLocaleDateString("en-US", DAY_LABEL);
  return {
    time,
    label: time.startsWith(d.daily.time[0]) ? `today at ${clock}` : `${day} at ${clock}`,
    temperature: Math.round(d.hourly.temperature_2m[i] ?? 0),
    condition: condition(d.hourly.weather_code[i] ?? 0),
    precipitationChance: d.hourly.precipitation_probability[i] ?? 0,
  };
}

export interface Tonight {
  low: number;
  condition: string;
  precipitationChance: number;
}

/** The hours from 6pm on `today` through 9am on `tomorrow`, summarised. */
function tonightFrom(d: ForecastResponse, today: string, tomorrow: string): Tonight {
  const idx = d.hourly.time
    .map((t, i) => [t, i] as const)
    .filter(
      ([t]) => (t.startsWith(today) && t.slice(11, 13) >= "18") || t.startsWith(`${tomorrow}T0`),
    )
    .map(([, i]) => i);
  return {
    low: Math.round(Math.min(...idx.map((i) => d.hourly.temperature_2m[i] ?? 0))),
    condition: condition(d.hourly.weather_code[idx[Math.floor(idx.length / 2)]] ?? 0),
    precipitationChance: Math.max(...idx.map((i) => d.hourly.precipitation_probability[i] ?? 0)),
  };
}

/**
 * Current conditions and the forecast for `when` at `place`, with a prose summary in `text`.
 * `at` is the time phrase for `when: "at_time"`.
 */
export async function forecast(place: Place, when: When, units: TempUnit, at?: string) {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: place.timezone,
    temperature_unit: units,
    wind_speed_unit: units === "fahrenheit" ? "mph" : "kmh",
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    forecast_days: "8",
  });
  const d = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`, forecastResponse, {
    service: "Open-Meteo",
    request: "Forecast",
  });

  const days: Day[] = d.daily.time.map((date, i) => ({
    date,
    label: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", DAY_LABEL),
    // Open-Meteo sends null for a measurement it has no value for; treat it as zero.
    condition: condition(d.daily.weather_code[i] ?? 0),
    high: Math.round(d.daily.temperature_2m_max[i] ?? 0),
    low: Math.round(d.daily.temperature_2m_min[i] ?? 0),
    precipitationChance: d.daily.precipitation_probability_max[i] ?? 0,
    windMax: Math.round(d.daily.wind_speed_10m_max[i] ?? 0),
  }));

  const deg = units === "fahrenheit" ? "°F" : "°C";
  const windUnit = units === "fahrenheit" ? "mph" : "km/h";
  const current = {
    temperature: Math.round(d.current.temperature_2m),
    feelsLike: Math.round(d.current.apparent_temperature),
    condition: condition(d.current.weather_code),
    windSpeed: Math.round(d.current.wind_speed_10m),
    humidity: d.current.relative_humidity_2m,
  };

  let selected: Day[];
  let tonight: Tonight | undefined;
  let hour: Hour | undefined;
  switch (when) {
    case "now":
    case "today":
      selected = days.slice(0, 1);
      break;
    case "at_time": {
      if (!at) throw new Error("Which time should I check the weather for?");
      const h = hourAt(d, at);
      hour = h;
      selected = days.filter((x) => h.time.startsWith(x.date));
      break;
    }
    case "tonight":
      tonight = tonightFrom(d, days[0].date, days[1].date);
      selected = days.slice(0, 1);
      break;
    case "tomorrow":
      selected = days.slice(1, 2);
      break;
    case "this_weekend": {
      const start = days.findIndex((x) => weekday(x) === 0 || weekday(x) === 6);
      selected =
        start < 0 ? [] : days.slice(start, weekday(days[start]) === 6 ? start + 2 : start + 1);
      break;
    }
    case "next_7_days":
      selected = days.slice(0, 7);
      break;
  }

  const placeName = [place.name, place.region].filter(Boolean).join(", ");
  let text: string;
  if (when === "now") {
    text = `${placeName} now: ${current.condition}, ${current.temperature}${deg} (feels like ${current.feelsLike}${deg}), wind ${current.windSpeed} ${windUnit}.`;
  } else if (hour) {
    text = `${placeName} ${hour.label}: ${hour.condition}, ${hour.temperature}${deg}, ${hour.precipitationChance}% chance of rain.`;
  } else if (tonight) {
    text = `${placeName} tonight: ${tonight.condition}, low ${tonight.low}${deg}, ${tonight.precipitationChance}% chance of rain.`;
  } else {
    text = selected
      .map(
        (x) =>
          `${placeName} ${x.label}: ${x.condition}, high ${x.high}${deg}, low ${x.low}${deg}, ${x.precipitationChance}% chance of rain.`,
      )
      .join("\n");
  }

  return {
    place: { ...place, displayName: placeName },
    when,
    units,
    degreeSymbol: deg,
    current,
    tonight,
    hour,
    days: selected,
    text,
  };
}
