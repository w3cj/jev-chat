import { describe, expect, it, vi } from "vitest";

import type { TurnInput } from "./turn/turn.ts";

vi.hoisted(() => {
  process.env.DATABASE_PATH = ":memory:";
});

const inputs: TurnInput[] = [];

vi.mock("./mcp/clients.ts", () => ({ serverStatuses: () => [] }));
vi.mock("./turn/turn.ts", () => ({
  handleTurn: async (input: TurnInput, state: { recent: unknown[] }) => {
    inputs.push(input);
    return {
      text: "Done.",
      state,
      trace: { usedQuestions: [], decision: { outcome: "chat", reason: "test" }, totalMs: 1 },
      message: input.kind === "message" ? input.text.trim() : undefined,
    };
  },
}));

const { app } = await import("./app.ts");

interface Summary {
  id: string;
  title: string;
  createdAt: string;
}

interface Thread {
  conversation: { id: string; title: string; pending: unknown };
  messages: { role: string; text: string }[];
}

async function newConversation(): Promise<Summary> {
  const res = await app.request("/api/conversations", { method: "POST" });
  expect(res.status).toBe(201);
  return (await res.json()) as Summary;
}

async function threadOf(id: string): Promise<Thread> {
  return (await (await app.request(`/api/conversations/${id}/messages`)).json()) as Thread;
}

async function post(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app", () => {
  it("creates and lists conversations", async () => {
    const convo = await newConversation();
    expect(convo).toEqual({ id: convo.id, title: "New chat", createdAt: convo.createdAt });

    const list = await (await app.request("/api/conversations")).json();
    expect(list).toContainEqual(convo);
  });

  it("runs a message turn, titles the chat after it, and stores both messages", async () => {
    const { id } = await newConversation();
    const res = await post(`/api/conversations/${id}/messages`, {
      text: " hi there ",
      spellcheck: false,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      role: "assistant",
      text: "Done.",
      conversationId: id,
    });
    expect(inputs.at(-1)).toEqual({ kind: "message", text: " hi there ", spellcheck: false });

    const { conversation, messages } = await threadOf(id);
    expect(conversation).toEqual({ id, title: " hi there ", pending: null });
    expect(messages.map((m) => [m.role, m.text])).toEqual([
      ["user", " hi there "],
      ["assistant", "Done."],
    ]);
  });

  it("records a button click under its label and keeps the title", async () => {
    const { id } = await newConversation();
    const res = await post(`/api/conversations/${id}/actions`, { type: "pick", value: "x" });

    expect(res.status).toBe(200);
    expect(inputs.at(-1)).toEqual({ kind: "action", type: "pick", value: "x" });
    const { conversation, messages } = await threadOf(id);
    expect(conversation.title).toBe("New chat");
    expect(messages[0]).toMatchObject({ role: "user", text: "Pick: x" });
  });

  it("returns 404 for an unknown conversation", async () => {
    expect((await app.request("/api/conversations/nope/messages")).status).toBe(404);
    expect((await post("/api/conversations/nope/messages", { text: "hi" })).status).toBe(404);
    expect((await post("/api/conversations/nope/actions", { type: "confirm" })).status).toBe(404);
  });

  it("rejects a message over the length limit", async () => {
    const { id } = await newConversation();
    const res = await post(`/api/conversations/${id}/messages`, { text: "a".repeat(1001) });
    expect(res.status).toBe(400);
  });

  it("rejects requests addressed to a non-local host", async () => {
    const res = await app.request("http://evil.example/api/conversations");
    expect(res.status).toBe(403);
  });

  it("rejects requests sent from another site's page", async () => {
    const res = await app.request("/api/conversations", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("accepts requests from the local web app", async () => {
    const res = await app.request("/api/conversations", {
      method: "POST",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(201);
  });

  it("runs turns on the same conversation one at a time", async () => {
    const { id } = await newConversation();
    const [a, b] = await Promise.all([
      post(`/api/conversations/${id}/actions`, { type: "confirm" }),
      post(`/api/conversations/${id}/actions`, { type: "cancel" }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const { messages } = await threadOf(id);
    expect(messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "Confirm"],
      ["assistant", "Done."],
      ["user", "Cancel"],
      ["assistant", "Done."],
    ]);
  });

  it("deletes a conversation", async () => {
    const { id } = await newConversation();
    await app.request(`/api/conversations/${id}`, { method: "DELETE" });

    expect((await app.request(`/api/conversations/${id}/messages`)).status).toBe(404);
  });
});
