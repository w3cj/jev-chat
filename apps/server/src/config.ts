/** IANA time zone for dates the server works out (Todoist's "tomorrow"). Unset: the host's zone. */
export const ASSISTANT_TZ = process.env.ASSISTANT_TZ?.trim() || undefined;

/** Temperature unit assumed when the user doesn't say. */
export const DEFAULT_TEMP_UNIT: "fahrenheit" | "celsius" =
  process.env.DEFAULT_UNITS?.trim().toLowerCase() === "celsius" ? "celsius" : "fahrenheit";

/** Turns kept in the conversation state's recent history. */
export const HISTORY_KEPT = 6;

/** Turns sent with the main request. */
export const HISTORY_FOR_TURN = 4;

/** Tool results kept for follow-ups that refer back to them. */
export const RESULTS_KEPT = 3;

/** Turns sent with the spelling request. */
export const HISTORY_FOR_PREPROCESSING = 2;

/** Below this confidence on the tool pick, a close runner-up turns the reply into buttons. */
export const CONFIDENT = 0.5;

/** How close the runner-up tool must be to trigger those buttons. */
export const CLOSE_MARGIN = 0.15;

/** A Noul answer counts as yes above this probability. */
export const NOUL_YES = 0.5;

/** Wikipedia quotes: also show the runner-up line when it scores within this of the best. */
export const ANSWER_RUNNER_UP_MARGIN = 0.2;
