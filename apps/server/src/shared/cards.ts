import type { ShownItem } from "./state.ts";

export interface WeatherDay {
  date: string;
  label: string;
  condition: string;
  high: number;
  low: number;
  precipitationChance: number;
  windMax: number;
}

/** A structured reply the web app renders, one variant per kind of answer. */
export type Card =
  | {
      type: "weather";
      place: string;
      when: string;
      degreeSymbol: string;
      current?: {
        temperature: number;
        feelsLike: number;
        condition: string;
        windSpeed: number;
        humidity: number;
      };
      tonight?: { low: number; condition: string; precipitationChance: number };
      hour?: { label: string; temperature: number; condition: string; precipitationChance: number };
      days: WeatherDay[];
    }
  | { type: "calc"; expression: string; result: string; detail?: string }
  | { type: "search_results"; query: string; items: ShownItem[] }
  | { type: "tasks"; heading: string; items: (ShownItem & { priority?: string; due?: string })[] }
  /** Smart-home devices and their current state. */
  | { type: "device_status"; heading: string; items: ShownItem[] }
  | { type: "action"; title: string; lines: string[]; ok: boolean }
  | {
      type: "confirm";
      title: string;
      tool: string;
      args: { name: string; value: string }[];
      confirmLabel: string;
      destructive: boolean;
    }
  | { type: "choices"; options: { value: string; label: string; description?: string }[] }
  | { type: "capabilities"; servers: { label: string; examples: string[]; connected: boolean }[] }
  | {
      type: "quote";
      question: string;
      article: string;
      url: string;
      section?: string;
      quote?: string;
      lineNumber?: number;
      confidence?: number;
      /** Runner-up line when Jev's top two picks are close */
      also?: string;
      fallback?: string;
    }
  | {
      type: "answer";
      question: string;
      answerType: string;
      /** Values found by code in the sources and accepted by Jev, with Jev's score */
      answers: { value: string; score: number }[];
      evidence?: { text: string; source: string; url: string; title: string; confidence?: number };
      sources: { title: string; url: string; source: string }[];
    }
  | {
      type: "recipes";
      heading: string;
      meals: { id: string; name: string; thumbnail: string; category?: string; cuisine?: string }[];
    }
  | {
      type: "recipe";
      name: string;
      thumbnail: string;
      category?: string;
      cuisine?: string;
      ingredients: { ingredient: string; measure: string }[];
      steps: string[];
      youtube?: string;
      source?: string;
    }
  | { type: "error"; message: string };

export type CardType = Card["type"];
