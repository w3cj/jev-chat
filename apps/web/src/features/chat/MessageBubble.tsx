import { SERVER_LABELS, type Outcome, type Pending, type Trace } from "@jev-chat/server/types";

import type { ChatMessage } from "../../api.ts";
import { CardView, type CardAction } from "../../components/cards/CardView.tsx";
import { jevTotals } from "../../jevTrace.ts";

function JevChip({ trace }: { trace: Trace }) {
  const { ms, requests } = jevTotals(trace);
  return (
    <span className="badge badge-sm badge-primary badge-soft">
      Jev {ms} ms{requests > 1 && ` · ${requests} requests`}
    </span>
  );
}

const OUTCOME_BADGE: Record<Outcome, string> = {
  call: "badge-success",
  confirm: "badge-warning",
  ask: "badge-info",
  choices: "badge-info",
  chat: "badge-ghost",
  unsupported: "badge-ghost",
  cancel: "badge-ghost",
  error: "badge-error",
};

/**
 * One chat message. Assistant replies show trace badges and their card, and clicking a reply's
 * text selects it in the inspector.
 */
export function MessageBubble(props: {
  message: ChatMessage;
  selected: boolean;
  isLatest: boolean;
  /** What the conversation is waiting on, if anything. */
  pending: Pending | null;
  busy: boolean;
  onSelect: () => void;
  onAction: (a: CardAction) => void;
}) {
  const { message, selected, isLatest, pending, busy, onSelect, onAction } = props;

  if (message.role === "user") {
    return (
      <div className="chat chat-end">
        <div className="chat-bubble chat-bubble-primary">{message.text}</div>
      </div>
    );
  }

  const trace = message.trace as Trace | null;
  const card = message.card;
  const interactive = isLatest && !!pending && !busy;
  const typed = trace?.spelling?.original ?? trace?.followUp?.original;
  const handled = trace?.followUp?.resolved ?? trace?.spelling?.corrected;
  const readAs = typed && handled && handled !== typed ? handled : undefined;

  return (
    <div className="chat chat-start">
      <div className="chat-header mb-1 flex flex-wrap items-center gap-1">
        {trace?.call && (
          <span
            className={`badge badge-sm ${trace.call.isError ? "badge-error" : "badge-neutral"}`}
          >
            ● {SERVER_LABELS[trace.call.server] ?? trace.call.server} · {trace.call.tool} ·{" "}
            {trace.call.ms} ms
          </span>
        )}
        {trace?.jev?.response && <JevChip trace={trace} />}
        {trace && (
          <span className={`badge badge-sm badge-soft ${OUTCOME_BADGE[trace.decision.outcome]}`}>
            {trace.decision.outcome}
          </span>
        )}
        <span className="badge badge-sm badge-ghost">LLM: no</span>
      </div>
      <div
        className={`chat-bubble bg-base-100 text-base-content shadow-sm transition ${selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-base-300"}`}
      >
        <button
          type="button"
          aria-pressed={selected}
          className="block w-full cursor-pointer text-left"
          onClick={onSelect}
          title="Show in the Jev inspector"
        >
          {readAs && (
            <span
              className="mb-1 block text-xs text-base-content/60"
              title="Rewritten by spell check or follow-up handling before the request ran"
            >
              ✎ Read as “{readAs}”
            </span>
          )}
          <span className="block whitespace-pre-line">{message.text}</span>
        </button>
        {card && (
          <div className="mt-2">
            <CardView card={card} interactive={interactive} busy={busy} onAction={onAction} />
          </div>
        )}
      </div>
    </div>
  );
}
