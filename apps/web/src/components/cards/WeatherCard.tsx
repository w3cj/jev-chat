import type { ReactNode } from "react";

import type { CardComponent } from "./types.ts";

const WEATHER_ICON: [RegExp, string][] = [
  [/thunder/i, "⛈️"],
  [/snow/i, "🌨️"],
  [/rain|drizzle|shower/i, "🌧️"],
  [/fog/i, "🌫️"],
  [/overcast/i, "☁️"],
  [/partly|mostly/i, "⛅"],
  [/clear/i, "☀️"],
];

function conditionIcon(condition: string): string {
  return WEATHER_ICON.find(([re]) => re.test(condition))?.[1] ?? "🌡️";
}

/** A large icon beside a block of readings. */
function Reading({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-3">
      <span className="text-4xl">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

/**
 * Current conditions, one forecast hour, tonight's low, and a daily forecast (up to four columns
 * per row).
 */
export const WeatherCard: CardComponent<"weather"> = ({ card }) => (
  <div className="rounded-box border border-base-300 bg-base-200 p-4">
    <div className="text-sm font-semibold">{card.place}</div>
    {card.current && (
      <Reading icon={conditionIcon(card.current.condition)}>
        <div className="text-3xl font-bold">
          {card.current.temperature}
          {card.degreeSymbol}
        </div>
        <div className="text-sm">
          {card.current.condition} · feels like {card.current.feelsLike}
          {card.degreeSymbol} · wind {card.current.windSpeed}
        </div>
      </Reading>
    )}
    {card.hour && (
      <Reading icon={conditionIcon(card.hour.condition)}>
        <div className="text-xs font-medium capitalize">{card.hour.label}</div>
        <div className="text-3xl font-bold">
          {card.hour.temperature}
          {card.degreeSymbol}
        </div>
        <div className="text-sm">
          {card.hour.condition} · 💧 {card.hour.precipitationChance}%
        </div>
      </Reading>
    )}
    {card.tonight && (
      <Reading icon="🌙">
        <div className="text-2xl font-bold">
          Low {card.tonight.low}
          {card.degreeSymbol}
        </div>
        <div className="text-sm">
          {card.tonight.condition} · 💧 {card.tonight.precipitationChance}%
        </div>
      </Reading>
    )}
    {card.days.length > 0 && (
      <div
        className="mt-2 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(card.days.length, 4)}, minmax(0, 1fr))` }}
      >
        {card.days.map((d) => (
          <div key={d.date} className="rounded-lg bg-base-300 p-2 text-center">
            <div className="text-xs font-medium">{d.label}</div>
            <div className="text-2xl">{conditionIcon(d.condition)}</div>
            <div className="text-sm font-semibold">
              {d.high}° / {d.low}°
            </div>
            <div className="text-xs">{d.condition}</div>
            <div className="text-xs text-base-content/60">💧 {d.precipitationChance}%</div>
          </div>
        ))}
      </div>
    )}
    <div className="mt-2 text-[10px] text-base-content/50">Weather data by Open-Meteo.com</div>
  </div>
);

/** A calculation: the expression, its result, and optional detail. */
export const CalcCard: CardComponent<"calc"> = ({ card }) => (
  <div className="stats bg-base-200">
    <div className="stat">
      <div className="stat-title">{card.expression}</div>
      <div className="stat-value text-2xl">{card.result}</div>
      {card.detail && <div className="stat-desc">{card.detail}</div>}
    </div>
  </div>
);
