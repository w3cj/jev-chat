import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findMeals, getRecipe, lookup, mealsSummary, searchByName } from "./mealdb.ts";

type Meal = Record<string, string | null>;

function meal(id: string, name: string, fields: Meal = {}): Meal {
  return { idMeal: id, strMeal: name, strMealThumb: `https://img/${id}.jpg`, ...fields };
}

const MEALS: Record<string, Meal> = {
  "1": meal("1", "Chickpea Curry", {
    strCategory: "Vegan",
    strArea: "Indian",
    strTags: "Curry, ,Spicy",
    strInstructions: "STEP 1\r\n1. Rinse the chickpeas.\r\n\r\nStep 2: Simmer for 20 minutes.\nOk",
    strIngredient1: "Chickpeas ",
    strMeasure1: " 400g",
    strIngredient2: "",
    strMeasure2: "",
    strIngredient3: "Onion",
    strMeasure3: null,
    strYoutube: "",
    strSource: "https://example.com/curry",
  }),
  "2": meal("2", "Vegan Brownies", { strCategory: "Vegan", strTags: "Chocolate,Baking" }),
  "3": meal("3", "Vegan Pancakes", { strCategory: "Vegan", strTags: "Breakfast" }),
  "4": meal("4", "Butter Chicken", { strCategory: "Chicken", strArea: "Indian" }),
  "5": meal("5", "Vegan Samosas", { strCategory: "Starter", strArea: "Indian" }),
};

const FILTERS: Record<string, string[]> = {
  "c=Vegan": ["1", "2", "3"],
  "a=Indian": ["1", "4", "5"],
  "i=chickpea": ["1"],
  "c=Chicken": ["4"],
};

/** Stub TheMealDB with the meals above; filter.php answers with id, name and thumbnail only. */
function stubMealDb() {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(input as string);
    const endpoint = url.pathname.split("/").pop();
    const [[param, value]] = url.searchParams;
    let meals: Meal[] = [];
    if (endpoint === "lookup.php") meals = MEALS[value] ? [MEALS[value]] : [];
    if (endpoint === "search.php") {
      meals = Object.values(MEALS).filter((m) => m.strMeal?.toLowerCase().includes(value));
    }
    if (endpoint === "filter.php") {
      meals = (FILTERS[`${param}=${value}`] ?? []).map((id) => {
        const { idMeal, strMeal, strMealThumb } = MEALS[id];
        return { idMeal, strMeal, strMealThumb };
      });
    }
    return Response.json({ meals: meals.length ? meals : null });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const requested = (fetch: ReturnType<typeof stubMealDb>) =>
  fetch.mock.calls.map(([url]) => (url as string).split("/").pop());
const names = (out: { meals: { name: string }[] }) => out.meals.map((m) => m.name);

beforeEach(() => {
  stubMealDb();
});
afterEach(() => vi.unstubAllGlobals());

describe("lookup", () => {
  it("reads ingredients, numbered steps and tags into a recipe", async () => {
    expect(await lookup("1")).toEqual({
      id: "1",
      name: "Chickpea Curry",
      thumbnail: "https://img/1.jpg",
      category: "Vegan",
      cuisine: "Indian",
      tags: ["Curry", "Spicy"],
      ingredients: [
        { ingredient: "Chickpeas", measure: "400g" },
        { ingredient: "Onion", measure: "" },
      ],
      steps: ["Rinse the chickpeas.", "Simmer for 20 minutes."],
      youtube: undefined,
      source: "https://example.com/curry",
    });
  });

  it("returns empty lists for missing fields", async () => {
    expect(await lookup("4")).toMatchObject({ tags: [], ingredients: [], steps: [] });
  });

  it("returns undefined for an unknown id", async () => {
    expect(await lookup("999")).toBeUndefined();
  });

  it("throws when TheMealDB fails or answers in an unexpected shape", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    await expect(lookup("1")).rejects.toThrow("TheMealDB request failed (503)");
    vi.stubGlobal("fetch", async () => Response.json({ meals: [{ idMeal: 1 }] }));
    await expect(lookup("1")).rejects.toThrow(/Unexpected TheMealDB response/);
  });
});

describe("searchByName", () => {
  it("returns the first recipe whose name matches", async () => {
    expect((await searchByName("curry"))?.id).toBe("1");
    expect(await searchByName("lasagne")).toBeUndefined();
  });
});

