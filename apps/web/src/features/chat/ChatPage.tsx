import { useParams } from "react-router";

import { ResizeHandle } from "../../components/ui/ResizeHandle.tsx";
import { useMessages, useSendTurn } from "../../queries.ts";
import { INSPECTOR_WIDTH, useUi } from "../../store.ts";
import { Inspector } from "../inspector/Inspector.tsx";
import { Composer } from "./Composer.tsx";
import { MessageBubble } from "./MessageBubble.tsx";
import { SuggestedPrompts } from "./SuggestedPrompts.tsx";

function scrollIntoView(el: HTMLDivElement | null) {
  el?.scrollIntoView({ behavior: "smooth" });
}

/**
 * A conversation: the message thread, suggested prompts, the composer, and the inspector for the
 * selected reply (the latest one by default).
 */
export function ChatPage() {
  const { id } = useParams() as { id: string };
  const { data, isLoading, error } = useMessages(id);
  const send = useSendTurn(id);
  const { inspectorOpen, selectedMessageId, select, inspectorWidth, setInspectorWidth } = useUi();

  const messages = data?.messages ?? [];
  const lastAssistant = messages.findLast((m) => m.role === "assistant");
  const selected = messages.find((m) => m.id === selectedMessageId) ?? lastAssistant;

  if (error) return <div className="p-8 text-error">{error.message}</div>;

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-2">
            {isLoading && <span className="loading loading-dots" />}
            {!isLoading && messages.length === 0 && (
              <div className="py-16 text-center">
                <h1 className="text-3xl font-bold">What can I help with?</h1>
                <p className="mt-2 text-base-content/60">
                  Weather, web search, Wikipedia, recipes, your to-do list, your smart home, and
                  units &amp; maths. Try a prompt below.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                selected={m.id === selected?.id}
                isLatest={m.id === lastAssistant?.id && i === messages.length - 1}
                pending={data?.conversation.pending ?? null}
                busy={send.isPending}
                onSelect={() => select(m.id)}
                onAction={(a) => send.mutate(a.type === "say" ? { text: a.text } : { action: a })}
              />
            ))}
            {send.isPending && (
              <div className="chat chat-start">
                <div className="chat-bubble bg-base-100">
                  <span className="loading loading-dots loading-sm" />
                </div>
              </div>
            )}
            {send.error && <div className="alert alert-error">{send.error.message}</div>}
            {/* Remounts, and so scrolls into view, when a message arrives or a reply starts. */}
            <div key={`${messages.length}:${send.isPending}`} ref={scrollIntoView} />
          </div>
        </div>
        <div className="border-t border-base-300 bg-base-100 px-4 py-3">
          <div className="mx-auto max-w-3xl space-y-2">
            <SuggestedPrompts disabled={send.isPending} onPick={(text) => send.mutate({ text })} />
            <Composer disabled={send.isPending} onSend={(text) => send.mutate({ text })} />
          </div>
        </div>
      </section>
      {inspectorOpen && (
        <aside
          className="relative hidden max-w-[60vw] shrink-0 border-l border-base-300 bg-base-100 lg:block"
          style={{ width: inspectorWidth }}
        >
          <ResizeHandle
            edge="left"
            label="Resize the inspector"
            width={inspectorWidth}
            min={INSPECTOR_WIDTH.min}
            max={INSPECTOR_WIDTH.max}
            defaultWidth={INSPECTOR_WIDTH.default}
            onResize={setInspectorWidth}
          />
          <div className="h-full overflow-y-auto">
            <Inspector message={selected} />
          </div>
        </aside>
      )}
    </div>
  );
}
