import type { Card, CardType } from "@jev-chat/server/types";
import type { FC } from "react";

import { ActionCard, ChoicesCard, ConfirmCard, ErrorCard } from "./ActionCards.tsx";
import { AnswerCard, QuoteCard } from "./AnswerCards.tsx";
import { CapabilitiesCard, DeviceStatusCard, SearchResultsCard, TasksCard } from "./ListCards.tsx";
import { RecipeCard, RecipesCard } from "./RecipeCards.tsx";
import type { CardActions, CardComponent } from "./types.ts";
import { CalcCard, WeatherCard } from "./WeatherCard.tsx";

const CARDS: { [K in CardType]: CardComponent<K> } = {
  weather: WeatherCard,
  calc: CalcCard,
  search_results: SearchResultsCard,
  tasks: TasksCard,
  device_status: DeviceStatusCard,
  capabilities: CapabilitiesCard,
  action: ActionCard,
  confirm: ConfirmCard,
  choices: ChoicesCard,
  error: ErrorCard,
  answer: AnswerCard,
  quote: QuoteCard,
  recipes: RecipesCard,
  recipe: RecipeCard,
};

/** Renders any card with the component registered for its type. */
export function CardView({ card, ...actions }: { card: Card } & CardActions) {
  const Component = CARDS[card.type] as FC<{ card: Card } & CardActions>;
  return <Component card={card} {...actions} />;
}

export type { CardAction } from "./types.ts";
