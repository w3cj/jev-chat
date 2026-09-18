import nlp from "compromise";
import {
  constructSettingsForText,
  finalizeSettings,
  getDefaultSettings,
  getDictionary,
  mergeSettings,
} from "cspell-lib";

import type { BuiltQuestion } from "../../jev/questions.ts";
import type { ConversationState } from "../../shared/types.ts";
import { isPlace } from "../../tools/index.ts";

const MAX_SUGGESTIONS = 4;
const MAX_FLAGGED = 6;
/** cspell charges about 100 per edit, plus a point or two for a case or accent change. */
const ONE_EDIT = 150;
const NOT_WORDS = new Set([
  "ProperNoun",
  "Acronym",
  "Url",
  "Email",
  "HashTag",
  "AtMention",
  "Emoji",
]);
const TENS = new Set([
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
]);
const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** Whether `b` is `a` with one letter added, removed or changed, or two neighbours swapped. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (a[i] === b[i]) i++;
  if (a.length === b.length) {
    const swapped = a[i] === b[i + 1] && a[i + 1] === b[i];
    return a.slice(i + 1) === b.slice(i + 1) || (swapped && a.slice(i + 2) === b.slice(i + 2));
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

type Dictionary = Awaited<ReturnType<typeof getDictionary>>;
let loading: Promise<Dictionary> | undefined;

/** cspell's English, company and software dictionaries, including its common-misspellings list. */
function dictionary(): Promise<Dictionary> {
  loading ??= getDefaultSettings().then((defaults) =>
    getDictionary(
      finalizeSettings(
        constructSettingsForText(
          mergeSettings(defaults, { language: "en-US", words: ["TheMealDB"] }),
          undefined,
          "plaintext",
        ),
      ),
    ),
  );
  return loading;
}

export interface FlaggedWord {
  word: string;
  suggestions: string[];
}

export interface FixedWord {
  word: string;
  replacement: string;
  reason: "common misspelling" | "only close match";
}

export interface SpellingCheck {
  /** Corrected without asking Jev. */
  fixed: FixedWord[];
  /** Left for Jev to pick a suggestion or keep the word. */
  flagged: FlaggedWord[];
}

/** Suggestions best first, in the case the dictionary spells them, one per word. */
function suggestionsFor(dict: Dictionary, word: string) {
  const seen = new Set<string>();
  return dict
    .suggest(word, { numSuggestions: MAX_SUGGESTIONS * 2 })
    .filter((s) => {
      const key = s.word.toLowerCase();
      if (seen.has(key) || !dict.has(s.word, { ignoreCase: false })) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Check each word of the message. A listed common misspelling with one fix, or a lowercase word
 * with a single suggestion one edit away, is fixed; other unknown words are flagged with
 * suggestions. A word one edit from "one"…"nine" is flagged even when it's a real word if it
 * follows "twenty"…"ninety" or a word that may be corrected to one. Names, acronyms, links, words
 * in `fromTools`, items of recent results and place names count as known.
 */
export async function checkSpelling(
  message: string,
  state: ConversationState,
  fromTools: string[] = [],
): Promise<SpellingCheck> {
  const dict = await dictionary();
  const known = new Set<string>();
  const addKnown = (text: string | undefined) => {
    for (const w of text?.match(/[\p{L}'’]+/gu) ?? []) known.add(w.toLowerCase());
  };
  for (const name of fromTools) addKnown(name);
  for (const item of (state.results ?? []).flatMap((r) => r.items)) {
    addKnown(`${item.title} ${item.subtitle ?? ""}`);
  }

  const out: SpellingCheck = { fixed: [], flagged: [] };
  const seen = new Set<string>();
  const sentences: { terms: { text: string; tags: string[] }[] }[] = nlp(message).json();
  const terms = sentences.flatMap((s) => s.terms);
  const couldBeTens = (word = "") =>
    TENS.has(word) ||
    out.fixed.some((f) => f.word.toLowerCase() === word && TENS.has(f.replacement)) ||
    out.flagged.some(
      (f) => f.word.toLowerCase() === word && f.suggestions.some((s) => TENS.has(s)),
    );
  for (const [i, term] of terms.entries()) {
    const word = term.text.replace(/['’]s$/, "");
    const lower = word.toLowerCase();
    if (word.length < 3 || !/^\p{L}[\p{L}'’]*$/u.test(word)) continue;
    if (seen.has(lower) || known.has(lower) || isPlace(word)) continue;
    if (term.tags.some((t) => NOT_WORDS.has(t))) continue;
    seen.add(lower);

    const units = couldBeTens(terms[i - 1]?.text.toLowerCase())
      ? UNITS.filter((u) => oneEditApart(lower, u))
      : [];
    const preferred = (dict.getPreferredSuggestions?.(word) ?? []).map((s) => s.word);
    if (units.length) {
      out.flagged.push({ word, suggestions: units });
    } else if (preferred.length === 1) {
      out.fixed.push({ word, replacement: preferred[0], reason: "common misspelling" });
    } else if (preferred.length) {
      out.flagged.push({ word, suggestions: preferred.slice(0, MAX_SUGGESTIONS) });
    } else if (!dict.has(word)) {
      const suggestions = suggestionsFor(dict, word);
      const close = suggestions.filter((s) => s.cost < ONE_EDIT);
      if (close.length === 1 && word === lower) {
        out.fixed.push({ word, replacement: close[0].word, reason: "only close match" });
      } else if (suggestions.length) {
        out.flagged.push({ word, suggestions: suggestions.map((s) => s.word) });
      }
    }
    if (out.flagged.length >= MAX_FLAGGED) break;
  }
  return out;
}

/** One Choice per flagged word: a suggestion, or keep it as typed. */
export function spellingQuestions(flagged: FlaggedWord[]): Record<string, BuiltQuestion> {
  const questions: Record<string, BuiltQuestion> = {};
  for (const [i, f] of flagged.entries()) {
    const criteria: Record<string, string> = {
      keep: `Keep "${f.word}" as typed (it's spelled right, it's a name, or none of these fit)`,
    };
    const labels: Record<string, string> = { keep: `keep "${f.word}"` };
    for (const [j, s] of f.suggestions.entries()) {
      criteria[`s${j + 1}`] = s;
      labels[`s${j + 1}`] = s;
    }
    questions[`word_${i + 1}`] = {
      question: {
        type: "choice",
        instructions: `The word "${f.word}" in the latest message may be misspelled. Given what the user is asking for, which word did they mean?`,
        criteria,
      },
      labels: { ...labels, subject: f.word },
    };
  }
  return questions;
}

/** Apply each pick that has a replacement; keeps a leading capital from the original. */
export function applyCorrections(
  message: string,
  picks: { word: string; replacement?: string }[],
): string {
  let out = message;
  for (const { word, replacement } of picks) {
    if (!replacement) continue;
    const re = new RegExp(`(?<![\\p{L}'’])${RegExp.escape(word)}(?![\\p{L}])`, "gu");
    out = out.replace(re, (orig) =>
      /^\p{Lu}/u.test(orig) && /^\p{Ll}/u.test(replacement)
        ? replacement[0].toUpperCase() + replacement.slice(1)
        : replacement,
    );
  }
  return out;
}
