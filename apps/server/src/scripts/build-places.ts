/* oxlint-disable no-console */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { fold } from "../tools/index.ts";

const require = createRequire(import.meta.url);
const provinces = require("provinces") as { name: string; country: string }[];
const { countries } = require("countries-list") as {
  countries: Record<string, { name: string; native: string; capital: string }>;
};

const names = new Set<string>();
const add = (value: string | undefined) => {
  const key = fold(value ?? "");
  if (key.length > 1) names.add(key);
};

for (const p of provinces) add(p.name);
for (const c of Object.values(countries)) {
  add(c.name);
  add(c.native);
  add(c.capital);
}

const out = [...names].toSorted();
const path = new URL("../tools/search/places.txt", import.meta.url);
writeFileSync(path, `${out.join("\n")}\n`);

console.log(`${out.length} names -> ${path.pathname}`);
console.log(
  `  ${provinces.length} subdivisions, ${Object.keys(countries).length} countries (+ native names and capitals)`,
);
