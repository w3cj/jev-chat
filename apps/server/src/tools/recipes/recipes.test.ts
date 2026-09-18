import { describe, expect, it } from "vitest";

import type { ConversationState } from "../../shared/types.ts";
import { buildArgs, runBuild, textResult, toolResult } from "../kit/testkit.ts";
import { findRecipes, getRecipe } from "./recipes.ts";

const shownRecipes: ConversationState = {
  recent: [],
  results: [
    {
      toolId: "recipes.find_meals",
      label: "Find recipes",
      args: {},
      summary: "Vegan mains",
      items: [{ id: "52944", title: "Vegan Lasagna", subtitle: "Italian · Vegan" }],
      numbers: [],
    },
  ],
};

describe("findRecipes.build", () => {
  it("combines a category with the course", () => {
    expect(
      buildArgs(findRecipes, {
        message: "Something vegan for dinner",
        answers: { category: "Vegan", course: "main" },
      }),
    ).toEqual({
      limit: 6,
      category: "Vegan",
      course: "main",
    });
  });

  it("keeps the course from the original question when answering a follow-up prompt", () => {
    const args = buildArgs(findRecipes, {
      message: "Italian",
      partial: { course: "dessert" },
      answers: { cuisine: "Italian", course: "any" },
    });
    expect(args).toMatchObject({ cuisine: "Italian", course: "dessert" });
  });

  it("doesn't filter by an ingredient that just repeats the category", () => {
    const args = buildArgs(findRecipes, {
      message: "something with chicken",
      answers: { category: "Chicken", ingredient_stated: true, ingredient: "chicken" },
    });
    expect(args).not.toHaveProperty("ingredient");
  });

  it("keeps a real ingredient alongside the category", () => {
    const args = buildArgs(findRecipes, {
      message: "Italian recipes with chickpeas",
      answers: { cuisine: "Italian", ingredient_stated: true, ingredient: "chickpeas" },
    });
    expect(args).toMatchObject({ cuisine: "Italian", ingredient: "chickpeas" });
  });

  it("asks what the user is in the mood for when nothing narrows it down", () => {
    const { result } = runBuild(findRecipes, { message: "what should I cook?", answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("category");
  });
});

describe("findRecipes.present", () => {
  const meals = {
    meals: [
      {
        id: "52944",
        name: "Vegan Lasagna",
        thumbnail: "https://img/1",
        category: "Vegan",
        cuisine: "Italian",
      },
    ],
    dropped: [],
  };

  it("names the heading after the filters that survived", () => {
    const out = findRecipes.present(toolResult(meals), { category: "Vegan", course: "main" });
    expect(out.card).toMatchObject({ type: "recipes", heading: "Vegan mains" });
    expect(out.text).toBe("Here are 1 vegan mains:");
  });

  it("says which filter it had to drop", () => {
    const out = findRecipes.present(toolResult({ ...meals, dropped: ["cuisine"] }), {
      category: "Vegan",
      cuisine: "Japanese",
      course: "main",
    });
    expect(out.text).toMatch(
      /^I couldn't find any Japanese vegan mains, so here are vegan mains instead:/,
    );
  });

  it("names desserts, breakfasts and ingredient searches in the heading", () => {
    const heading = (args: Record<string, unknown>) =>
      (findRecipes.present(toolResult(meals), args).card as { heading: string }).heading;
    expect(heading({ category: "Dessert", course: "any" })).toBe("Desserts");
    expect(heading({ cuisine: "French", course: "breakfast" })).toBe("French breakfasts");
    expect(heading({ ingredient: "chickpeas", course: "any" })).toBe("Recipes with chickpeas");
  });

  it("keeps a leading cuisine capitalised mid-sentence", () => {
    const out = findRecipes.present(toolResult(meals), { cuisine: "Italian", course: "any" });
    expect(out.text).toBe("Here are 1 Italian recipes:");
  });

  it("reports no matches without inventing a recipe", () => {
    const out = findRecipes.present(toolResult({ meals: [], dropped: [] }), {
      category: "Goat",
      course: "dessert",
    });
    expect(out.card?.type).toBe("error");
    expect(out.text).toMatch(/couldn't find any/i);
  });
});

describe("getRecipe", () => {
  it("prefers the id of a recipe shown earlier", () => {
    expect(
      buildArgs(getRecipe, {
        message: "How do I make the first one?",
        state: shownRecipes,
        answers: { reference: "#1" },
      }),
    ).toEqual({
      id: "52944",
    });
  });

  it("falls back to a dish named in the message", () => {
    expect(
      buildArgs(getRecipe, { message: "How do I make carbonara?", answers: { dish: "carbonara" } }),
    ).toEqual({ name: "carbonara" });
  });

  it("asks which dish when neither is available", () => {
    const { result } = runBuild(getRecipe, { message: "show me the recipe", answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("dish");
  });

  it("presents ingredients and steps", () => {
    const out = getRecipe.present(
      toolResult({
        id: "52944",
        name: "Vegan Lasagna",
        thumbnail: "https://img/1",
        category: "Vegan",
        cuisine: "Italian",
        ingredients: [{ ingredient: "Lasagne sheets", measure: "200g" }],
        steps: ["Boil the sheets.", "Layer it up."],
      }),
      {},
    );
    expect(out.card).toMatchObject({ type: "recipe", name: "Vegan Lasagna" });
    expect(out.text).toBe("Vegan Lasagna: 1 ingredients, 2 steps.");
  });

  it("falls back to the tool's text on an unexpected shape", () => {
    expect(getRecipe.present(textResult('No recipe found for "blancmange".'), {}).card?.type).toBe(
      "error",
    );
  });
});
