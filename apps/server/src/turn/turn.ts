import { CLOSE_MARGIN, CONFIDENT } from "../config.ts";
import { askJev, jevConfigured } from "../jev/client.ts";
import { buildPools } from "../jev/pools.ts";
import { Answers, ranked, safeKey } from "../jev/questions.ts";
import { errorMessage } from "../lib/errors.ts";
import { callHomeTool, isConnected, statusOf } from "../mcp/clients.ts";
import {
  SERVER_LABELS,
  type Card,
  type ConversationState,
  type FollowUpTrace,
  type Pending,
  type ServerId,
  type SpellingTrace,
  type Trace,
} from "../shared/types.ts";
import {
  ADAPTERS,
  adapterById,
  ensureHomeCatalog,
  homeTargetPool,
  type Adapter,
} from "../tools/index.ts";
import { describeArgs, execute, isDestructive } from "./execute.ts";
import type { TurnOutput, UntimedTurn } from "./outcome.ts";
import { correctSpelling, resolveFollowUp } from "./preprocess/preprocess.ts";
import { buildRequest, describeState } from "./request.ts";

export type { TurnOutput } from "./outcome.ts";
export { JEV_MODEL } from "../jev/client.ts";

export type TurnInput =
  | {
      kind: "message";
      text: string;
      /** Run the spell-check step; defaults to on */
      spellcheck?: boolean;
    }
  | { kind: "action"; type: "confirm" | "cancel" }
  | { kind: "action"; type: "pick"; value: string };

function capabilitiesCard(): Card {
  const byServer = new Map<ServerId, string[]>();
  for (const a of ADAPTERS) {
    byServer.set(a.server, [...(byServer.get(a.server) ?? []), ...a.examples.slice(0, 1)]);
  }
  return {
    type: "capabilities",
    servers: [...byServer.entries()].map(([server, examples]) => ({
      label: SERVER_LABELS[server],
      examples,
      connected: statusOf(server)?.status === "connected",
    })),
  };
}

function chatReply(message: string): string {
  const m = message.toLowerCase();
  if (/\b(thanks|thank you|cheers|ty)\b/.test(m)) return "You're welcome!";
  if (/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(m)) {
    return "Hi! Here's what I can help with:";
  }
  return "I handle quick commands and lookups. Here's what I can do:";
}

const STALE_CONFIRMATION = "That confirmation is no longer valid — please ask again.";
const UNSUPPORTED = "Sorry, I can't do that yet. Here's what I can help with:";

/**
 * Handle one typed message or button click: decide whether to run a tool, ask, confirm, offer a
 * choice, or just reply, and return the reply with its new state and trace.
 */
export async function handleTurn(input: TurnInput, state: ConversationState): Promise<TurnOutput> {
  const started = performance.now();
  const finish = (out: UntimedTurn): TurnOutput => ({
    ...out,
    trace: { ...out.trace, totalMs: Math.round(performance.now() - started) },
  });

  if (input.kind === "message") {
    return handleMessage(input.text, state, started, { spellcheck: input.spellcheck });
  }

  const pending = state.pending;
  if (input.type === "cancel" || !pending) {
    return finish({
      text: pending ? "Okay, cancelled." : "Nothing to do.",
      state: { ...state, pending: undefined },
      trace: { usedQuestions: [], decision: { outcome: "cancel", reason: "User clicked cancel" } },
    });
  }
  if (input.type === "confirm" && pending.type === "confirm") {
    return finish(await resumeConfirmed(pending, state, {}, "User clicked confirm"));
  }
  if (input.type === "pick" && pending.type === "choose" && pending.options.includes(input.value)) {
    return handleMessage(pending.message, { ...state, pending: undefined }, started, {
      forcedTool: input.value,
    });
  }
  return finish({
    text: "That button has expired.",
    state,
    trace: { usedQuestions: [], decision: { outcome: "error", reason: "Stale action" } },
  });
}

