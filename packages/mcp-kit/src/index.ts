import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z, ZodRawShape } from "zod";

/** An `isError` tool result carrying `message`. */
export function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** The message of a caught value, however it was thrown. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return String(err);
}

/** A tool result with a text summary and `structuredContent`. */
export function structured(summary: string, data: object): CallToolResult {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: data as Record<string, unknown>,
  };
}

/**
 * GET `url` and validate its JSON body against `shape`. Throws "`request` failed (status)" on an
 * HTTP error (`request` defaults to "`service` request"), "Unexpected `service` response: …" when
 * the body doesn't fit, and passes through network and JSON parse errors.
 */
export async function fetchJson<T>(
  url: string,
  shape: z.ZodType<T>,
  opts: { service: string; request?: string; headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(url, { headers: opts.headers });
  if (!res.ok) {
    throw new Error(`${opts.request ?? `${opts.service} request`} failed (${res.status})`);
  }
  const parsed = shape.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`Unexpected ${opts.service} response: ${parsed.error.message}`);
  }
  return parsed.data;
}

interface ToolSpec<Input extends ZodRawShape> {
  title: string;
  description: string;
  inputSchema: Input;
  outputSchema?: ZodRawShape;
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean; destructiveHint?: boolean };
}

/**
 * Register a tool whose handler may throw. Anything thrown becomes an `isError` result carrying
 * its message, and the connection stays open.
 */
export function defineTool<Input extends ZodRawShape>(
  server: McpServer,
  name: string,
  spec: ToolSpec<Input>,
  handler: (args: any) => Promise<CallToolResult> | CallToolResult,
): void {
  server.registerTool(name, spec as never, async (args: unknown) => {
    try {
      return await handler(args);
    } catch (err) {
      return failure(errorMessage(err));
    }
  });
}

/** Start a stdio server with the given tools. Returns once the transport is connected. */
export async function serve(
  name: string,
  version: string,
  register: (server: McpServer) => void,
): Promise<McpServer> {
  const server = new McpServer({ name, version });
  register(server);
  await server.connect(new StdioServerTransport());
  return server;
}
