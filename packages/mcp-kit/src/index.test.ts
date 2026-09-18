import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineTool, errorMessage, failure, fetchJson, structured } from "./index.ts";

describe("errorMessage", () => {
  it("reads an Error, a string, or anything with a string message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage({ message: "shaped" })).toBe("shaped");
  });

  it("stringifies anything else", () => {
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage({ message: 7 })).toBe("[object Object]");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});

describe("results", () => {
  it("builds an isError result carrying the message", () => {
    expect(failure("nope")).toEqual({ isError: true, content: [{ type: "text", text: "nope" }] });
  });

  it("builds a result with a text summary and structured content", () => {
    expect(structured("2 items", { items: [1, 2] })).toEqual({
      content: [{ type: "text", text: "2 items" }],
      structuredContent: { items: [1, 2] },
    });
  });
});

describe("fetchJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  const shape = z.object({ n: z.number() });

  it("returns the validated body, sending any headers given", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ n: 1, extra: true }));
    vi.stubGlobal("fetch", fetch);
    const headers = { "User-Agent": "test" };
    expect(await fetchJson("https://api.test/x", shape, { service: "Test", headers })).toEqual({
      n: 1,
    });
    expect(fetch).toHaveBeenCalledWith("https://api.test/x", { headers });
  });

  it("names the request when the HTTP call fails", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
    await expect(fetchJson("https://api.test", shape, { service: "Test" })).rejects.toThrow(
      "Test request failed (502)",
    );
    await expect(
      fetchJson("https://api.test", shape, { service: "Test", request: "Lookup" }),
    ).rejects.toThrow("Lookup failed (502)");
  });

  it("names the service when the body doesn't fit the shape", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ n: "one" }));
    await expect(fetchJson("https://api.test", shape, { service: "Test" })).rejects.toThrow(
      /^Unexpected Test response: /,
    );
  });
});

type Handler = (args: unknown) => Promise<CallToolResult>;

/** Register one tool on a fake server and return the wrapped handler it received. */
function register(handler: (args: any) => CallToolResult | Promise<CallToolResult>): Handler {
  const registerTool = vi.fn<McpServer["registerTool"]>();
  const spec = { title: "T", description: "D", inputSchema: {} };
  defineTool({ registerTool } as unknown as McpServer, "tool", spec, handler);
  expect(registerTool).toHaveBeenCalledWith("tool", spec, expect.any(Function));
  return registerTool.mock.calls[0][2];
}

describe("defineTool", () => {
  it("passes args through and returns the handler's result", async () => {
    const wrapped = register(({ n }) => structured(`got ${n}`, { n }));
    expect(await wrapped({ n: 3 })).toEqual(structured("got 3", { n: 3 }));
  });

  it("turns a throw into an isError result", async () => {
    const wrapped = register(async () => {
      throw new Error("upstream down");
    });
    expect(await wrapped({})).toEqual(failure("upstream down"));
  });
});
