import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EntryType } from "@typesafe-ai/sdk";
import type { z } from "zod";

import { ASSISTANT_TZ } from "../../config.ts";
import type { Pools } from "../../jev/pools.ts";
import type { Answers, BuiltQuestion } from "../../jev/questions.ts";
import type { ArgTrace, Card, JevAnswerJson, ServerId, ShownResult } from "../../shared/types.ts";

export type BuildResult =
  | { ok: true; args: Record<string, unknown>; sources: ArgTrace[] }
  | {
      ok: false;
      missing: string;
      prompt: string;
      partial: Record<string, unknown>;
      sources: ArgTrace[];
    };

export interface Presented {
  text: string;
  card: Card;
  lastResult?: Omit<ShownResult, "toolId" | "label" | "args">;
}

/** Helpers for multi-step tools; every call and Jev request is recorded as a trace step. */
export interface RunContext {
  message: string;
  call(tool: string, args: Record<string, unknown>, title: string): Promise<CallToolResult>;
  ask(
    title: string,
    state: EntryType,
    questions: Record<string, BuiltQuestion>,
  ): Promise<Record<string, JevAnswerJson>>;
}

/**
 * What every tool Jev can pick has in common: how to describe itself, what to ask, and how to
 * turn the answers into MCP arguments.
 */
interface BaseAdapter {
  id: string;
  server: ServerId;
  mcpName: string;
  label: string;
  /** Option description in the "which tool?" Choice */
  description: string;
  examples: string[];
  questions(pools: Pools): Record<string, BuiltQuestion>;
  /**
   * Turn Jev's answers into MCP arguments. Arguments starting with `__` are private hints for
   * `confirm`, `run` or `present`: never sent to a single-step tool, and never kept with the result.
   */
  build(a: Answers, pools: Pools, partial?: Record<string, unknown>): BuildResult;
  /** Needs a confirmation card before calling */
  confirm?(args: Record<string, unknown>): boolean;
  confirmLabel?: string;
  /** Show the confirmation as a warning. Defaults to the MCP tool's `destructiveHint`. */
  destructive?: boolean;
}

/** The common case: one MCP call, then turn its result into a reply and a card. */
export interface SingleStepAdapter extends BaseAdapter {
  present(result: CallToolResult, args: Record<string, unknown>): Presented;
  run?: never;
}

/** A tool that drives its own sequence of calls and Jev requests, and returns the reply itself. */
export interface MultiStepAdapter extends BaseAdapter {
  run(args: Record<string, unknown>, ctx: RunContext): Promise<Presented>;
  present?: never;
}

export type Adapter = SingleStepAdapter | MultiStepAdapter;

/** A tool result's text blocks, joined with newlines. */
export function textOf(result: CallToolResult) {
  return result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** Each text block of a tool result that parses as JSON; the rest are skipped. */
export function jsonTexts(result: CallToolResult): any[] {
  const out: any[] = [];
  for (const c of result.content) {
    if (c.type !== "text") continue;
    try {
      out.push(JSON.parse(c.text));
    } catch {}
  }
  return out;
}

/** A tool's `structuredContent` parsed with `schema`, or undefined (with a warning) on mismatch. */
export function readResult<T>(
  result: CallToolResult,
  schema: z.ZodType<T>,
  tool: string,
): T | undefined {
  const parsed = schema.safeParse(result.structuredContent);
  if (parsed.success) return parsed.data;
  const why = parsed.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  // oxlint-disable-next-line no-console
  console.warn(`[tools] ${tool} returned an unexpected shape, falling back to its text — ${why}`);
  return undefined;
}

/** The server's own text as both the reply and an error card, for a result that couldn't be read. */
export function rawFallback(result: CallToolResult): Presented {
  const text = textOf(result);
  return { text, card: { type: "error", message: text } };
}

/** A built argument as display text: primitives as-is, nullish as "", anything else as JSON. */
export function argText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

/** A URL's hostname without a leading `www.`, or the input unchanged when it isn't a valid URL. */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A `build()` result that is ready to call the tool with `args`. */
export function ok(args: Record<string, unknown>, sources: ArgTrace[]): BuildResult {
  return { ok: true, args, sources };
}

/** A `build()` result that asks the user `prompt` for the missing argument `name`. */
export function missing(
  name: string,
  prompt: string,
  partial: Record<string, unknown>,
  sources: ArgTrace[],
): BuildResult {
  return { ok: false, missing: name, prompt, partial, sources };
}

/**
 * Today in ASSISTANT_TZ as YYYY-MM-DD, offset by whole days. The offset is applied to a UTC date so
 * a DST boundary can't skip or repeat a day.
 */
export function localDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ASSISTANT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const d = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
