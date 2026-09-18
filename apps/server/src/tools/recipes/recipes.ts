import {
  CATEGORIES,
  CUISINES,
  type Category,
  type Course,
  type Cuisine,
} from "@jev-chat/mcp-recipes/mealdb";
import { z } from "zod";

import { candidateQ, choiceQ, noulQ } from "../../jev/questions.ts";
import {
  argText,
  rawFallback,
  readResult,
  textOf,
  type SingleStepAdapter,
} from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";

const meal = z.object({
  id: z.string(),
  name: z.string(),
  thumbnail: z.string(),
  category: z.string().optional(),
  cuisine: z.string().optional(),
});
const mealList = z.object({
  meals: z.array(meal).default([]),
  dropped: z.array(z.string()).default([]),
});
const recipe = meal.extend({
  ingredients: z.array(z.object({ ingredient: z.string(), measure: z.string() })),
  steps: z.array(z.string()),
  youtube: z.string().optional(),
  source: z.string().optional(),
});

const CATEGORY_OPTIONS: Record<Category, string> = {
  Beef: "Beef dishes",
  Breakfast: "Breakfast dishes",
  Chicken: "Chicken dishes",
  Dessert: "Desserts, sweets, cakes",
  Goat: "Goat dishes",
  Lamb: "Lamb dishes",
  Miscellaneous: "Miscellaneous",
  Pasta: "Pasta dishes",
  Pork: "Pork dishes",
  Seafood: "Fish and seafood",
  Side: "Side dishes",
  Starter: "Starters, appetizers",
  Vegan: "Vegan / plant-based (no animal products)",
  Vegetarian: "Vegetarian / meat-free",
};

const COURSE_OPTIONS: Record<Course, string> = {
  main: "A main meal: dinner, lunch, supper, something filling",
  dessert: "Dessert or something sweet",
  breakfast: "Breakfast or brunch",
  any: "No meal or course mentioned",
};

function isCategory(v: string | undefined): v is Category {
  return !!v && (CATEGORIES as readonly string[]).includes(v);
}

function isCuisine(v: string | undefined): v is Cuisine {
  return !!v && (CUISINES as readonly string[]).includes(v);
}

/** Lowercase a heading's first letter unless it starts with a cuisine name. */
function midSentence(heading: string): string {
  if (isCuisine(heading.split(" ")[0])) return heading;
  return heading.charAt(0).toLowerCase() + heading.slice(1);
}

function recipeNoun(category: string | undefined, course: unknown): string {
  if (category === "Dessert" || course === "dessert") return "desserts";
  if (category === "Breakfast" || course === "breakfast") return "breakfasts";
  if (course === "main") return "mains";
  return "recipes";
}

