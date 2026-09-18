import type { Question } from "@typesafe-ai/sdk";

import type { JevAnswerJson } from "../shared/types.ts";
import type { Candidate } from "./pools.ts";

export const NONE = "none";

export interface BuiltQuestion {
  question: Question;
  /** option key → human label, for the inspector */
  labels?: Record<string, string>;
}

/** A Choice question; `options` maps each option key to the criterion Jev reads for it. */
export function choiceQ(
  instructions: string,
  options: Record<string, string | null>,
): BuiltQuestion {
  return { question: { type: "choice", instructions, criteria: options } };
}

/** A Noul question: a yes/no question Jev answers with the probability of yes. */
export function noulQ(instructions: string): BuiltQuestion {
  return { question: { type: "noul", instructions } };
}

/** A Choice whose options are candidate values; Jev picks a key, code keeps the value. */
export function candidateQ(
  instructions: string,
  options: Candidate<any>[],
  noneLabel = "None of these fits",
): BuiltQuestion {
  const criteria: Record<string, string> = {};
  const labels: Record<string, string> = {};
  for (const c of options) {
    criteria[c.key] = c.label;
    labels[c.key] = c.label;
  }
  criteria[NONE] = noneLabel;
  labels[NONE] = noneLabel;
  return { question: { type: "choice", instructions, criteria }, labels };
}

/** One tool's answers out of the shared request, recording each question read in `used`. */
export class Answers {
  constructor(
    private readonly answers: Record<string, JevAnswerJson>,
    private readonly prefix: string,
    private readonly used: Set<string>,
  ) {}

  /** The full question key in the shared request for this tool's question `name`. */
  key(name: string) {
    return `${this.prefix}__${name}`;
  }

  private read(name: string): JevAnswerJson | undefined {
    const k = this.key(name);
    this.used.add(k);
    return this.answers[k];
  }

  /** The picked option key; undefined for "none" or no answer. */
  choice(name: string): string | undefined {
    const c = this.read(name)?.choice;
    return c === NONE ? undefined : c;
  }

  /** A Choice's options with their probabilities, best first, without "none". */
  ranked(name: string): [key: string, probability: number][] {
    return ranked(this.read(name));
  }

  /** Probability of yes; 0 when unanswered. */
  noul(name: string): number {
    return this.read(name)?.noul ?? 0;
  }

  /** The pool entry Jev picked; undefined for "none" or no answer. */
  candidate<C extends Candidate<unknown>>(name: string, pool: C[]): C | undefined {
    const c = this.choice(name);
    return c ? pool.find((p) => p.key === c) : undefined;
  }
}

/** Question and option keys stay simple identifiers: "todoist.add-tasks" → "todoist_add_tasks" */
export function safeKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9]+/g, "_");
}

/** A Choice's real options with their probabilities, best first; "None of these" is dropped. */
export function ranked(answer: JevAnswerJson | undefined): [key: string, probability: number][] {
  return Object.entries(answer?.probabilities ?? {})
    .filter(([k]) => k !== NONE)
    .toSorted((x, y) => y[1] - x[1]);
}

/**
 * The second-best option when it is within `margin` of the best — i.e. when Jev didn't really
 * decide.
 */
export function runnerUp(answer: JevAnswerJson | undefined, margin: number): string | undefined {
  const [first, second] = ranked(answer);
  return first && second && first[1] - second[1] < margin ? second[0] : undefined;
}
