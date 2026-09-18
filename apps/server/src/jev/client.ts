import { TypeSafeClient, type EntryType, type Questions } from "@typesafe-ai/sdk";

import { errorMessage } from "../lib/errors.ts";
import type { JevAnswerJson, JevTrace } from "../shared/types.ts";
import type { BuiltQuestion } from "./questions.ts";

/** The Jev model every request uses: `TYPESAFE_MODEL`, or jev-latest when unset or blank. */
export const JEV_MODEL = process.env.TYPESAFE_MODEL?.trim() || "jev-latest";

/** Question key → (option key → human label), for the inspector. */
export type OptionLabels = Record<string, Record<string, string>>;

const NO_KEY = "TYPESAFE_API_KEY is not set";

let client: TypeSafeClient | undefined;
function connect(): TypeSafeClient | null {
  if (!process.env.TYPESAFE_API_KEY?.trim()) return null;
  client ??= new TypeSafeClient({ defaultModel: JEV_MODEL, timeout: 15_000 });
  return client;
}

/** Whether `TYPESAFE_API_KEY` is set, i.e. Jev requests can actually be sent. */
export function jevConfigured(): boolean {
  return !!connect();
}

/** Split the questions a caller built into the map the SDK wants and the labels the inspector wants. */
export function flattenQuestions(built: Record<string, BuiltQuestion>) {
  const questions: Questions = {};
  const optionLabels: OptionLabels = {};
  for (const [key, q] of Object.entries(built)) {
    questions[key] = q.question;
    if (q.labels) optionLabels[key] = q.labels;
  }
  return { questions, optionLabels };
}

export type JevResult = { trace: JevTrace; optionLabels: OptionLabels } & (
  | { ok: true; answers: Record<string, JevAnswerJson> }
  | { ok: false; error: string }
);

/** Ask Jev a set of questions about some state. Never throws: a failure comes back in the trace. */
export async function askJev(
  state: EntryType,
  built: Record<string, BuiltQuestion>,
): Promise<JevResult> {
  const { questions, optionLabels } = flattenQuestions(built);
  const request = { model: JEV_MODEL, state, questions };
  const started = performance.now();
  const since = () => Math.round(performance.now() - started);

  const jev = connect();
  if (!jev) {
    return { ok: false, error: NO_KEY, optionLabels, trace: { request, error: NO_KEY, ms: 0 } };
  }

  try {
    const response = await jev.systemOne(request);
    const answers = response.answers as unknown as Record<string, JevAnswerJson>;
    return {
      ok: true,
      answers,
      optionLabels,
      trace: {
        request,
        response: { model: response.model, answers, usage: { ...response.usage } },
        ms: since(),
      },
    };
  } catch (err) {
    const error = errorMessage(err);
    return { ok: false, error, optionLabels, trace: { request, error, ms: since() } };
  }
}
