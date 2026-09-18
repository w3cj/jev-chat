import { describe, expect, it } from "vitest";

import type { JevAnswerJson } from "../../shared/types.ts";
import { buildArgs, runBuild, runMultiStep, textResult, toolResult } from "../kit/testkit.ts";
import { wikiFact } from "./wiki.ts";

describe("wikiFact.build", () => {
  it("looks up the topic named in the question", () => {
    expect(
      buildArgs(wikiFact, {
        message: "How tall is Mount Rainier?",
        answers: { topic: "Mount Rainier" },
      }),
    ).toEqual({
      query: "Mount Rainier",
    });
  });

  it("records that the topic came from the message", () => {
    const { result } = runBuild(wikiFact, {
      message: "Who founded Nintendo?",
      answers: { topic: "Nintendo" },
    });
    expect(result.sources[0]).toMatchObject({
      name: "query",
      value: "Nintendo",
      source: "message",
    });
  });

  it("asks what to look up when no topic is named", () => {
    const { result } = runBuild(wikiFact, { message: "how tall is it?", answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("topic");
  });
});

const MESSAGE = "How tall is Mount Rainier?";

const searchHit = toolResult({
  results: [
    {
      title: "Mount Rainier",
      description: "Stratovolcano in Washington",
      url: "https://en.wikipedia.org/wiki/Mount_Rainier",
    },
    {
      title: "Mount Rainier National Park",
      description: "National park",
      url: "https://en.wikipedia.org/wiki/Mount_Rainier_National_Park",
    },
  ],
});

const article = toolResult({
  title: "Mount Rainier",
  url: "https://en.wikipedia.org/wiki/Mount_Rainier",
  lines: [
    { n: 1, section: "Infobox", text: "Elevation: 14,406 ft (2025, NAVD88)" },
    {
      n: 2,
      section: "Introduction",
      text: "Mount Rainier is a large active stratovolcano in Washington.",
    },
    {
      n: 3,
      section: "Introduction",
      text: "With a summit elevation of 14,411 ft (4,392 m), it is the highest mountain in Washington.",
    },
  ],
});

const results = { search_articles: searchHit, get_article: article };

describe("wikiFact.run", () => {
  it("quotes the sentence Jev picked, word for word, with its source", async () => {
    const { presented, log } = await runMultiStep(
      wikiFact,
      { query: "Mount Rainier" },
      {
        message: MESSAGE,
        results,
        asks: [
          { article: "Mount Rainier — Stratovolcano in Washington" },
          {
            line: "With a summit elevation of 14,411 ft (4,392 m), it is the highest mountain in Washington.",
          },
        ],
      },
    );

    expect(log.calls.map((c) => c.tool)).toEqual(["search_articles", "get_article"]);
    expect(log.calls[1].args).toEqual({ title: "Mount Rainier" });
    expect(presented.card).toMatchObject({
      type: "quote",
      article: "Mount Rainier",
      quote:
        "With a summit elevation of 14,411 ft (4,392 m), it is the highest mountain in Washington.",
      lineNumber: 3,
    });
  });

  it("can answer from an infobox field", async () => {
    const { presented } = await runMultiStep(
      wikiFact,
      { query: "Mount Rainier" },
      {
        message: MESSAGE,
        results,
        asks: [
          { article: "Mount Rainier — Stratovolcano in Washington" },
          { line: "Elevation: 14,406 ft (2025, NAVD88)" },
        ],
      },
    );
    expect(presented.card).toMatchObject({
      type: "quote",
      section: "Infobox",
      quote: "Elevation: 14,406 ft (2025, NAVD88)",
      lineNumber: 1,
    });
    expect(presented.lastResult?.numbers.map((n) => n.value)).toContain(14406);
  });

  it("picks a meaning from a disambiguation page in the same request as the article", async () => {
    const { presented, log } = await runMultiStep(
      wikiFact,
      { query: "Mercury" },
      {
        message: "How far is Mercury from the Sun?",
        results: {
          search_articles: toolResult({
            results: [
              {
                title: "Mercury (element)",
                description: "Mercury (element), a chemical element",
                url: "https://en.wikipedia.org/wiki/Mercury_(element)",
                from: "Mercury",
              },
              {
                title: "Mercury (planet)",
                description: "First planet from the Sun",
                url: "https://en.wikipedia.org/wiki/Mercury_(planet)",
              },
            ],
          }),
          get_article: toolResult({
            title: "Mercury (planet)",
            url: "https://en.wikipedia.org/wiki/Mercury_(planet)",
            lines: [
              {
                n: 1,
                section: "Introduction",
                text: "Mercury orbits the Sun at an average distance of 0.387 AU.",
              },
            ],
          }),
        },
        asks: [
          { article: "Mercury (planet) — First planet from the Sun" },
          { line: "Mercury orbits the Sun at an average distance of 0.387 AU." },
        ],
      },
    );
    expect(log.asks.map((a) => a.title)).toEqual([
      "Jev picks the article",
      "Jev picks the answering line",
    ]);
    expect(log.calls[1]).toEqual({ tool: "get_article", args: { title: "Mercury (planet)" } });
    expect(presented.card).toMatchObject({ type: "quote", article: "Mercury (planet)" });
  });

  it("lists an article's meanings when the one picked is itself a disambiguation page", async () => {
    const { presented, log } = await runMultiStep(
      wikiFact,
      { query: "Mercury" },
      {
        message: "How big is Mercury?",
        results: {
          search_articles: toolResult({
            results: [
              {
                title: "Mercury",
                description: "Topics referred to by the same term",
                url: "https://en.wikipedia.org/wiki/Mercury",
              },
            ],
          }),
          get_article: toolResult({
            title: "Mercury",
            url: "https://en.wikipedia.org/wiki/Mercury",
            lines: [],
            truncated: false,
            meanings: [
              {
                title: "Mercury (planet)",
                description: "Mercury (planet), the closest planet to the Sun",
                url: "https://en.wikipedia.org/wiki/Mercury_(planet)",
              },
              {
                title: "Mercury (element)",
                description: "Mercury (element), a chemical element",
                url: "https://en.wikipedia.org/wiki/Mercury_(element)",
              },
            ],
          }),
        },
        asks: [{ article: "Mercury — Topics referred to by the same term" }],
      },
    );
    expect(log.calls.map((c) => c.tool)).toEqual(["search_articles", "get_article"]);
    expect(presented.text).toBe('"Mercury" can mean several things. Which one did you mean?');
    expect(presented.card).toMatchObject({
      type: "search_results",
      query: "Mercury",
      items: [
        { title: "Mercury (planet)", subtitle: "Mercury (planet), the closest planet to the Sun" },
        { title: "Mercury (element)", subtitle: "Mercury (element), a chemical element" },
      ],
    });
    expect(presented.lastResult?.items.map((i) => i.title)).toEqual([
      "Mercury (planet)",
      "Mercury (element)",
    ]);
  });

  it("also shows the runner-up line only when Jev nearly picked it", async () => {
    const quoteFor = async (lineProbabilities: Record<string, number>) => {
      const answers: Record<string, JevAnswerJson>[] = [
        { article: { type: "choice", choice: "r1", probabilities: { r1: 0.9 } } },
        { line: { type: "choice", choice: "l3", probabilities: lineProbabilities } },
      ];
      const presented = await wikiFact.run(
        { query: "Mount Rainier" },
        {
          message: MESSAGE,
          call: async (tool) => results[tool as keyof typeof results],
          ask: async () => answers.shift()!,
        },
      );
      return presented.card;
    };

    expect(await quoteFor({ l3: 0.5, l1: 0.4, l2: 0.05, none: 0.05 })).toMatchObject({
      quote:
        "With a summit elevation of 14,411 ft (4,392 m), it is the highest mountain in Washington.",
      also: "Elevation: 14,406 ft (2025, NAVD88)",
    });
    expect(await quoteFor({ l3: 0.8, l1: 0.1, l2: 0.05, none: 0.05 })).not.toHaveProperty(
      "also",
      expect.anything(),
    );
  });

  it("offers the numbers in the quote to the next turn, so it can convert them", async () => {
    const { presented } = await runMultiStep(
      wikiFact,
      { query: "Mount Rainier" },
      {
        message: MESSAGE,
        results,
        asks: [
          { article: "Mount Rainier — Stratovolcano in Washington" },
          {
            line: "With a summit elevation of 14,411 ft (4,392 m), it is the highest mountain in Washington.",
          },
        ],
      },
    );
    expect(presented.lastResult?.numbers.map((n) => n.value)).toEqual(
      expect.arrayContaining([14411, 4392]),
    );
  });

  it("shows the search results instead of guessing when no article fits", async () => {
    const { presented, log } = await runMultiStep(
      wikiFact,
      { query: "Mount Rainier" },
      {
        message: MESSAGE,
        results,
        asks: [{}],
      },
    );
    expect(log.calls.map((c) => c.tool)).toEqual(["search_articles"]);
    expect(presented.card?.type).toBe("search_results");
  });

  it("falls back to the article's first sentence when no line answers the question", async () => {
    const { presented } = await runMultiStep(
      wikiFact,
      { query: "Mount Rainier" },
      {
        message: MESSAGE,
        results,
        asks: [{ article: "Mount Rainier — Stratovolcano in Washington" }, {}],
      },
    );
    expect(presented.card).toMatchObject({
      type: "quote",
      fallback: "Mount Rainier is a large active stratovolcano in Washington.",
    });
    expect(presented.card).not.toHaveProperty("quote");
  });

  it("stops cleanly when Wikipedia finds nothing", async () => {
    const { presented } = await runMultiStep(
      wikiFact,
      { query: "asdfqwer" },
      {
        message: MESSAGE,
        results: { search_articles: textResult("No articles found.", true) },
        asks: [],
      },
    );
    expect(presented.card?.type).toBe("error");
    expect(presented.text).toMatch(/couldn't find a Wikipedia article/i);
  });
});
