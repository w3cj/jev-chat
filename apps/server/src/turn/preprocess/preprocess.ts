import { HISTORY_FOR_PREPROCESSING } from "../../config.ts";
import { askJev } from "../../jev/client.ts";
import type { ConversationState, FollowUpTrace, SpellingTrace } from "../../shared/types.ts";
import { homeWords } from "../../tools/index.ts";
import { followUpContent, followUpQuestion, rewriteOptions, slotRewrite } from "./followup.ts";
import { applyCorrections, checkSpelling, spellingQuestions } from "./spelling.ts";

/** The index a `s1`/`r3`-style option key points at, or undefined for a "keep it" answer. */
function optionIndex(choice: string | undefined, keep: string): number | undefined {
  return choice && choice !== keep ? Number(choice.slice(1)) - 1 : undefined;
}

/**
 * Spell-check the message: sure fixes are applied directly, and for each other unknown word Jev
 * picks one of the dictionary's suggestions or keeps it. Undefined when nothing is found; throws
 * if the Jev request fails.
 */
export async function correctSpelling(
  message: string,
  state: ConversationState,
): Promise<SpellingTrace | undefined> {
  const { fixed, flagged } = await checkSpelling(message, state, homeWords());
  if (!fixed.length && !flagged.length) return undefined;

  const autoCorrected = applyCorrections(message, fixed);
  const autoWords: SpellingTrace["words"] = fixed.map((f) => ({
    word: f.word,
    suggestions: [f.replacement],
    replacement: f.replacement,
    decidedBy: f.reason,
  }));
  if (!flagged.length) return { original: message, corrected: autoCorrected, words: autoWords };

  const answer = await askJev(
    {
      latest_message: autoCorrected,
      conversation: state.recent.slice(-HISTORY_FOR_PREPROCESSING),
    },
    spellingQuestions(flagged),
  );
  if (!answer.ok) throw new Error(answer.error);

  const jevWords = flagged.map((f, i) => {
    const at = optionIndex(answer.answers[`word_${i + 1}`]?.choice, "keep");
    return {
      word: f.word,
      suggestions: f.suggestions,
      replacement: at === undefined ? undefined : f.suggestions[at],
      decidedBy: "jev" as const,
    };
  });
  return {
    original: message,
    corrected: applyCorrections(autoCorrected, jevWords),
    words: [...autoWords, ...jevWords],
    jev: answer.trace,
    optionLabels: answer.optionLabels,
  };
}

/**
 * Turn a short follow-up into a full question. A new date, number or place replaces the previous
 * question's one span of that kind; otherwise Jev picks one of the rewrites built from the
 * previous question, or keeps the message. Undefined when the message isn't a follow-up; throws
 * if the Jev request fails.
 */
export async function resolveFollowUp(
  message: string,
  state: ConversationState,
): Promise<FollowUpTrace | undefined> {
  const previous = state.recent[state.recent.length - 1];
  const content = followUpContent(message);
  if (!previous?.user || !content || state.pending) return undefined;

  const swapped = slotRewrite(previous.user, content);
  if (swapped) {
    return {
      original: message,
      previous: previous.user,
      resolved: swapped.rewrite,
      slot: swapped.slot,
    };
  }

  const options = rewriteOptions(previous.user, content);
  const answer = await askJev(
    {
      previous_question: previous.user,
      previous_answer: previous.assistant,
      latest_message: message,
    },
    { rewrite: followUpQuestion(message, previous.user, options) },
  );
  if (!answer.ok) throw new Error(answer.error);

  const at = optionIndex(answer.answers.rewrite?.choice, "as_is");
  const resolved = (at === undefined ? undefined : options[at]) ?? message;
  return {
    original: message,
    previous: previous.user,
    resolved,
    jev: answer.trace,
    optionLabels: answer.optionLabels,
  };
}
