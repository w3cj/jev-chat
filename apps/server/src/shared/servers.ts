export type ServerId = "weather" | "units" | "search" | "todoist" | "home" | "wiki" | "recipes";

/** Display name per server. */
export const SERVER_LABELS: Record<ServerId, string> = {
  weather: "Weather",
  units: "Units & maths",
  search: "Brave Search",
  todoist: "Todoist",
  home: "Home Assistant",
  wiki: "Wikipedia",
  recipes: "Recipes",
};
