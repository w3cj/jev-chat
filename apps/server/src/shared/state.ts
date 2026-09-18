import type { ArgTrace } from "./trace.ts";

/** Longest message the API accepts, in characters. */
export const MAX_MESSAGE_CHARS = 1000;

/** An item shown to the user that later turns can refer to ("the first one"). */
export interface ShownItem {
  title: string;
  subtitle?: string;
  id?: string;
  url?: string;
}

/** A number from a tool result that later turns can reuse ("what's the high in celsius?"). */
export interface ShownNumber {
  value: number;
  label: string;
  /** The unit-converter's name for the number's unit (e.g. "fahrenheit"), when it has one */
  unit?: string;
}

export interface ShownResult {
  toolId: string;
  label: string;
  args: Record<string, unknown>;
  summary: string;
  items: ShownItem[];
  numbers: ShownNumber[];
}

export type Pending =
  | {
      type: "confirm";
      toolId: string;
      args: Record<string, unknown>;
      argSources: ArgTrace[];
      prompt: string;
    }
  | {
      type: "ask";
      toolId: string;
      missing: string;
      prompt: string;
      message: string;
      partialArgs: Record<string, unknown>;
    }
  | { type: "choose"; options: string[]; message: string; prompt: string };

export interface ConversationState {
  pending?: Pending;
  /** Recent tool results, newest first */
  results?: ShownResult[];
  recent: { user: string; assistant: string }[];
}

export type TurnAction = { type: "confirm" } | { type: "cancel" } | { type: "pick"; value: string };

/** The label a button click is recorded under. */
export function actionLabel(action: TurnAction) {
  if (action.type === "confirm") return "Confirm";
  if (action.type === "cancel") return "Cancel";
  return `Pick: ${action.value}`;
}
