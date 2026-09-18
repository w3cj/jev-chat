import type { EntryType } from "@typesafe-ai/sdk";

import { HISTORY_FOR_TURN } from "../config.ts";
import type { Pools } from "../jev/pools.ts";
import { choiceQ, safeKey, type BuiltQuestion } from "../jev/questions.ts";
import { SERVER_LABELS, type ConversationState, type Pending } from "../shared/types.ts";
import { ADAPTERS, type Adapter } from "../tools/index.ts";

/** Options for the `request_kind` question: what the latest message is doing. */
export const REQUEST_KINDS = {
  new_request: "A new request for something the assistant can look up or do",
  answers_pending: "Answers the question the assistant just asked (see pending)",
  confirm_yes: "Says yes / go ahead to the confirmation the assistant is waiting on",
  cancel: "Says no, cancel, never mind, or stop",
  chat: "Greeting, thanks, small talk, or asks what the assistant can do",
  unsupported:
    "Asks for something none of the assistant's tools can do (e.g. book flights, write a poem)",
};

/** What the assistant is waiting on, phrased so Jev can tell an answer from a new request. */
function describePending(p: Pending): string {
  if (p.type === "confirm") return `Waiting for the user to confirm: ${p.prompt}`;
  if (p.type === "ask") return `The assistant asked: "${p.prompt}" (about "${p.message}")`;
  return `The assistant asked the user to choose: ${p.prompt}`;
}

/** The conversation as Jev sees it: the latest message plus just enough of what came before. */
export function describeState(message: string, state: ConversationState): EntryType {
  const [newest, ...earlier] = state.results ?? [];
  return {
    latest_message: message,
    conversation: state.recent.slice(-HISTORY_FOR_TURN),
    ...(newest
      ? {
          shown_results: {
            from: newest.label,
            summary: newest.summary,
            items: newest.items.map(
              (it, i) => `#${i + 1}: ${it.title}${it.subtitle ? ` — ${it.subtitle}` : ""}`,
            ),
            numbers: newest.numbers.map((n) => `${n.value} (${n.label})`),
          },
        }
      : {}),
    ...(earlier.length ? { earlier_results: earlier.map((r) => `${r.label}: ${r.summary}`) } : {}),
    ...(state.pending ? { pending: describePending(state.pending) } : {}),
  };
}

export interface BuiltRequest {
  questions: Record<string, BuiltQuestion>;
  /** The option key each tool was offered under, so an answer maps back to its adapter. */
  toolKeys: Map<string, Adapter>;
}

/**
 * The questions for a turn's main Jev request: what kind of message this is, which tool fits, and
 * every tool's argument questions, keyed `<safeKey(tool id)>__<name>`.
 */
export function buildRequest(pools: Pools): BuiltRequest {
  const questions: Record<string, BuiltQuestion> = {
    request_kind: choiceQ("What is the latest message doing?", REQUEST_KINDS),
  };

  const toolKeys = new Map<string, Adapter>();
  const toolOptions: Record<string, string> = {};
  for (const a of ADAPTERS) {
    const key = safeKey(a.id);
    toolKeys.set(key, a);
    toolOptions[key] = `${SERVER_LABELS[a.server]}: ${a.description}`;
  }
  toolOptions.none = "None of these tools (chat, or something unsupported)";
  questions.tool = {
    ...choiceQ(
      "Which tool would fulfil the user's latest request (taking the conversation into account)?",
      toolOptions,
    ),
    labels: Object.fromEntries(Object.keys(toolOptions).map((k) => [k, toolKeys.get(k)?.id ?? k])),
  };

  for (const a of ADAPTERS) {
    const prefix = safeKey(a.id);
    for (const [name, q] of Object.entries(a.questions(pools))) questions[`${prefix}__${name}`] = q;
  }
  return { questions, toolKeys };
}
