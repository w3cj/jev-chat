#!/usr/bin/env node
import { defineTool, failure, serve, structured } from "@jev-chat/mcp-kit";
import { z } from "zod";

import { CATEGORIES, COURSES, CUISINES, findMeals, getRecipe, mealsSummary } from "./mealdb.ts";

await serve("recipes", "0.1.0", (server) => {
  defineTool(
    server,
    "find_meals",
    {
      title: "Find recipes",
      description:
        "Find recipes by category (e.g. Vegan, Chicken, Dessert), cuisine and/or main ingredient. Filters combine; if nothing matches them all, cuisine and then ingredient are ignored, and `dropped` lists which.",
      inputSchema: {
        category: z.enum(CATEGORIES).optional().describe("Recipe category"),
        cuisine: z.enum(CUISINES).optional().describe("Cuisine / country"),
        ingredient: z
          .string()
          .optional()
          .describe("Main ingredient, e.g. 'chicken breast', 'chickpeas'"),
        course: z
          .enum(COURSES)
          .default("any")
          .describe("main excludes desserts, breakfasts, sides and starters"),
        limit: z.number().int().min(1).max(12).default(6),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      const out = await findMeals(args);
      return structured(mealsSummary(out), out);
    },
  );

  defineTool(
    server,
    "get_recipe",
    {
      title: "Get a recipe",
      description: "Full recipe (ingredients and steps) by id from find_meals, or by dish name.",
      inputSchema: {
        id: z.string().optional().describe("Recipe id from find_meals"),
        name: z.string().optional().describe("Dish name, e.g. 'carbonara'"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id, name }) => {
      const recipe = await getRecipe(id, name);
      if (!recipe) return failure(`No recipe found for ${id ?? `"${name}"`}.`);
      return structured(
        `${recipe.name}: ${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps`,
        recipe,
      );
    },
  );
});
