import { actionLabel, type TurnAction } from "@jev-chat/server/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ChatMessage, type MessagesResponse, unwrap } from "./api.ts";
import { useUi } from "./store.ts";

const keys = {
  conversations: ["conversations"] as const,
  messages: (id: string) => ["conversations", id, "messages"] as const,
  tools: ["tools"] as const,
};

/** All conversations, for the sidebar. */
export function useConversations() {
  return useQuery({
    queryKey: keys.conversations,
    queryFn: () => unwrap(api.conversations.$get()),
  });
}

/** The tool servers and their connection status, treated as fresh for 30 seconds. */
export function useTools() {
  return useQuery({
    queryKey: keys.tools,
    queryFn: () => unwrap(api.tools.$get()),
    staleTime: 30_000,
  });
}

/** A conversation and its messages; errors with "Conversation not found" on a 404. */
export function useMessages(id: string) {
  return useQuery({
    queryKey: keys.messages(id),
    queryFn: () => fetchMessages(id),
  });
}

/** A conversation and its messages. Throws "Conversation not found" on a 404, else "<status> <body>". */
export async function fetchMessages(id: string): Promise<MessagesResponse> {
  const res = await api.conversations[":id"].messages.$get({ param: { id } });
  if (res.status === 404) throw new Error("Conversation not found");
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/** Creates an empty conversation and refreshes the conversation list. */
export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.conversations.$post()),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }),
  });
}

/** Deletes a conversation by id and refreshes the conversation list. */
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.conversations[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }),
  });
}

/** The user's own bubble, shown before the server has stored it. Replaced on the next refetch. */
function optimistic(id: string, text: string): ChatMessage {
  return {
    id: `optimistic-${Date.now()}`,
    conversationId: id,
    role: "user",
    text,
    card: null,
    trace: null,
    createdAt: new Date().toISOString(),
  } satisfies Record<keyof ChatMessage, unknown> as ChatMessage;
}

type TurnRequest = { text: string } | { action: TurnAction };

/** Send a message or a button action; shows the user's bubble immediately. */
export function useSendTurn(id: string) {
  const qc = useQueryClient();
  const select = useUi((s) => s.select);
  return useMutation({
    mutationFn: async (input: TurnRequest) => {
      const res =
        "text" in input
          ? await api.conversations[":id"].messages.$post({
              param: { id },
              json: { text: input.text, spellcheck: useUi.getState().spellcheck },
            })
          : await api.conversations[":id"].actions.$post({ param: { id }, json: input.action });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.messages(id) });
      const label = "text" in input ? input.text : actionLabel(input.action);
      qc.setQueryData<MessagesResponse>(keys.messages(id), (old) =>
        old ? { ...old, messages: [...old.messages, optimistic(id, label)] } : old,
      );
    },
    onSuccess: (assistant) => {
      if (assistant && "id" in assistant) select(assistant.id);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.messages(id) });
      void qc.invalidateQueries({ queryKey: keys.conversations });
    },
  });
}
