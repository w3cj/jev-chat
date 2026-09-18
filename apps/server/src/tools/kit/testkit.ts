import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { buildPools, type Pools } from "../../jev/pools.ts";
import { Answers, NONE, safeKey, type BuiltQuestion } from "../../jev/questions.ts";
import type { ConversationState, JevAnswerJson } from "../../shared/types.ts";
import { homeTargetsFrom, type HomeCatalog } from "../index.ts";
import type { Adapter, BuildResult, Presented, RunContext } from "./adapter.ts";

export const NO_HOME: HomeCatalog = { areas: [], entities: [] };

/**
 * What each question should answer. A string names a Choice option (by key, label, or a unique
 * label prefix); a number is a Noul probability; a boolean is shorthand for a confident yes/no Noul.
 */
export type AnswerSpec = Record<string, string | number | boolean>;

export interface BuildCase {
  message: string;
  answers: AnswerSpec;
  state?: ConversationState;
  home?: HomeCatalog;
  partial?: Record<string, unknown>;
}

function choiceKey(
  criteria: Record<string, unknown>,
  labels: Record<string, string> | undefined,
  want: string,
) {
  const entries = Object.entries(criteria);
  const describe = () => entries.map(([k, l]) => `${k}=${String(l)}`).join(" | ");

  const exact = entries.find(
    ([key, label]) => key === want || label === want || labels?.[key] === want,
  );
  if (exact) return exact[0];

  const prefixed = entries.filter(
    ([, label]) => typeof label === "string" && label.startsWith(want),
  );
  if (prefixed.length === 1) return prefixed[0][0];
  if (prefixed.length > 1) {
    throw new Error(`"${want}" matches ${prefixed.length} options: ${describe()}`);
  }
  throw new Error(`No option matching "${want}". Options: ${describe()}`);
}

function noulProbability(want: string | number | boolean | undefined): number {
  if (typeof want === "number") return want;
  return want === true ? 0.95 : 0.02;
}

/** Answer a question map the way the fake Jev would, keying the answers however the caller needs. */
function answerQuestions(
  questions: Record<string, BuiltQuestion>,
  spec: AnswerSpec,
  keyOf: (name: string) => string,
  who: string,
) {
  const unknown = Object.keys(spec).filter((name) => !(name in questions));
  if (unknown.length) {
    throw new Error(
      `${who} has no question(s) named: ${unknown.join(", ")}. Asked: ${Object.keys(questions).join(", ")}`,
    );
  }

  const answers: Record<string, JevAnswerJson> = {};
  for (const [name, built] of Object.entries(questions)) {
    const want = spec[name];
    if (built.question.type === "noul") {
      answers[keyOf(name)] = { type: "noul", noul: noulProbability(want) };
      continue;
    }
    const criteria = (built.question as { criteria?: Record<string, unknown> }).criteria ?? {};
    const choice = want === undefined ? NONE : choiceKey(criteria, built.labels, String(want));
    const keys = Object.keys(criteria);
    answers[keyOf(name)] = {
      type: "choice",
      choice,
      confidence: 0.9,
      probabilities: Object.fromEntries(
        keys.map((k) => [k, k === choice ? 0.9 : 0.1 / Math.max(1, keys.length - 1)]),
      ),
    };
  }
  return answers;
}

/**
 * Run an adapter's `build()` with a fake Jev that picks one option key per question.
 *
 * Tests name the option they want by its key, its label or a unique label prefix (a text candidate's
 * label is its value, so "Seattle" just works). An unnamed Choice answers "none"; an unnamed Noul, no.
 */
export function runBuild(
  adapter: Adapter,
  c: BuildCase,
): { result: BuildResult; pools: Pools; used: Set<string> } {
  const state = c.state ?? { recent: [] };
  const pools = buildPools(c.message, state, homeTargetsFrom(c.home ?? NO_HOME, state));
  const prefix = safeKey(adapter.id);
  const raw = answerQuestions(
    adapter.questions(pools),
    c.answers,
    (name) => `${prefix}__${name}`,
    adapter.id,
  );

  const used = new Set<string>();
  return { result: adapter.build(new Answers(raw, prefix, used), pools, c.partial), pools, used };
}

/** The build's arguments, or a clear failure — for the common case where the test expects success. */
export function buildArgs(adapter: Adapter, c: BuildCase) {
  const { result } = runBuild(adapter, c);
  if (!result.ok) {
    throw new Error(
      `${adapter.id} asked for "${result.missing}" instead of building: ${result.prompt}`,
    );
  }
  return result.args;
}

/** A successful MCP result carrying `structuredContent`, as the adapters' `present()` expects. */
export function toolResult(structuredContent: unknown, text = "ok"): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: structuredContent as Record<string, unknown>,
  };
}

/** A result with only text, as a server returns when it has no structured output (or a bad shape). */
export function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

/** One JSON object per text block, as the Brave search server returns its results. */
export function jsonResult(...objects: unknown[]): CallToolResult {
  return { content: objects.map((o) => ({ type: "text", text: JSON.stringify(o) })) };
}

export interface RunCase {
  message: string;
  /** Canned MCP result per tool name. */
  results: Record<string, CallToolResult>;
  /**
   * Answers per Jev request inside the run, in the order the tool asks them. Each entry names
   * options for that request's questions, exactly like `BuildCase.answers`.
   */
  asks: AnswerSpec[];
}

export interface RunLog {
  calls: { tool: string; args: Record<string, unknown> }[];
  asks: { title: string; state: unknown; questions: string[] }[];
}

/** Drive a multi-step adapter's `run()` with canned tool results and canned Jev picks. */
export async function runMultiStep(
  adapter: Adapter,
  args: Record<string, unknown>,
  c: RunCase,
): Promise<{ presented: Presented; log: RunLog }> {
  if (!adapter.run) throw new Error(`${adapter.id} is not a multi-step tool`);
  const log: RunLog = { calls: [], asks: [] };
  let askIndex = 0;

  const ctx: RunContext = {
    message: c.message,
    async call(tool, callArgs) {
      log.calls.push({ tool, args: callArgs });
      const result = c.results[tool];
      if (!result) {
        throw new Error(
          `No canned result for "${tool}". Have: ${Object.keys(c.results).join(", ")}`,
        );
      }
      return result;
    },
    async ask(title, state, questions) {
      const spec = c.asks[askIndex++];
      if (!spec) {
        throw new Error(
          `${adapter.id} made ${askIndex} Jev requests but only ${c.asks.length} were provided (at "${title}")`,
        );
      }
      log.asks.push({ title, state, questions: Object.keys(questions) });
      return answerQuestions(questions, spec, (name) => name, `${adapter.id} step "${title}"`);
    },
  };

  return { presented: await adapter.run(args, ctx), log };
}
