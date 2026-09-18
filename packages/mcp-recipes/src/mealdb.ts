import { fetchJson } from "@jev-chat/mcp-kit";
import { z } from "zod";

// Key "1" is TheMealDB's public test key (https://www.themealdb.com/api.php).
const BASE = `https://www.themealdb.com/api/json/v1/${process.env.MEALDB_API_KEY || "1"}`;

export const CATEGORIES = [
  "Beef",
  "Breakfast",
  "Chicken",
  "Dessert",
  "Goat",
  "Lamb",
  "Miscellaneous",
  "Pasta",
  "Pork",
  "Seafood",
  "Side",
  "Starter",
  "Vegan",
  "Vegetarian",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CUISINES = [
  "American",
  "British",
  "Canadian",
  "Chinese",
  "Croatian",
  "Dutch",
  "Egyptian",
  "Filipino",
  "French",
  "Greek",
  "Indian",
  "Irish",
  "Italian",
  "Jamaican",
  "Japanese",
  "Kenyan",
  "Malaysian",
  "Mexican",
  "Moroccan",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Syrian",
  "Thai",
  "Tunisian",
  "Turkish",
  "Ukrainian",
  "Vietnamese",
] as const;
export type Cuisine = (typeof CUISINES)[number];

export const COURSES = ["main", "dessert", "breakfast", "any"] as const;
export type Course = (typeof COURSES)[number];

/**
 * One meal as TheMealDB sends it. Ingredients arrive as numbered keys (`strIngredient1`…`20`),
 * caught by the catchall. Missing values are null or "" depending on the endpoint.
 */
const mealRecord = z
  .object({
    idMeal: z.string(),
    strMeal: z.string(),
    strMealThumb: z.string().nullish(),
    strCategory: z.string().nullish(),
    strArea: z.string().nullish(),
    strTags: z.string().nullish(),
    strInstructions: z.string().nullish(),
    strYoutube: z.string().nullish(),
    strSource: z.string().nullish(),
  })
  .catchall(z.string().nullish());

type MealRecord = z.infer<typeof mealRecord>;

/** Every endpoint answers with `{ meals: [...] }`, and with `meals: null` for "nothing found". */
const mealsResponse = z.object({ meals: z.array(mealRecord).nullish() });

async function get(path: string): Promise<MealRecord[]> {
  const { meals } = await fetchJson(`${BASE}/${path}`, mealsResponse, { service: "TheMealDB" });
  return meals ?? [];
}

export interface MealSummary {
  id: string;
  name: string;
  thumbnail: string;
  category?: string;
  cuisine?: string;
  tags?: string[];
}

export interface Recipe extends MealSummary {
  ingredients: { ingredient: string; measure: string }[];
  steps: string[];
  youtube?: string;
  source?: string;
}

function toRecipe(m: MealRecord): Recipe {
  const ingredients: Recipe["ingredients"] = [];
  for (let i = 1; i <= 20; i++) {
    const ingredient = m[`strIngredient${i}`]?.trim();
    if (ingredient) ingredients.push({ ingredient, measure: m[`strMeasure${i}`]?.trim() ?? "" });
  }
  const steps = (m.strInstructions ?? "")
    .split(/\r?\n+/)
    .map((s) => s.replace(/^(step\s*)?\d+[.):]?\s*/i, "").trim())
    .filter((s) => s.length > 3 && !/^step\s*\d*$/i.test(s));
  return {
    id: m.idMeal,
    name: m.strMeal,
    thumbnail: m.strMealThumb ?? "",
    category: m.strCategory ?? undefined,
    cuisine: m.strArea ?? undefined,
    tags: m.strTags
      ? m.strTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    ingredients,
    steps,
    youtube: m.strYoutube || undefined,
    source: m.strSource || undefined,
  };
}

/** The full recipe for a TheMealDB id, or undefined if there is none. */
export async function lookup(id: string): Promise<Recipe | undefined> {
  const [meal] = await get(`lookup.php?i=${encodeURIComponent(id)}`);
  return meal ? toRecipe(meal) : undefined;
}

/** The first recipe whose name matches `name`, or undefined if none does. */
export async function searchByName(name: string): Promise<Recipe | undefined> {
  const [meal] = await get(`search.php?s=${encodeURIComponent(name)}`);
  return meal ? toRecipe(meal) : undefined;
}

/**
 * The recipe for `id` when given, else the first match for `name`; undefined when that lookup
 * finds nothing (an unknown id doesn't fall back to `name`).
 */
