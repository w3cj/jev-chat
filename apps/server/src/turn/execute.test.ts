import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerStatus } from "../mcp/clients.ts";
import type { MultiStepAdapter, SingleStepAdapter } from "../tools/index.ts";
import { execute } from "./execute.ts";

let connected = true;
let respond: (tool: string) => CallToolResult = () => ({ content: [{ type: "text", text: "ok" }] });
const called: { tool: string; args: Record<string, unknown> }[] = [];

const weatherStatus = {
  id: "weather",
  label: "Weather",
  status: "connected",
  tools: [{ name: "get_weather", inputSchema: { type: "object", properties: { place: {} } } }],
} as ServerStatus;

vi.mock("../mcp/clients.ts", () => ({
  isConnected: () => connected,
  disconnectedReason: () => "missing WEATHER_KEY",
  toolSpecOf: (_server: string, name: string) => weatherStatus.tools.find((t) => t.name === name),
  callTool: async (_server: string, tool: string, args: Record<string, unknown>) => {
    called.push({ tool, args });
    return { result: respond(tool), ms: 4 };
  },
}));

const base = {
  id: "weather.get_weather",
  server: "weather",
  mcpName: "get_weather",
  label: "Weather",
  description: "",
  examples: [],
  questions: () => ({}),
  build: () => ({ ok: true, args: {}, sources: [] }),
} as const;

const single = {
  ...base,
  present: (result: CallToolResult) => ({
    text: "Sunny",
    card: { type: "error", message: "unused" },
    lastResult: { summary: String(result.content.length), items: [], numbers: [] },
  }),
} as unknown as SingleStepAdapter;

const trace = { usedQuestions: [], decision: { outcome: "call" as const, reason: "test" } };
const sources = [{ name: "place", value: "Seattle", source: "message" }];

describe("execute", () => {
  beforeEach(() => {
    connected = true;
    respond = () => ({ content: [{ type: "text", text: "ok" }] });
    called.length = 0;
  });

  it("replies with an error when the server isn't connected", async () => {
    connected = false;
    const out = await execute(single, { place: "Seattle" }, sources, { recent: [] }, trace);

    expect(out.text).toBe("Weather isn't connected (missing WEATHER_KEY).");
    expect(out.trace.decision).toMatchObject({ outcome: "error" });
    expect(called).toHaveLength(0);
  });

  it("drops `__` hints and undeclared args, and keeps the result for follow-ups", async () => {
    const out = await execute(
      single,
      { place: "Seattle", extra: 1, __hint: true },
      sources,
      { recent: [] },
      trace,
    );

    expect(called).toEqual([{ tool: "get_weather", args: { place: "Seattle" } }]);
    expect(out.text).toBe("Sunny");
    expect(out.trace.call).toMatchObject({ tool: "get_weather", ms: 4, isError: false });
    expect(out.trace.args).toBe(sources);
    expect(out.state.results?.[0]).toMatchObject({
      toolId: "weather.get_weather",
      args: { place: "Seattle" },
      summary: "1",
    });
  });

  it("reports a tool error in the tool's own words", async () => {
    respond = () => ({ isError: true, content: [{ type: "text", text: "Unknown place" }] });
    const out = await execute(single, { place: "Nowhere" }, sources, { recent: [] }, trace);

    expect(out.text).toBe("Weather failed: Unknown place");
    expect(out.card).toEqual({ type: "error", message: "Unknown place" });
    expect(out.trace.call?.isError).toBe(true);
  });

  it("reports a thrown call as a failed zero-ms call", async () => {
    respond = () => {
      throw new Error("socket closed");
    };
    const out = await execute(single, { place: "Seattle" }, sources, { recent: [] }, trace);

    expect(out.text).toBe("Weather failed: socket closed");
    expect(out.trace.call).toMatchObject({ ms: 0, isError: true, result: "Error: socket closed" });
  });

  const multi = {
    ...base,
    run: async (_args: Record<string, unknown>, ctx: Parameters<MultiStepAdapter["run"]>[1]) => {
      await ctx.call("search", { q: ctx.message }, "Search");
      await ctx.call("fetch", { id: 1 }, "Fetch");
      return { text: "Found it", card: { type: "error", message: "unused" } };
    },
  } as unknown as MultiStepAdapter;

  it("records each step of a multi-step tool and sums them into one call", async () => {
    const out = await execute(multi, { q: "x" }, sources, { recent: [] }, trace, "tide times");

    expect(called.map((c) => c.args)).toEqual([{ q: "tide times" }, { id: 1 }]);
    expect(out.text).toBe("Found it");
    expect(out.trace.steps?.map((s) => s.title)).toEqual(["Search", "Fetch"]);
    expect(out.trace.call).toMatchObject({
      tool: "search → fetch",
      args: { q: "x" },
      ms: 8,
      isError: false,
    });
  });

  it("hands a multi-step tool its `__` hints but keeps them out of the stored result", async () => {
    let seen: Record<string, unknown> = {};
    const hinted = {
      ...base,
      run: async (args: Record<string, unknown>) => {
        seen = args;
        return {
          text: "Found it",
          card: { type: "error", message: "unused" },
          lastResult: { summary: "", items: [], numbers: [] },
        };
      },
    } as unknown as MultiStepAdapter;

    const out = await execute(hinted, { q: "x", __kind: "people" }, sources, { recent: [] }, trace);

    expect(seen).toEqual({ q: "x", __kind: "people" });
    expect(out.state.results?.[0].args).toEqual({ q: "x" });
  });

  it("keeps the steps that ran when a multi-step call throws", async () => {
    respond = (tool) => {
      if (tool === "fetch") throw new Error("timeout");
      return { content: [{ type: "text", text: "ok" }] };
    };
    const out = await execute(multi, {}, sources, { recent: [] }, trace);

    expect(out.text).toBe("Weather failed: timeout");
    expect(out.trace.steps?.[1].call).toMatchObject({ tool: "fetch", ms: 0, isError: true });
    expect(out.trace.call).toMatchObject({ tool: "search", ms: 4 });
  });
});
