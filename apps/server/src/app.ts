import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { HISTORY_KEPT } from "./config.ts";
import { db, schema } from "./db/index.ts";
import { sendMessageSchema } from "./db/schema.ts";
import { serverStatuses } from "./mcp/clients.ts";
import { actionLabel, type ConversationState } from "./shared/types.ts";
import { handleTurn, type TurnInput } from "./turn/turn.ts";

const { conversations, messages } = schema;

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("confirm") }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("pick"), value: z.string() }),
]);

const conversationSummary = {
  id: conversations.id,
  title: conversations.title,
  createdAt: conversations.createdAt,
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const turnQueues = new Map<string, Promise<unknown>>();

async function runTurn(
  conversationId: string,
  input: TurnInput,
  userText: string,
): Promise<typeof messages.$inferSelect | undefined> {
  const run = (turnQueues.get(conversationId) ?? Promise.resolve()).then(() =>
    runQueuedTurn(conversationId, input, userText),
  );
  const settled = run.catch(() => {});
  turnQueues.set(conversationId, settled);
  try {
    return await run;
  } finally {
    if (turnQueues.get(conversationId) === settled) turnQueues.delete(conversationId);
  }
}

async function runQueuedTurn(
  conversationId: string,
  input: TurnInput,
  userText: string,
): Promise<typeof messages.$inferSelect | undefined> {
  const convo = db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
  if (!convo) return undefined;

  db.insert(messages)
    .values({ id: crypto.randomUUID(), conversationId, role: "user", text: userText })
    .run();

  const out = await handleTurn(input, convo.state);
  const recent = [
    ...out.state.recent,
    { user: out.message ?? userText, assistant: out.text },
  ].slice(-HISTORY_KEPT);
  const state: ConversationState = { ...out.state, recent };

  const title =
    convo.title === "New chat" && input.kind === "message" ? userText.slice(0, 60) : convo.title;
  db.update(conversations).set({ state, title }).where(eq(conversations.id, conversationId)).run();

  return db
    .insert(messages)
    .values({
      id: crypto.randomUUID(),
      conversationId,
      role: "assistant",
      text: out.text,
      card: out.card,
      trace: out.trace,
    })
    .returning()
    .get();
}

export const app = new Hono()
  .basePath("/api")
  .use(async (c, next) => {
    if (!LOCAL_HOSTNAMES.has(new URL(c.req.url).hostname)) {
      return c.json({ error: "Forbidden host" }, 403);
    }
    const origin = c.req.header("origin");
    if (origin && !LOCAL_HOSTNAMES.has(URL.parse(origin)?.hostname ?? "")) {
      return c.json({ error: "Forbidden origin" }, 403);
    }
    return next();
  })
  .get("/health", (c) => c.json({ ok: true }))
  .get("/tools", (c) => c.json({ servers: serverStatuses() }))
  .get("/conversations", (c) =>
    c.json(
      db
        .select(conversationSummary)
        .from(conversations)
        .orderBy(desc(conversations.createdAt))
        .all(),
    ),
  )
  .post("/conversations", (c) => {
    const convo = db
      .insert(conversations)
      .values({ id: crypto.randomUUID(), state: { recent: [] } })
      .returning(conversationSummary)
      .get();
    return c.json(convo, 201);
  })
  .delete("/conversations/:id", (c) => {
    db.delete(conversations)
      .where(eq(conversations.id, c.req.param("id")))
      .run();
    return c.json({ ok: true });
  })
  .get("/conversations/:id/messages", (c) => {
    const id = c.req.param("id");
    const convo = db.select().from(conversations).where(eq(conversations.id, id)).get();
    if (!convo) return c.json({ error: "Not found" }, 404);
    const rows = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt))
      .all();
    return c.json({
      conversation: { id: convo.id, title: convo.title, pending: convo.state.pending ?? null },
      messages: rows,
    });
  })
  .post("/conversations/:id/messages", zValidator("json", sendMessageSchema), async (c) => {
    const { text, spellcheck } = c.req.valid("json");
    const assistant = await runTurn(c.req.param("id"), { kind: "message", text, spellcheck }, text);
    if (!assistant) return c.json({ error: "Not found" }, 404);
    return c.json(assistant);
  })
  .post("/conversations/:id/actions", zValidator("json", actionSchema), async (c) => {
    const action = c.req.valid("json");
    const assistant = await runTurn(
      c.req.param("id"),
      { kind: "action", ...action },
      actionLabel(action),
    );
    if (!assistant) return c.json({ error: "Not found" }, 404);
    return c.json(assistant);
  });

export type AppType = typeof app;