export async function getRecipe(id?: string, name?: string): Promise<Recipe | undefined> {
  if (id) return lookup(id);
  if (name) return searchByName(name);
  return undefined;
}

async function filter(param: "c" | "a" | "i", value: string): Promise<MealSummary[]> {
  const meals = await get(`filter.php?${param}=${encodeURIComponent(value)}`);
  return meals.map((m) => ({
    id: m.idMeal,
    name: m.strMeal,
    thumbnail: m.strMealThumb ?? "",
  }));
}

const NOT_MAIN =
  /^(dessert|cake|pudding|sweet|baking|breakfast|snack|cookies?|chocolate|pie|tart)$/i;
const DESSERTISH = /^(dessert|cake|pudding|sweet|baking|chocolate|pie|tart)$/i;

function fitsCourse(r: Recipe, course: Course): boolean {
  const labels = [r.category ?? "", ...(r.tags ?? [])];
  if (course === "main") {
    return !labels.some((l) => NOT_MAIN.test(l)) && !["Side", "Starter"].includes(r.category ?? "");
  }
  if (course === "dessert") return labels.some((l) => DESSERTISH.test(l));
  if (course === "breakfast") return labels.some((l) => /breakfast/i.test(l));
  return true;
}

export interface MealQuery {
  category?: string;
  cuisine?: string;
  ingredient?: string;
  course?: Course;
  limit?: number;
}

export interface MealMatches {
  totalMatches: number;
  meals: MealSummary[];
  /** The filters left out to find any meals at all. */
  dropped: string[];
}

/**
 * Meals matching every given filter and the course. If nothing matches all of them, drop cuisine,
 * then ingredient, and list the dropped filters in `dropped`. The last filter is never dropped.
 */
export async function findMeals(query: MealQuery): Promise<MealMatches> {
  const exact = await findMealsExact(query);
  if (exact.meals.length) return { ...exact, dropped: [] };
  const dropped: string[] = [];
  const relaxed = { ...query };
  for (const key of ["cuisine", "ingredient"] as const) {
    const filters = [relaxed.category, relaxed.cuisine, relaxed.ingredient].filter(Boolean).length;
    if (!relaxed[key] || filters < 2) continue;
    relaxed[key] = undefined;
    dropped.push(key);
    // oxlint-disable-next-line no-await-in-loop
    const out = await findMealsExact(relaxed);
    if (out.meals.length) return { ...out, dropped };
  }
  return { ...exact, dropped: [] };
}

/** `findMeals`' result as numbered lines, starting with the filters it dropped, if any. */
export function mealsSummary(out: MealMatches): string {
  if (!out.meals.length) return "No recipes matched.";
  const lines = out.meals.map(
    (m, i) => `${i + 1}. ${m.name} (${[m.cuisine, m.category].filter(Boolean).join(", ")})`,
  );
  if (out.dropped.length) {
    lines.unshift(`No meals match every filter; ignoring ${out.dropped.join(" and ")}.`);
  }
  return lines.join("\n");
}

async function findMealsExact(query: MealQuery): Promise<Omit<MealMatches, "dropped">> {
  const lists: MealSummary[][] = [];
  if (query.category) lists.push(await filter("c", query.category));
  if (query.cuisine) lists.push(await filter("a", query.cuisine));
  if (query.ingredient) {
    const ing = query.ingredient.trim().toLowerCase().replace(/\s+/g, "_");
    let byIngredient = await filter("i", ing);
    if (!byIngredient.length && ing.endsWith("s")) {
      byIngredient = await filter("i", ing.slice(0, -1));
    }
    lists.push(byIngredient);
  }
  if (!lists.length) throw new Error("Give at least a category, cuisine or ingredient.");

  const [first, ...rest] = lists;
  const matches = first.filter((m) => rest.every((l) => l.some((x) => x.id === m.id)));

  // filter.php returns only id, name and thumbnail; the course check needs each meal's details.
  const course = query.course ?? "any";
  const detailed = (await Promise.all(matches.slice(0, 24).map((m) => lookup(m.id)))).filter(
    (r): r is Recipe => !!r,
  );
  const fitting = detailed.filter((r) => fitsCourse(r, course));
  const limit = query.limit ?? 6;
  return {
    totalMatches: matches.length,
    meals: fitting.slice(0, limit).map(({ id, name, thumbnail, category, cuisine, tags }) => ({
      id,
      name,
      thumbnail,
      category,
      cuisine,
      tags,
    })),
  };
}