describe("getRecipe", () => {
  it("looks up by id when given one, else searches by name", async () => {
    expect((await getRecipe("4", "curry"))?.name).toBe("Butter Chicken");
    expect((await getRecipe(undefined, "curry"))?.name).toBe("Chickpea Curry");
    expect((await getRecipe("999", "curry"))?.name).toBeUndefined();
    expect(await getRecipe()).toBeUndefined();
  });
});

describe("findMeals", () => {
  it("returns meals that match every filter", async () => {
    expect(await findMeals({ category: "Vegan", cuisine: "Indian" })).toEqual({
      totalMatches: 1,
      dropped: [],
      meals: [
        {
          id: "1",
          name: "Chickpea Curry",
          thumbnail: "https://img/1.jpg",
          category: "Vegan",
          cuisine: "Indian",
          tags: ["Curry", "Spicy"],
        },
      ],
    });
  });

  it("keeps only meals that fit the course", async () => {
    expect(names(await findMeals({ category: "Vegan", course: "main" }))).toEqual([
      "Chickpea Curry",
    ]);
    expect(names(await findMeals({ category: "Vegan", course: "dessert" }))).toEqual([
      "Vegan Brownies",
    ]);
    expect(names(await findMeals({ category: "Vegan", course: "breakfast" }))).toEqual([
      "Vegan Pancakes",
    ]);
    expect(await findMeals({ cuisine: "Indian", course: "main" })).toMatchObject({
      totalMatches: 3,
      meals: [{ name: "Chickpea Curry" }, { name: "Butter Chicken" }],
    });
  });

  it("caps the list at the limit", async () => {
    expect(names(await findMeals({ category: "Vegan", limit: 2 }))).toEqual([
      "Chickpea Curry",
      "Vegan Brownies",
    ]);
  });

  it("matches an ingredient as TheMealDB spells it, retrying without a plural s", async () => {
    const fetch = stubMealDb();
    expect(names(await findMeals({ ingredient: " Chickpeas " }))).toEqual(["Chickpea Curry"]);
    expect(requested(fetch).slice(0, 2)).toEqual([
      "filter.php?i=chickpeas",
      "filter.php?i=chickpea",
    ]);
  });

  it("drops cuisine, then ingredient, until something matches, and says which it dropped", async () => {
    expect(await findMeals({ category: "Vegan", cuisine: "Thai" })).toMatchObject({
      dropped: ["cuisine"],
      meals: [{ name: "Chickpea Curry" }, { name: "Vegan Brownies" }, { name: "Vegan Pancakes" }],
    });
    expect(
      await findMeals({ category: "Chicken", cuisine: "Thai", ingredient: "chickpea" }),
    ).toMatchObject({ dropped: ["cuisine", "ingredient"], meals: [{ name: "Butter Chicken" }] });
  });

  it("never drops the last filter", async () => {
    expect(await findMeals({ cuisine: "Thai" })).toEqual({
      totalMatches: 0,
      meals: [],
      dropped: [],
    });
    expect(await findMeals({ category: "Beef", cuisine: "Thai" })).toEqual({
      totalMatches: 0,
      meals: [],
      dropped: [],
    });
  });

  it("needs at least one filter", async () => {
    await expect(findMeals({ course: "main" })).rejects.toThrow(/at least a category/);
  });
});

describe("mealsSummary", () => {
  const meals = [
    { id: "1", name: "Chickpea Curry", thumbnail: "", cuisine: "Indian", category: "Vegan" },
    { id: "2", name: "Vegan Brownies", thumbnail: "", category: "Vegan" },
  ];

  it("numbers each meal with its cuisine and category", () => {
    expect(mealsSummary({ totalMatches: 2, meals, dropped: [] })).toBe(
      "1. Chickpea Curry (Indian, Vegan)\n2. Vegan Brownies (Vegan)",
    );
  });

  it("says which filters were ignored to find any meals", () => {
    expect(
      mealsSummary({ totalMatches: 2, meals, dropped: ["cuisine", "ingredient"] }).split("\n")[0],
    ).toBe("No meals match every filter; ignoring cuisine and ingredient.");
  });

  it("says so when nothing matched", () => {
    expect(mealsSummary({ totalMatches: 0, meals: [], dropped: [] })).toBe("No recipes matched.");
  });
});
