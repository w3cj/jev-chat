import * as chrono from "chrono-node";
import nlp from "compromise";
import he from "he";

import { hostOf } from "../kit/adapter.ts";
import { isPlace } from "./places.ts";

export const ANSWER_TYPES = {
  people: "A person or people (who hosts, who founded, who wrote, who plays)",
  number: "A number or amount (how tall, how many, how much, price, population)",
  date: "A date or year (when was, what year, release date)",
  place: "A place (where is, where was, which city or country)",
  other: "Something else (a description, a reason, a yes/no)",
} as const;
export type AnswerType = keyof typeof ANSWER_TYPES;

export interface SourceSentence {
  n: number;
  text: string;
  source: string;
  url: string;
  title: string;
}

export interface ScoredAnswer {
  value: string;
  score: number;
}

export interface SearchResult {
  url: string;
  title: string;
  description?: string;
  extra_snippets?: string[];
}

/** Search markup to plain text: tags stripped, then entities decoded, whitespace collapsed. */
export function cleanHtml(s: string): string {
  return he
    .decode(s.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_SENTENCES = 60;
const MAX_SENTENCE_CHARS = 300;

/** Search result descriptions and extra snippets as numbered sentences, each tied to its source. */
export function resultSentences(results: SearchResult[]): SourceSentence[] {
  const out: SourceSentence[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const host = hostOf(r.url);
    for (const chunk of [r.description, ...(r.extra_snippets ?? [])]) {
      if (!chunk) continue;
      for (const raw of nlp(cleanHtml(chunk)).sentences().out("array") as string[]) {
        const text = raw.replace(/^\.\.\.\s*|\s*…$/g, "").trim();
        if (text.length < 30 || seen.has(text)) continue;
        seen.add(text);
        out.push({
          n: out.length + 1,
          text: text.slice(0, MAX_SENTENCE_CHARS),
          source: host,
          url: r.url,
          title: cleanHtml(r.title),
        });
        if (out.length >= MAX_SENTENCES) return out;
      }
    }
  }
  return out;
}

const NOT_NAME = new Set(
  `The A An And Or But In On At Of For With By From To As Is Are Was Were It Its This That These Those He She They We You I My Our Your His Her Their
   Full Stack Web Development Developer Developers Podcast Podcasts Episode Episodes Show Notes Listen Watch Apple Spotify Amazon YouTube Music Google
   Technology News Home About Contact Official Site Website Senior Creator Host Hosts Co Founder CEO President Monday Tuesday Wednesday Thursday Friday
   Saturday Sunday January February March April May June July August September October November December Mr Mrs Ms Dr`.split(
    /\s+/,
  ),
);

function countInto<T extends string>(map: Map<T, number>, key: T): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function top(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/**
 * The most frequent 2- and 3-word windows of capitalised runs, skipping windows with non-name
 * words and anything that reads as a place.
 */
export function findPeople(sentences: SourceSentence[], max = 16): string[] {
  const counts = new Map<string, number>();
  // \b is ASCII-only even under /u, so a letter lookbehind stands in for it.
  const RUN = /(?<!\p{L})\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)+/gu;
  for (const s of sentences) {
    for (const m of s.text.matchAll(RUN)) {
      const possessive = m[0].search(/['’]s\b/);
      const run = possessive > 0 ? m[0].slice(0, possessive) : m[0];
      let words = run.split(/\s+/);
      while (words.length && NOT_NAME.has(words[0])) words = words.slice(1);
      while (words.length && NOT_NAME.has(words[words.length - 1])) words = words.slice(0, -1);
      if (words.length < 2) continue;
      for (let size = 2; size <= 3; size++) {
        for (let i = 0; i + size <= words.length; i++) {
          const w = words.slice(i, i + size);
          if (w.some((x) => NOT_NAME.has(x))) continue;
          countInto(counts, w.join(" "));
        }
      }
    }
  }
  for (const span of counts.keys()) if (isPlace(span)) counts.delete(span);
  return top(counts, max);
}

const UNIT_WORDS =
  /^(?:%|(?:ft|feet|foot|m|meters?|metres?|km|kilometers?|kilometres?|mi|miles?|inches|cm|kg|kilograms?|lbs?|pounds?|tons?|tonnes?|°[CF]|degrees?|percent|people|residents|users|employees|subscribers|episodes|copies|years?|days?|hours?|minutes?|million|billion|trillion|thousand|dollars?|USD|EUR|euros?)\b)/i;

/** What can follow a magnitude word: "2 million copies", never "$1.5 million m". */
const COUNTED_THING =
  /^(?:people|residents|users|employees|subscribers|episodes|copies|dollars?|euros?|USD|EUR|years?|tons?|tonnes?|miles?|feet|meters?|metres?|kilometers?|kilometres?|pounds?)\b/i;

/**
 * Numbers with an optional currency symbol and any following unit ("14,406 ft", "$4.5 million",
 * "42%").
 */
export function findNumbers(sentences: SourceSentence[], max = 20): string[] {
  const counts = new Map<string, number>();
  const NUM = /([$€£¥]\s?)?\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|([$€£¥]\s?)?\b\d+(?:\.\d+)?\b/g;
  for (const s of sentences) {
    for (const m of s.text.matchAll(NUM)) {
      const after = s.text.slice((m.index ?? 0) + m[0].length).trimStart();
      const unit = after.match(UNIT_WORDS)?.[0];
      const second =
        unit && /^(million|billion|trillion|thousand)$/i.test(unit)
          ? after.slice(unit.length).trimStart().match(COUNTED_THING)?.[0]
          : undefined;
      countInto(counts, unit === "%" ? `${m[0]}%` : [m[0], unit, second].filter(Boolean).join(" "));
    }
  }
  return top(counts, max);
}

/**
 * What a number candidate is actually worth, magnitude words included ("$4.5 million" is 4500000),
 * or undefined when the span holds no number.
 */
export function numericValue(span: string): number | undefined {
  // .get() returns a bare object rather than an empty array when the span holds no number
  const found = nlp(span).numbers().get() as unknown;
  const value = Array.isArray(found) ? found[0] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

/** A year on its own, or a month and a year. */
const LOOSE_DATE = new RegExp(`\\b(?:(?:${MONTHS})\\.?\\s+)?(?:1[0-9]|20)\\d{2}\\b`, "g");

/** chrono's match includes a leading preposition ("on 23 September 1889"). */
const DATE_LEAD = /^(?:on|in|at|from|since|by|during|of)\s+/i;
function tidyDate(text: string): string {
  return text
    .replace(DATE_LEAD, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

/** Dates stated in the sources: full ones via chrono, plus bare years and month-years. */
export function findDates(sentences: SourceSentence[], max = 20): string[] {
  const counts = new Map<string, number>();
  for (const s of sentences) {
    for (const found of chrono.strict.parse(s.text)) countInto(counts, tidyDate(found.text));
    for (const m of s.text.matchAll(LOOSE_DATE)) countInto(counts, m[0]);
  }
  counts.delete("");
  return top(counts, max);
}

/**
 * Every 1–3 word window of each capitalised run in a sentence, sliced out verbatim.
 *
 * @yields Each window's text, with a trailing `.` or `,` trimmed.
 */
function* capitalisedSpans(text: string): Generator<string> {
  const RUN = /(?<!\p{L})\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*)*/gu;
  for (const run of text.matchAll(RUN)) {
    const words = [...run[0].matchAll(/\p{Lu}[\p{L}'’.-]*/gu)].map((w) => ({
      start: run.index + w.index,
      end: run.index + w.index + w[0].length,
      text: w[0],
    }));
    for (let size = 1; size <= 3; size++) {
      for (let i = 0; i + size <= words.length; i++) {
        const window = words.slice(i, i + size);
        if (window.some((w) => NOT_NAME.has(w.text))) continue;
        const span = text
          .slice(window[0].start, window[window.length - 1].end)
          .replace(/[.,]$/, "");
        if (span.length > 1) yield span;
      }
    }
  }
}

/** Place candidates: recognised places first, then by frequency, then shorter first. */
export function findPlaces(sentences: SourceSentence[], max = 20): string[] {
  const counts = new Map<string, number>();
  for (const s of sentences) for (const span of capitalisedSpans(s.text)) countInto(counts, span);
  return [...counts.entries()]
    .toSorted(
      ([aSpan, aCount], [bSpan, bCount]) =>
        Number(isPlace(bSpan)) - Number(isPlace(aSpan)) ||
        bCount - aCount ||
        aSpan.length - bSpan.length,
    )
    .slice(0, max)
    .map(([span]) => span);
}

/** Candidates for an answer type, from the matching finder; empty for `other`. */
export function findCandidates(type: AnswerType, sentences: SourceSentence[]): string[] {
  switch (type) {
    case "people":
      return findPeople(sentences);
    case "number":
      return findNumbers(sentences);
    case "date":
      return findDates(sentences);
    case "place":
      return findPlaces(sentences);
    default:
      return [];
  }
}

/** Words of a span, lowercased and stripped of possessives, for overlap comparison. */
function norm(v: string): string[] {
  return v
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/\s+/);
}

/**
 * Keep accepted people without overlapping junk spans ("Wes Bos Scott" next to "Wes Bos").
 * Candidates sharing a word compete: the higher score wins; near-ties go to the shorter span.
 */
export function dedupeOverlapping(scored: ScoredAnswer[]): ScoredAnswer[] {
  const ordered = scored.toSorted((a, b) => {
    if (Math.abs(a.score - b.score) > 0.05) return b.score - a.score;
    return a.value.split(" ").length - b.value.split(" ").length;
  });
  const kept: ScoredAnswer[] = [];
  for (const c of ordered) {
    const words = new Set(norm(c.value));
    const overlaps = kept.some((k) => norm(k.value).some((w) => words.has(w)));
    if (!overlaps) kept.push(c);
  }
  return kept;
}