/** "Vegan mains", "Indian vegetarian recipes", "Recipes with chickpeas" */
function recipeHeading(args: Record<string, unknown>, dropped: string[]): string {
  const keep = (k: string) => (dropped.includes(k) ? undefined : (args[k] as string | undefined));
  const category = keep("category");
  const cuisine = keep("cuisine");
  const ingredient = keep("ingredient");
  const noun = recipeNoun(category, args.course);
  const adjective =
    category && !["Dessert", "Breakfast"].includes(category) ? category.toLowerCase() : undefined;
  const words = [cuisine, adjective, noun].filter(Boolean).join(" ");
  const text = `${words}${ingredient ? ` with ${ingredient}` : ""}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const findRecipes: SingleStepAdapter = {
  id: "recipes.find_meals",
  server: "recipes",
  mcpName: "find_meals",
  label: "Find recipes",
  description:
    "Suggest recipes or meal ideas by diet or type (vegan, chicken, dessert), cuisine, or ingredient",
  examples: ["Something vegan for dinner", "Italian recipes with chicken"],
  questions: (p) => ({
    category: choiceQ("For recipe ideas: which category of dish does the user want?", {
      ...CATEGORY_OPTIONS,
      none: "No diet or dish type mentioned",
    }),
    cuisine: choiceQ("For recipe ideas: which cuisine does the user want?", {
      ...Object.fromEntries(CUISINES.map((c) => [c, null])),
      none: "No cuisine mentioned",
    }),
    course: choiceQ("For recipe ideas: which meal or course is it for?", COURSE_OPTIONS),
    ingredient_stated: noulQ(
      "For recipe ideas: does the user name a specific ingredient they want to cook with (not a diet like vegan)?",
    ),
    ingredient: candidateQ(
      "For recipe ideas: which phrase is the ingredient to cook with?",
      p.text,
      "No ingredient",
    ),
  }),
  build(a, p, partial = {}) {
    const args = new Args(a);
    args.fixed("limit", 6);

    if (isCategory(args.choice("category"))) args.option("category");
    if (isCuisine(args.choice("cuisine"))) args.option("cuisine");

    const chosen = args.choice("course", "any");
    args.set(
      "course",
      chosen === "any" && partial.course ? argText(partial.course) : chosen,
      "option",
      args.key("course"),
    );

    if (args.yes("ingredient_stated")) {
      const ing = args.candidate("ingredient", p.text);
      if (ing && ing.value.toLowerCase() !== argText(args.get("category")).toLowerCase()) {
        args.set("ingredient", ing.value, ing.source, args.key("ingredient"));
      }
    }

    if (!args.has("category") && !args.has("cuisine") && !args.has("ingredient")) {
      return args.missing(
        "category",
        "What are you in the mood for? A diet (vegan, vegetarian), a cuisine, or an ingredient?",
      );
    }
    return args.ok();
  },
  present(result, args) {
    const r = readResult(result, mealList, "find_meals");
    const meals = r?.meals ?? [];
    const dropped = r?.dropped ?? [];
    const heading = recipeHeading(args, dropped);
    const asked = midSentence(recipeHeading(args, []));
    if (!meals.length) {
      return {
        text: `I couldn't find any ${asked}.`,
        card: { type: "error", message: textOf(result) || "No recipes matched" },
      };
    }
    return {
      text: dropped.length
        ? `I couldn't find any ${asked}, so here are ${midSentence(heading)} instead:`
        : `Here are ${meals.length} ${midSentence(heading)}:`,
      card: { type: "recipes", heading, meals },
      lastResult: {
        summary: heading,
        items: meals.map((m) => ({
          id: m.id,
          title: m.name,
          subtitle: [m.cuisine, m.category].filter(Boolean).join(" · "),
        })),
        numbers: [],
      },
    };
  },
};

export const getRecipe: SingleStepAdapter = {
  id: "recipes.get_recipe",
  server: "recipes",
  mcpName: "get_recipe",
  label: "Get recipe",
  description:
    "Show how to make a dish: ingredients and steps for a recipe shown earlier or a named dish",
  examples: ["How do I make the first one?", "How do I make carbonara?"],
  questions: (p) => ({
    reference: candidateQ(
      "For showing a recipe: does the user refer to one of the recipes shown earlier? Which one?",
      p.items,
      "No reference to a shown recipe",
    ),
    dish: candidateQ(
      "For showing a recipe: which phrase names the dish the user wants to make?",
      p.text,
      "No dish named",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    const ref = args.candidate("reference", p.items);
    if (ref?.value.id) {
      args.fixed("id", ref.value.id);
      args.note("id", `${ref.value.title} (${ref.value.id})`, ref.source, args.key("reference"));
      return args.ok();
    }
    const dish = args.candidate("dish", p.text);
    if (dish) {
      args.set("name", dish.value, dish.source, args.key("dish"));
      return args.ok();
    }
    return args.missing("dish", "Which dish would you like the recipe for?");
  },
  present(result) {
    const r = readResult(result, recipe, "get_recipe");
    if (!r) return rawFallback(result);
    return {
      text: `${r.name}: ${r.ingredients.length} ingredients, ${r.steps.length} steps.`,
      card: {
        type: "recipe",
        name: r.name,
        thumbnail: r.thumbnail,
        category: r.category,
        cuisine: r.cuisine,
        ingredients: r.ingredients,
        steps: r.steps,
        youtube: r.youtube,
        source: r.source,
      },
      lastResult: {
        summary: `Recipe: ${r.name}`,
        items: [{ id: r.id, title: r.name }],
        numbers: [],
      },
    };
  },
};
