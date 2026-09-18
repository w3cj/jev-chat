import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

import {
  MAX_MESSAGE_CHARS,
  type Card,
  type ConversationState,
  type Trace,
} from "../shared/types.ts";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New chat"),
  state: text("state", { mode: "json" }).$type<ConversationState>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    text: text("text").notNull(),
    card: text("card", { mode: "json" }).$type<Card>(),
    trace: text("trace", { mode: "json" }).$type<Trace>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

const messageInsertSchema = createInsertSchema(messages);

/** Body of POST /conversations/:id/messages. */
export const sendMessageSchema = messageInsertSchema.pick({ text: true }).extend({
  text: z.string().max(MAX_MESSAGE_CHARS),
  /** Run the spell-check step; defaults to on */
  spellcheck: z.boolean().optional(),
});
