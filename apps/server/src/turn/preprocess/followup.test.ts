import { describe, expect, it } from "vitest";

import { followUpContent, rewriteOptions, slotRewrite } from "./followup.ts";

describe("follow-ups", () => {
  it("extracts the new content from short follow-ups", () => {
    expect(followUpContent("What about the second?")).toBe("second");
    expect(followUpContent("and tomorrow?")).toBe("tomorrow");
    expect(followUpContent("How about the third one?")).toBe("third");
    expect(followUpContent("What year did the first twilight movie come out?")).toBeUndefined();
    expect(followUpContent("Something vegan for dinner")).toBeUndefined();
    expect(followUpContent("What's a 20% tip on $64?")).toBeUndefined();
    expect(followUpContent("the second one?")).toBe("second");
    expect(followUpContent("Make it blue")).toBeUndefined();
    expect(followUpContent("Turn it on")).toBeUndefined();
    expect(followUpContent("and turn it on")).toBeUndefined();
    expect(followUpContent("and the porch lights?")).toBe("porch lights");
  });
  describe("slotRewrite", () => {
    it("swaps a new date for the previous question's date", () => {
      expect(slotRewrite("What's on my todo list for today?", "tomorrow")).toEqual({
        slot: "date",
        rewrite: "What's on my todo list for tomorrow?",
      });
      expect(slotRewrite("Weather in Denver this weekend", "friday")?.rewrite).toBe(
        "Weather in Denver friday?",
      );
    });

    it("swaps a new place for the previous question's place", () => {
      expect(slotRewrite("What's the weather in Denver tomorrow?", "Boston")).toEqual({
        slot: "place",
        rewrite: "What's the weather in Boston tomorrow?",
      });
      expect(slotRewrite("Things to do in New York City", "Paris")?.rewrite).toBe(
        "Things to do in Paris?",
      );
    });

    it("recognises a place from the places list when compromise doesn't", () => {
      expect(slotRewrite("What's the weather in Seattle?", "nuuk")?.rewrite).toBe(
        "What's the weather in nuuk?",
      );
    });

    it("swaps a new number for the previous question's only number", () => {
      expect(slotRewrite("Convert 5 miles to km", "10")).toEqual({
        slot: "number",
        rewrite: "Convert 10 miles to km?",
      });
      expect(slotRewrite("What's 15% of 80?", "120")).toBeUndefined();
    });

    it("leaves content that isn't a date, number or place to Jev", () => {
      expect(slotRewrite("What year did the first twilight movie come out?", "second")).toBe(
        undefined,
      );
      expect(slotRewrite("Turn on the kitchen lights", "porch lights")).toBeUndefined();
    });

    it("leaves it to Jev when the previous question has no span of that kind", () => {
      expect(slotRewrite("What's the weather in Seattle?", "tomorrow")).toBeUndefined();
    });

    it("does not swap a span for itself", () => {
      expect(slotRewrite("What's the weather in Seattle?", "seattle")).toBeUndefined();
    });
  });

  it("builds rewrites of the previous question", () => {
    const options = rewriteOptions("What year did the first twilight movie come out?", "second");
    expect(options).toContain("What year did the second twilight movie come out?");
    expect(rewriteOptions("What's the weather in Seattle?", "tomorrow")).toContain(
      "What's the weather in Seattle tomorrow?",
    );
  });
});
