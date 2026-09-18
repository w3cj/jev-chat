import * as chrono from "chrono-node";
import nlp from "compromise";

import { NUMBER_RE } from "../../jev/pools.ts";
import type { BuiltQuestion } from "../../jev/questions.ts";
import { isPlace } from "../../tools/index.ts";

const MAX_FOLLOW_UP_WORDS = 6;
const MAX_BARE_WORDS = 3;
const BARE_START = /^the\s/i;
const COMMAND_VERB =
  /^(?:turn|make|set|add|show|find|search|remind|play|pause|dim|switch|open|close|lock|unlock|tell|give|get|put|mark|complete|delete|cancel|convert|calculate|check|list|book|change)\b/i;
const MAX_OPTIONS = 60;

// "what about", "and for", "same with", "now try it with", ...
const LEAD_IN =
  /^(?:and\s+)?(?:what|how)\s+about\s+|^(?:and|also|or)\s+(?:for\s+|in\s+|on\s+)?|^same\s+(?:for|with)\s+|^(?:now\s+)?(?:do|try)\s+(?:it\s+)?(?:for\s+|with\s+)?/i;
const EDGE_STOP = new Set(["the", "a", "an", "one", "ones", "please", "then", "instead", "too"]);

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function tidy(s: string): string {
  return s.replace(/[?.!]+$/, "").trim();
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The new content of a short follow-up, e.g. "What about the second one?" → "second". */
export function followUpContent(message: string): string | undefined {
  const text = tidy(message);
  const count = words(text).length;
  if (!text || count > MAX_FOLLOW_UP_WORDS) return undefined;
  if (!LEAD_IN.test(text) && (count > MAX_BARE_WORDS || !BARE_START.test(text))) return undefined;
  let rest = text.replace(LEAD_IN, "");
  let w = words(rest);
  while (w.length && EDGE_STOP.has(w[0].toLowerCase())) w = w.slice(1);
  while (w.length && EDGE_STOP.has(w[w.length - 1].toLowerCase())) w = w.slice(0, -1);
  rest = w.join(" ");
  if (COMMAND_VERB.test(rest)) return undefined;
  return rest || undefined;
}

export type Slot = "date" | "number" | "place";

const NUMBER_SPAN = new RegExp(`${NUMBER_RE.source}%?`, "g");

function trimEnd(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+$/u, "");
}

const SLOT_SPANS: Record<Slot, (text: string) => string[]> = {
  date: (text) => chrono.parse(text).map((r) => r.text),
  number: (text) => text.match(NUMBER_SPAN) ?? [],
  place: (text) => (nlp(text).places().out("array") as string[]).map(trimEnd),
};

const SLOTS = Object.keys(SLOT_SPANS) as Slot[];

function slotOf(content: string): Slot | undefined {
  const whole = SLOTS.find((slot) => {
    const spans = SLOT_SPANS[slot](content);
    return spans.length === 1 && same(spans[0], content);
  });
  return whole ?? (isPlace(content) ? "place" : undefined);
}

/**
 * The previous question with its one date, number or place swapped for new content of the same
 * kind. Undefined when the content is none of these, or the previous question doesn't have
 * exactly one other span of that kind.
 */
export function slotRewrite(
  previous: string,
  content: string,
): { slot: Slot; rewrite: string } | undefined {
  const slot = slotOf(content);
  if (!slot) return undefined;
  const prev = tidy(previous);
  const spans = SLOT_SPANS[slot](prev);
  if (spans.length !== 1 || same(spans[0], content)) return undefined;
  return { slot, rewrite: `${prev.replace(spans[0], content)}?` };
}

/**
 * Rewrites of the previous question: replace each 1–2 word span with the new content,
 * or append it (for "and tomorrow?" when the previous question had no time).
 */
export function rewriteOptions(previous: string, content: string): string[] {
  const prev = tidy(previous);
  const pw = words(prev);
  const out = new Set<string>();
  for (let size = 1; size <= 2; size++) {
    for (let i = 0; i + size <= pw.length; i++) {
      const replaced = pw.slice(i, i + size).join(" ");
      if (same(replaced, content)) continue;
      out.add(`${[...pw.slice(0, i), content, ...pw.slice(i + size)].join(" ")}?`);
    }
  }
  out.add(`${prev} ${content}?`);
  return [...out].slice(0, MAX_OPTIONS);
}

/** A Choice asking Jev which rewrite the follow-up means, with `as_is` for none of them. */
export function followUpQuestion(
  message: string,
  previous: string,
  options: string[],
): BuiltQuestion {
  const criteria: Record<string, string> = {
    as_is:
      "The latest message makes sense on its own, or none of these rewrites means the same thing",
  };
  const labels: Record<string, string> = { as_is: "use the message as-is" };
  for (const [i, o] of options.entries()) {
    criteria[`r${i + 1}`] = o;
    labels[`r${i + 1}`] = o;
  }
  return {
    question: {
      type: "choice",
      instructions: `The user previously asked "${previous}" and now says "${message}". If the latest message is a follow-up that only makes sense combined with the previous question, which rewrite says what the user now wants?`,
      criteria,
    },
    labels,
  };
}
