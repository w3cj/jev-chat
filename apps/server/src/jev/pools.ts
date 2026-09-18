import * as chrono from "chrono-node";
import nlp from "compromise";

import type { ConversationState, ShownItem, ShownNumber } from "../shared/types.ts";

/** One candidate value Jev can pick. The option key goes to Jev; code keeps the value. */
export interface Candidate<T = string> {
  key: string;
  value: T;
  label: string;
  source: string;
}

/** A number Jev can pick; `shown` is the earlier result's number it came from, if any. */
export interface NumberCandidate extends Candidate<number> {
  shown?: ShownNumber;
}

/** A device or room a smart-home tool can act on. */
export type HomeTarget = { kind: "name" | "area"; value: string; domain?: string };

/** The options Jev is allowed to pick from. */
export interface Pools {
  /**
   * Phrases from the latest message (and a pending question's message), titles from the newest
   * result, and short string arguments of recent results.
   */
  text: Candidate[];
  /** Numbers in the message, then those of recent results, newest first. */
  numbers: NumberCandidate[];
  /** Items of the newest result only, so "the first one" has one meaning. */
  items: Candidate<ShownItem>[];
  homeTargets: Candidate<HomeTarget>[];
}

const STOP = new Set(
  `a an the and or but to of in on at for with by from about as is are was were be been it its this that these those
   i me my we our you your he she they them what whats what's how hows how's when where which who whom why will would can could should
   please pls hey hi hello ok okay so just also too then than there here do does did doing any some all
   set turn put make give tell show find search look up add remind reminder list get check going go need want like
   today tomorrow tonight now`.split(/\s+/),
);
const DATE_WORDS = new Set(["today", "tomorrow", "tonight", "now"]);

const MAX_SPANS = 150;
const MAX_WORDS = 7;

/**
 * Date and time phrases in the message ("in 2 hours", "noon tomorrow"), then its contiguous word
 * spans trimmed of stop words at the edges.
 */
export function messageSpans(message: string): string[] {
  const words = message
    .replace(/[“”"]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}$#@]+|[^\p{L}\p{N}%]+$/gu, ""))
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  };

  for (const w of words) if (DATE_WORDS.has(w.toLowerCase())) push(w.toLowerCase());
  for (const r of chrono.parse(message)) push(r.text);

  for (let n = Math.min(MAX_WORDS, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const span = words.slice(i, i + n);
      const first = span[0].toLowerCase();
      const last = span[span.length - 1].toLowerCase();
      if (STOP.has(first) || STOP.has(last)) continue;
      push(span.join(" "));
    }
  }
  return out.slice(0, MAX_SPANS);
}

/** A number as typed: optional minus (ASCII or Unicode) and `$`, thousands commas, decimals. */
export const NUMBER_RE = /[-−]?\$?\d+(?:,\d{3})*(?:\.\d+)?/g;

/** `one` standing for a thing ("that one", "the first one", "which one") rather than a count. */
const PRONOUN_ONE = "(#Determiner|#Adjective|#Ordinal|#QuestionWord|no) [one]";

/** Numbers written as words ("six", "twenty six", "a hundred and twelve") with where they start. */
function wordNumbers(message: string): { at: number; value: number }[] {
  // compromise types `match` and `not` as returning its base View, which lacks `numbers`.
  const runs = nlp(message)
    .not(PRONOUN_ONE, 0)
    .match("#Cardinal+ (and #Cardinal+)?")
    .not("#NumericValue") as ReturnType<typeof nlp>;
  return runs
    .numbers()
    .json({ offset: true })
    .map((n: { number: { num: number }; offset: { start: number } }) => ({
      at: n.offset.start,
      value: n.number.num,
    }));
}

/**
 * Distinct numbers in the message in the order they appear, reading `$`, thousands commas, a
 * Unicode minus and numbers written as words.
 */
export function messageNumbers(message: string): number[] {
  const typed = [...message.matchAll(NUMBER_RE)].map((m) => ({
    at: m.index,
    value: Number(m[0].replace(/[$,]/g, "").replace("−", "-")),
  }));
  const out: number[] = [];
  for (const { value } of [...typed, ...wordNumbers(message)].toSorted((a, b) => a.at - b.at)) {
    if (Number.isFinite(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Everything Jev may choose from this turn. */
export function buildPools(
  message: string,
  state: ConversationState,
  homeTargets: Candidate<HomeTarget>[] = [],
): Pools {
  const spans = messageSpans(message);
  const text: Candidate[] = [];
  const seenText = new Set<string>();
  const addText = (raw: string, source: string) => {
    const value = raw.trim();
    const k = value.toLowerCase();
    if (!k || seenText.has(k)) return;
    seenText.add(k);
    text.push({ key: `t${text.length}`, value, label: value, source });
  };

  const results = state.results ?? [];
  const newest = results[0];

  for (const s of spans) addText(s, "message");
  for (const item of newest?.items ?? []) addText(item.title, "earlier result");
  for (const v of results.flatMap((r) => Object.values(r.args))) {
    if (typeof v === "string" && v.length < 80) addText(v, "earlier request");
  }
  if (state.pending?.type === "ask") {
    for (const s of messageSpans(state.pending.message)) addText(s, "earlier message");
  }

  const numbers: NumberCandidate[] = [];
  for (const n of messageNumbers(message)) {
    numbers.push({
      key: `n${numbers.length}`,
      value: n,
      label: `${n} (in the message)`,
      source: "message",
    });
  }
  for (const sn of results.flatMap((r) => r.numbers)) {
    const label = `${sn.value} (${sn.label})`;
    if (numbers.some((c) => c.label === label)) continue;
    numbers.push({
      key: `n${numbers.length}`,
      value: sn.value,
      label,
      source: "earlier result",
      shown: sn,
    });
  }

  const items: Candidate<ShownItem>[] = (newest?.items ?? []).map((item, i) => ({
    key: `i${i + 1}`,
    value: item,
    label: `#${i + 1}: ${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`,
    source: "earlier result",
  }));

  const targets = homeTargets.length
    ? homeTargets
    : spans.map((s, i) => ({
        key: `a${i}`,
        value: { kind: "name" as const, value: s },
        label: s,
        source: "message",
      }));

  return { text, numbers, items, homeTargets: targets };
}
