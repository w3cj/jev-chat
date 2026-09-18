import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ServerStatus } from "./clients.ts";

interface StdioParams {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  stderr: string;
}

const transports: StdioParams[] = [];
const closed: string[] = [];

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class {
    constructor(readonly params: StdioParams) {
      transports.push(params);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    cwd = "";
    async connect(transport: { params: StdioParams }) {
      this.cwd = transport.params.cwd ?? "";
      if (this.cwd.endsWith("mcp-recipes")) throw new Error("spawn failed");
    }
    async listTools() {
      return {
        tools: [{ name: "get_weather", description: "Forecast", inputSchema: {}, extra: "x" }],
      };
    }
    async callTool({ name }: { name: string }) {
      return { content: [{ type: "text", text: `called ${name}` }] };
    }
    async close() {
      closed.push(this.cwd);
      if (this.cwd.endsWith("mcp-units")) throw new Error("already closed");
    }
  },
}));

const mcp = await import("./clients.ts");

describe("MCP clients", () => {
  let statuses: ServerStatus[];

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("BRAVE_API_KEY", "brave-key");
    vi.stubEnv("TODOIST_API_KEY", "todoist-key");
    vi.stubEnv("MEALDB_API_KEY", "");
    vi.stubEnv("HASS_URL", "http://hass.local");
    vi.stubEnv("HASS_TOKEN", " ");
    statuses = await mcp.connectAll();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("connects each server once and reports them in order", async () => {
    expect(await mcp.connectAll()).toBe(statuses);
    expect(mcp.serverStatuses().map((s) => [s.id, s.status])).toEqual([
      ["weather", "connected"],
      ["units", "connected"],
      ["wiki", "connected"],
      ["recipes", "error"],
      ["search", "connected"],
      ["todoist", "connected"],
      ["home", "missing_env"],
    ]);
  });

  it("keeps only the tool fields the app reads", () => {
    expect(mcp.statusOf("weather")).toEqual({
      id: "weather",
      label: "Weather",
      status: "connected",
      tools: [{ name: "get_weather", description: "Forecast", inputSchema: {} }],
    });
    expect(mcp.toolSpecOf("weather", "get_weather")?.description).toBe("Forecast");
    expect(mcp.toolSpecOf("weather", "nope")).toBeUndefined();
  });

  it("explains why a server isn't usable", () => {
    expect(mcp.statusOf("home")).toEqual({
      id: "home",
      label: "Home Assistant",
      status: "missing_env",
      missingEnv: ["HASS_TOKEN"],
      tools: [],
    });
    expect(mcp.disconnectedReason("home")).toBe("missing HASS_TOKEN");
    expect(mcp.statusOf("recipes")).toMatchObject({ label: "Recipes", error: "spawn failed" });
    expect(mcp.disconnectedReason("recipes")).toBe("spawn failed");
    expect(mcp.isConnected("recipes")).toBe(false);
    expect(mcp.isConnected("weather")).toBe(true);
  });

  it("runs the local servers from their package folder with tsx", () => {
    const weather = transports.find((t) => t.cwd?.endsWith(path.join("packages", "mcp-weather")));
    expect(weather).toMatchObject({
      command: process.execPath,
      args: ["--import", "tsx", "src/index.ts"],
      stderr: "inherit",
    });
    const recipes = transports.find((t) => t.cwd?.endsWith("mcp-recipes"));
    expect(recipes?.env).toMatchObject({ MEALDB_API_KEY: "", PATH: process.env.PATH });
  });

  it("runs the installed servers' bins with their key and a minimal env", () => {
    const search = transports.find((t) => t.env.BRAVE_API_KEY);
    expect(search).toMatchObject({ command: process.execPath, stderr: "ignore" });
    expect(search?.args[0]).toMatch(/brave-search-mcp-server[/\\]dist[/\\]index\.js$/);
    expect(search?.args.slice(1)).toEqual(["--transport", "stdio"]);
    expect(Object.keys(search?.env ?? {}).toSorted()).toEqual(["BRAVE_API_KEY", "HOME", "PATH"]);

    const todoist = transports.find((t) => t.env.TODOIST_API_KEY);
    expect(todoist).toMatchObject({ env: { TODOIST_API_KEY: "todoist-key" }, stderr: "ignore" });
    expect(todoist?.args).toEqual([
      expect.stringMatching(/todoist-ai[/\\]bin[/\\]todoist-ai\.js$/),
    ]);
  });

  it("calls a tool on a connected server and times it", async () => {
    const { result, ms } = await mcp.callTool("weather", "get_weather", {});
    expect(result.content).toEqual([{ type: "text", text: "called get_weather" }]);
    expect(ms).toBeGreaterThanOrEqual(0);
    await expect(mcp.callTool("home", "HassTurnOn", {})).rejects.toThrow("home is not connected");
    await expect(mcp.callHomeTool("HassTurnOn", {})).rejects.toThrow("home is not connected");
  });

  it("closes every client even when one fails to close", async () => {
    await mcp.closeAll();
    expect(closed).toHaveLength(5);
  });
});
