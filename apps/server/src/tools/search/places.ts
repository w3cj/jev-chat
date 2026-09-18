import { readFileSync } from "node:fs";

/** Strip accents and case ("Zürich" → "zurich"). */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

const NAMES: ReadonlySet<string> = new Set(
  readFileSync(new URL("./places.txt", import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean),
);

/** "Mount Rainier", "Lake Tahoe", "São Paulo" */
const PLACE_PREFIX =
  /^(?:mount|mt\.?|lake|cape|port|fort|s[aã]o|san|santa|saint|st\.?|new|north|south|east|west)\s/i;

/** "Pierce County", "Kyoto Prefecture", "Hudson River" */
const PLACE_SUFFIX =
  /\s(?:county|city|island|islands|river|valley|mountains?|bay|park|province|prefecture|region|state|peninsula|desert|lake|sea|ocean|beach|falls|canyon)$/i;

/** Whether a candidate span reads as a place: named in the list, or shaped like one. */
export function isPlace(span: string): boolean {
  return NAMES.has(fold(span)) || PLACE_PREFIX.test(span) || PLACE_SUFFIX.test(span);
}

/** How many place names are loaded. */
export function placeCount(): number {
  return NAMES.size;
}
