import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import { errorMessage } from "../lib/errors.ts";
import { SERVER_LABELS, type ServerId } from "../shared/types.ts";

export interface ServerStatus {
  id: ServerId;
  label: string;
  status: "connected" | "missing_env" | "error";
  missingEnv?: string[];
  error?: string;
  tools: Pick<Tool, "name" | "title" | "description" | "inputSchema" | "annotations">[];
}

interface ServerDef {
  id: ServerId;
  env: string[];
  transport: () => Transport;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const require = createRequire(import.meta.url);

function binPath(pkg: string, bin: string) {
  // Some packages don't export ./package.json, so it can't be resolved normally.
  const pkgJson = path.resolve(here, "../../node_modules", pkg, "package.json");
  const bins = require(pkgJson).bin as Record<string, string>;
  return path.resolve(path.dirname(pkgJson), bins[bin]);
}

function childEnv(extra: Record<string, string>) {
  // The stdio transport passes only a minimal env by default.
  return { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...extra };
}

function localTs(pkgDir: string, env: Record<string, string> = {}): Transport {
  return new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: path.join(repoRoot, "packages", pkgDir),
    env: childEnv(env),
    stderr: "inherit",
  });
}

function installedBin(
  pkg: string,
  bin: string,
  env: Record<string, string>,
  args: string[] = [],
): Transport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [binPath(pkg, bin), ...args],
    env: childEnv(env),
    stderr: "ignore",
  });
}

const SERVERS: ServerDef[] = [
  { id: "weather", env: [], transport: () => localTs("mcp-weather") },
  { id: "units", env: [], transport: () => localTs("mcp-units") },
  { id: "wiki", env: [], transport: () => localTs("mcp-wiki") },
  {
    id: "recipes",
    env: [],
    transport: () => localTs("mcp-recipes", { MEALDB_API_KEY: process.env.MEALDB_API_KEY ?? "" }),
  },
  {
    id: "search",
    env: ["BRAVE_API_KEY"],
    transport: () =>
      installedBin(
        "@brave/brave-search-mcp-server",
        "brave-search-mcp-server",
        { BRAVE_API_KEY: process.env.BRAVE_API_KEY! },
        ["--transport", "stdio"],
      ),
  },
  {
    id: "todoist",
    env: ["TODOIST_API_KEY"],
    transport: () =>
      installedBin("@doist/todoist-ai", "todoist-ai", {
        TODOIST_API_KEY: process.env.TODOIST_API_KEY!,
      }),
  },
  {
    id: "home",
    env: ["HASS_URL", "HASS_TOKEN"],
    transport: () =>
      new StreamableHTTPClientTransport(new URL("/api/mcp", process.env.HASS_URL), {
        requestInit: { headers: { Authorization: `Bearer ${process.env.HASS_TOKEN}` } },
      }),
  },
];

const clients = new Map<ServerId, Client>();
const statuses = new Map<ServerId, ServerStatus>();

async function connectOne(def: ServerDef): Promise<ServerStatus> {
  const server = { id: def.id, label: SERVER_LABELS[def.id] };
  const missing = def.env.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    return { ...server, status: "missing_env", missingEnv: missing, tools: [] };
  }
  try {
    const client = new Client({ name: "jev-chat", version: "0.1.0" });
    await client.connect(def.transport());
    const { tools } = await client.listTools();
    clients.set(def.id, client);
    return {
      ...server,
      status: "connected",
      tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
        name,
        title,
        description,
        inputSchema,
        annotations,
      })),
    };
  } catch (err) {
    return { ...server, status: "error", error: errorMessage(err), tools: [] };
  }
}

let connecting: Promise<ServerStatus[]> | undefined;

/** Connects every MCP server once; repeat calls return the same promise of statuses. */
export function connectAll() {
  connecting ??= Promise.all(
    SERVERS.map(async (def) => {
      const s = await connectOne(def);
      statuses.set(def.id, s);
      const note =
        s.status === "connected"
          ? `${s.tools.length} tools`
          : (s.missingEnv?.join(", ") ?? s.error);
      // oxlint-disable-next-line no-console
      console.log(`[mcp] ${def.id}: ${s.status} (${note})`);
      return s;
    }),
  );
  return connecting;
}

/** Boot status of each server that has finished connecting, in `SERVERS` order. */
export function serverStatuses() {
  return SERVERS.map((d) => statuses.get(d.id)).filter((s): s is ServerStatus => !!s);
}

/** Whether the server has a live client that tools can be called on. */
export function isConnected(id: ServerId) {
  return clients.has(id);
}

/** What happened when this server was connected at boot — including why it wasn't. */
export function statusOf(id: ServerId) {
  return statuses.get(id);
}

/** Why a server isn't usable, in words fit for a reply. */
export function disconnectedReason(id: ServerId) {
  const s = statusOf(id);
  return s?.missingEnv?.length
    ? `missing ${s.missingEnv.join(", ")}`
    : (s?.error ?? "not connected");
}

/** A connected server's own declaration of a tool: its input schema and annotations. */
export function toolSpecOf(server: ServerId, name: string) {
  return statusOf(server)?.tools.find((t) => t.name === name);
}

export interface TimedResult {
  result: CallToolResult;
  ms: number;
}

/** Calls a tool on a connected server and times it; throws if the server is not connected. */
export async function callTool(
  server: ServerId,
  name: string,
  args: Record<string, unknown>,
): Promise<TimedResult> {
  const client = clients.get(server);
  if (!client) throw new Error(`${server} is not connected`);
  const start = performance.now();
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { result, ms: Math.round(performance.now() - start) };
}

/** Calls a Home Assistant tool and returns just its result. */
export async function callHomeTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return (await callTool("home", tool, args)).result;
}

/** Closes every connected client, ignoring close errors. */
export async function closeAll() {
  await Promise.all([...clients.values()].map((c) => c.close().catch(() => {})));
}
