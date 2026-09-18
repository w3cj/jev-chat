import type { AppType } from "@jev-chat/server";
import { hc, type InferResponseType } from "hono/client";

export const api = hc<AppType>("/").api;

export type ConversationSummary = InferResponseType<typeof api.conversations.$get>[number];
export type MessagesResponse = InferResponseType<
  (typeof api.conversations)[":id"]["messages"]["$get"],
  200
>;
export type ChatMessage = MessagesResponse["messages"][number];
export type ConversationInfo = MessagesResponse["conversation"];
export type ServerStatus = InferResponseType<typeof api.tools.$get>["servers"][number];

/** Awaits a Hono client request and returns its JSON body, throwing on a non-2xx status. */
export async function unwrap<T>(res: Promise<Response & { json(): Promise<T> }>): Promise<T> {
  const r = await res;
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