/** Run a confirmation the user agreed to, or reply with an error if its tool no longer exists. */
async function resumeConfirmed(
  pending: Extract<Pending, { type: "confirm" }>,
  state: ConversationState,
  base: Partial<Trace>,
  reason: string,
  requestKind?: string,
): Promise<UntimedTurn> {
  const cleared = { ...state, pending: undefined };
  const adapter = adapterById(pending.toolId);
  if (!adapter) {
    return {
      text: STALE_CONFIRMATION,
      state: cleared,
      trace: {
        ...base,
        usedQuestions: [],
        decision: {
          outcome: "error",
          reason: `Pending tool "${pending.toolId}" no longer exists`,
          requestKind,
        },
      },
    };
  }
  return execute(adapter, pending.args, pending.argSources, cleared, {
    ...base,
    usedQuestions: [],
    decision: { outcome: "call", reason, requestKind, toolId: adapter.id },
  });
}

async function handleMessage(
  originalMessage: string,
  state: ConversationState,
  started: number,
  { forcedTool, spellcheck = true }: { forcedTool?: string; spellcheck?: boolean } = {},
): Promise<TurnOutput> {
  let spelling: SpellingTrace | undefined;
  let followUp: FollowUpTrace | undefined;
  let message = originalMessage;
  const finish = (out: UntimedTurn): TurnOutput => ({
    ...out,
    message,
    trace: {
      ...(spelling ? { spelling } : {}),
      ...(followUp ? { followUp } : {}),
      ...out.trace,
      totalMs: Math.round(performance.now() - started),
    },
  });

  if (isConnected("home")) await ensureHomeCatalog(callHomeTool);

  // A re-run from the choice buttons has already been rewritten.
  if (!forcedTool && jevConfigured()) {
    if (spellcheck) {
      try {
        spelling = await correctSpelling(originalMessage, state);
        message = spelling?.corrected ?? originalMessage;
      } catch (err) {
        // oxlint-disable-next-line no-console
        console.warn("[spelling] skipped:", errorMessage(err));
      }
    }
    try {
      followUp = await resolveFollowUp(message, state);
      if (followUp) message = followUp.resolved;
    } catch (err) {
      // oxlint-disable-next-line no-console
      console.warn("[follow-up] skipped:", errorMessage(err));
    }
  }

  const pools = buildPools(message, state, homeTargetPool(state));
  const { questions, toolKeys } = buildRequest(pools);
  const answer = await askJev(describeState(message, state), questions);
  const base = { jev: answer.trace, optionLabels: answer.optionLabels };

  if (!answer.ok) {
    const configured = jevConfigured();
    return finish({
      text: configured
        ? `Jev request failed: ${answer.error}`
        : "Jev isn't configured yet. Set TYPESAFE_API_KEY in .env and restart the server. (The inspector shows the request that would have been sent.)",
      card: { type: "error", message: configured ? answer.error : "Missing TYPESAFE_API_KEY" },
      state,
      trace: {
        ...base,
        usedQuestions: [],
        decision: {
          outcome: "error",
          reason: configured ? "Jev request failed" : "Jev is not configured",
        },
      },
    });
  }

  const { answers } = answer;
  const used = new Set<string>(["request_kind"]);
  const kind = answers.request_kind?.choice ?? "new_request";
  const pending = state.pending;

  /** Clears `pending` unless `extra.state` is given. */
  const reply = (
    text: string,
    decision: Trace["decision"],
    extra: { card?: Card; state?: ConversationState; args?: Trace["args"] } = {},
  ): TurnOutput =>
    finish({
      text,
      card: extra.card,
      state: extra.state ?? { ...state, pending: undefined },
      trace: {
        ...base,
        usedQuestions: [...used],
        ...(extra.args ? { args: extra.args } : {}),
        decision,
      },
    });

  if (!forcedTool && pending && kind === "cancel") {
    return reply("Okay, cancelled.", {
      outcome: "cancel",
      reason: "Message cancels the pending action",
      requestKind: kind,
    });
  }
  if (!forcedTool && pending?.type === "confirm" && kind === "confirm_yes") {
    return finish(
      await resumeConfirmed(pending, state, base, "Message confirms the pending action", kind),
    );
  }

  if (!forcedTool && (kind === "chat" || kind === "unsupported")) {
    return reply(
      kind === "chat" ? chatReply(message) : UNSUPPORTED,
      { outcome: kind, reason: `Request kind is ${kind}`, requestKind: kind },
      { card: capabilitiesCard() },
    );
  }

  let adapter: Adapter | undefined;
  let toolConfidence: number | undefined;
  let reason: string;
  let partial: Record<string, unknown> | undefined;

  if (forcedTool) {
    adapter = adapterById(forcedTool);
    reason = "User picked this tool from the buttons";
  } else if (pending?.type === "ask" && kind === "answers_pending") {
    adapter = adapterById(pending.toolId);
    partial = pending.partialArgs;
    reason = "Message answers the pending question";
  } else {
    used.add("tool");
    const toolAnswer = answers.tool;
    adapter = toolAnswer?.choice ? toolKeys.get(toolAnswer.choice) : undefined;
    toolConfidence = toolAnswer?.confidence;
    reason = "Top tool pick";

    const [first, second] = ranked(toolAnswer);
    if (
      adapter &&
      first &&
      second &&
      (toolConfidence ?? 1) < CONFIDENT &&
      first[1] - second[1] < CLOSE_MARGIN
    ) {
      const choices = [first, second].map(([k]) => toolKeys.get(k)!);
      const prompt = `Did you mean ${choices.map((o) => o.label.toLowerCase()).join(" or ")}?`;
      return reply(
        prompt,
        {
          outcome: "choices",
          reason: `Tool pick unsure: top two within ${CLOSE_MARGIN}`,
          requestKind: kind,
          toolConfidence,
        },
        {
          card: {
            type: "choices",
            options: choices.map((o) => ({
              value: o.id,
              label: o.label,
              description: o.description,
            })),
          },
          state: {
            ...state,
            pending: { type: "choose", options: choices.map((o) => o.id), message, prompt },
          },
        },
      );
    }
  }

  if (!adapter) {
    return reply(
      UNSUPPORTED,
      { outcome: "unsupported", reason: "No tool fits", requestKind: kind, toolConfidence },
      { card: capabilitiesCard() },
    );
  }

  const built = adapter.build(new Answers(answers, safeKey(adapter.id), used), pools, partial);
  const decisionBase = { requestKind: kind, toolId: adapter.id, toolConfidence };

  if (!built.ok) {
    const nextPending: Pending = {
      type: "ask",
      toolId: adapter.id,
      missing: built.missing,
      prompt: built.prompt,
      message: pending?.type === "ask" ? pending.message : message,
      partialArgs: built.partial,
    };
    return reply(
      built.prompt,
      { ...decisionBase, outcome: "ask", reason: `Missing required argument: ${built.missing}` },
      { state: { ...state, pending: nextPending }, args: built.sources },
    );
  }

  if (adapter.confirm?.(built.args)) {
    const prompt = `${adapter.label} with ${describeArgs(built.sources)}`;
    return reply(
      `Please confirm: ${adapter.label.toLowerCase()}?`,
      { ...decisionBase, outcome: "confirm", reason: "Tool changes data: confirmation required" },
      {
        card: {
          type: "confirm",
          title: adapter.label,
          tool: `${SERVER_LABELS[adapter.server]} · ${adapter.mcpName}`,
          args: built.sources.map((s) => ({ name: s.name, value: String(s.value) })),
          confirmLabel: adapter.confirmLabel ?? "Confirm",
          destructive: isDestructive(adapter),
        },
        state: {
          ...state,
          pending: {
            type: "confirm",
            toolId: adapter.id,
            args: built.args,
            argSources: built.sources,
            prompt,
          },
        },
        args: built.sources,
      },
    );
  }

  return finish(
    await execute(
      adapter,
      built.args,
      built.sources,
      { ...state, pending: undefined },
      {
        ...base,
        usedQuestions: [...used],
        decision: {
          ...decisionBase,
          outcome: "call",
          reason: `${reason}; read-only or low-risk, calling immediately`,
        },
      },
      message,
    ),
  );
}
