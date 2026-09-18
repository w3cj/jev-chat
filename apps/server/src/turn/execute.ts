import { RESULTS_KEPT } from "../config.ts";
import { askJev } from "../jev/client.ts";
import { errorMessage } from "../lib/errors.ts";
import { callTool, disconnectedReason, isConnected, toolSpecOf } from "../mcp/clients.ts";
import {
  SERVER_LABELS,
  type ArgTrace,
  type CallTrace,
  type ConversationState,
  type ServerId,
  type Trace,
  type TraceStep,
} from "../shared/types.ts";
import type {
  Adapter,
  MultiStepAdapter,
  Presented,
  RunContext,
  SingleStepAdapter,
} from "../tools/index.ts";
import type { UntimedTurn } from "./outcome.ts";

/** The trace a caller hands in: everything decided before the call, minus what the call produces. */
type DecidedTrace = Omit<Trace, "totalMs" | "call" | "args">;

/**
 * Whether the confirmation card should read as a warning. The adapter's own `destructive` flag
 * wins over the MCP server's `destructiveHint`.
 */
export function isDestructive(adapter: Adapter): boolean {
  if (adapter.destructive !== undefined) return adapter.destructive;
  return toolSpecOf(adapter.server, adapter.mcpName)?.annotations?.destructiveHint ?? false;
}

/** Arguments as a `name=value, ...` list for a confirmation prompt. */
export function describeArgs(sources: ArgTrace[]): string {
  return sources.map((s) => `${s.name}=${JSON.stringify(s.value)}`).join(", ");
}

/** A call that threw instead of returning a result. */
function thrownCall(
  server: ServerId,
  tool: string,
  args: Record<string, unknown>,
  err: unknown,
): CallTrace {
  return { server, tool, args, ms: 0, isError: true, result: String(err) };
}

/** A tool that failed, said in the tool's own words. */
function failed(
  adapter: Adapter,
  why: string,
  state: ConversationState,
  trace: Omit<Trace, "totalMs">,
): UntimedTurn {
  return {
    text: `${adapter.label} failed: ${why}`,
    card: { type: "error", message: why },
    state,
    trace,
  };
}

function withoutHints(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([k]) => !k.startsWith("__")));
}

/** The result of a successful call, plus whatever of it later turns may refer back to. */
function presentedTurn(
  adapter: Adapter,
  args: Record<string, unknown>,
  presented: Presented,
  state: ConversationState,
  trace: Omit<Trace, "totalMs">,
): UntimedTurn {
  const kept = { toolId: adapter.id, label: adapter.label, args: withoutHints(args) };
  return {
    text: presented.text,
    card: presented.card,
    state: {
      ...state,
      results: presented.lastResult
        ? [{ ...kept, ...presented.lastResult }, ...(state.results ?? [])].slice(0, RESULTS_KEPT)
        : state.results,
    },
    trace,
  };
}

/**
 * Call the adapter's tool with the decided arguments and turn the result into a reply. Never
 * throws: a disconnected server or a failed call comes back as an error reply with its trace.
 */
export async function execute(
  adapter: Adapter,
  args: Record<string, unknown>,
  sources: ArgTrace[],
  state: ConversationState,
  trace: DecidedTrace,
  message = "",
): Promise<UntimedTurn> {
  if (!isConnected(adapter.server)) {
    const reason = disconnectedReason(adapter.server);
    const why = `${SERVER_LABELS[adapter.server]} isn't connected (${reason})`;
    return {
      text: `${why}.`,
      card: { type: "error", message: why },
      state,
      trace: {
        ...trace,
        args: sources,
        decision: {
          ...trace.decision,
          outcome: "error",
          reason: `Server not connected: ${reason}`,
        },
      },
    };
  }

  if (adapter.run) return runMultiStep(adapter, args, sources, state, trace, message);
  return runSingleStep(adapter, args, sources, state, trace);
}

async function runSingleStep(
  adapter: SingleStepAdapter,
  built: Record<string, unknown>,
  sources: ArgTrace[],
  state: ConversationState,
  trace: DecidedTrace,
): Promise<UntimedTurn> {
  const { server, mcpName: tool } = adapter;
  const args = forTool(adapter, built);
  try {
    const { result, ms } = await callTool(server, tool, args);
    const call = { server, tool, args, ms, isError: !!result.isError, result };
    if (result.isError) {
      const toolError =
        result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n") || "Tool error";
      return failed(adapter, toolError, state, { ...trace, args: sources, call });
    }
    return presentedTurn(adapter, args, adapter.present(result, built), state, {
      ...trace,
      args: sources,
      call,
    });
  } catch (err) {
    return failed(adapter, errorMessage(err), state, {
      ...trace,
      args: sources,
      call: thrownCall(server, tool, args, err),
    });
  }
}

/** Drop internal `__` hints and anything the connected server doesn't declare. */
function forTool(
  adapter: SingleStepAdapter,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const visible = withoutHints(args);
  const properties = toolSpecOf(adapter.server, adapter.mcpName)?.inputSchema.properties;
  if (!properties) return visible;
  return Object.fromEntries(Object.entries(visible).filter(([k]) => k in properties));
}

async function runMultiStep(
  adapter: MultiStepAdapter,
  args: Record<string, unknown>,
  sources: ArgTrace[],
  state: ConversationState,
  trace: DecidedTrace,
  message: string,
): Promise<UntimedTurn> {
  const steps: TraceStep[] = [];
  const calls: CallTrace[] = [];
  const { server } = adapter;

  const ctx: RunContext = {
    message,
    async call(tool, callArgs, title) {
      try {
        const { result, ms } = await callTool(server, tool, callArgs);
        const call = { server, tool, args: callArgs, ms, isError: !!result.isError, result };
        steps.push({ title, call });
        calls.push(call);
        return result;
      } catch (err) {
        steps.push({ title, call: thrownCall(server, tool, callArgs, err) });
        throw err;
      }
    },
    async ask(title, jevState, questions) {
      const answer = await askJev(jevState, questions);
      steps.push({
        title,
        jev: answer.trace,
        usedQuestions: Object.keys(questions),
        optionLabels: answer.optionLabels,
      });
      if (!answer.ok) throw new Error(answer.error);
      return answer.answers;
    },
  };

  const chainCall = () =>
    calls.length
      ? {
          server,
          tool: calls.map((c) => c.tool).join(" → "),
          args,
          ms: calls.reduce((n, c) => n + c.ms, 0),
          isError: calls.some((c) => c.isError),
          result: calls[calls.length - 1].result,
        }
      : undefined;

  try {
    const presented = await adapter.run(args, ctx);
    return presentedTurn(adapter, args, presented, state, {
      ...trace,
      args: sources,
      call: chainCall(),
      steps,
    });
  } catch (err) {
    return failed(adapter, errorMessage(err), state, {
      ...trace,
      args: sources,
      call: chainCall(),
      steps,
    });
  }
}
