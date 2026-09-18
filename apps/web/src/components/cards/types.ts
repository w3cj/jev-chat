import type { Card, CardType, TurnAction } from "@jev-chat/server/types";
import type { FC } from "react";

/**
 * What a card's buttons can do: the actions the server already understands, plus "say", which
 * just sends text as if the user had typed it.
 */
export type CardAction = TurnAction | { type: "say"; text: string };

export interface CardActions {
  /** True on the newest reply while the conversation waits on the user and nothing is in flight. */
  interactive: boolean;
  /** A turn is in flight. */
  busy: boolean;
  onAction: (a: CardAction) => void;
}

/** A renderer for one card variant, narrowed to that variant's own shape. */
export type CardComponent<K extends CardType> = FC<
  { card: Extract<Card, { type: K }> } & CardActions
>;
