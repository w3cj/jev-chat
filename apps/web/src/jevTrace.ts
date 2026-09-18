import type { Trace } from "@jev-chat/server/types";

/** Counts the Jev requests a turn made and their total time. */
export function jevTotals(t: Trace) {
  const requests = [
    t.jev,
    t.spelling?.jev,
    t.followUp?.jev,
    ...(t.steps ?? []).map((s) => s.jev),
  ].filter((j) => !!j);
  return { requests: requests.length, ms: requests.reduce((n, j) => n + j.ms, 0) };
}
