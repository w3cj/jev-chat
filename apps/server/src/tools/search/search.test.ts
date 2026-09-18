import { describe, expect, it } from "vitest";

import { buildArgs, jsonResult, runBuild, runMultiStep, textResult } from "../kit/testkit.ts";
import { webAnswer, webSearch } from "./search.ts";

describe("webSearch.build", () => {
  it("searches for the phrase Jev picked out of the message", () => {
    expect(
      buildArgs(webSearch, {
        message: "Search for rainy day things to do in Denver",
        answers: { query: "rainy day things to do in Denver" },
      }),
    ).toEqual({ query: "rainy day things to do in Denver", count: 5 });
  });

  it("asks what to search for when the message has no topic", () => {
    const { result } = runBuild(webSearch, { message: "search", answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("query");
  });
});

describe("webSearch.present", () => {
  it("strips markup from titles and keeps the results for follow-ups", () => {
    const out = webSearch.present(
      jsonResult(
        {
          url: "https://dmns.org",
          title: "Denver <strong>Museum</strong>",
          description: "A <b>museum</b>",
        },
        { url: "https://denverart.org", title: "Denver Art Museum", description: "Art" },
      ),
      { query: "rainy day things to do in Denver" },
    );
    expect(out.card).toMatchObject({ type: "search_results" });
    expect(out.lastResult?.items[0]).toMatchObject({
      title: "Denver Museum",
      subtitle: "A museum",
      url: "https://dmns.org",
    });
    expect(out.text).toBe('Top 2 results for "rainy day things to do in Denver":');
  });

  it("reports no results instead of an empty list", () => {
    const out = webSearch.present(textResult("no results"), { query: "asdfqwer" });
    expect(out.card?.type).toBe("error");
  });
});

describe("webAnswer.build", () => {
  it("carries the answer type as a private hint for run()", () => {
    const args = buildArgs(webAnswer, {
      message: "Who hosts the Syntax podcast?",
      answers: { query: "hosts the Syntax podcast", answer_type: "people" },
    });
    expect(args).toEqual({ query: "hosts the Syntax podcast", count: 5, __answerType: "people" });
  });

  it("defaults to the catch-all answer type", () => {
    const args = buildArgs(webAnswer, {
      message: "Why is the sky blue?",
      answers: { query: "sky blue" },
    });
    expect(args).toMatchObject({ __answerType: "other" });
  });

  it("asks what to look up when there's no topic", () => {
    const { result } = runBuild(webAnswer, { message: "who?", answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("query");
  });
});

const peopleResults = jsonResult(
  {
    url: "https://syntax.fm/about",
    title: "About Syntax",
    description: "Syntax is a web development podcast hosted by Wes Bos and Scott Tolinski.",
  },
  {
    url: "https://podcasts.apple.com/syntax",
    title: "Syntax on Apple Podcasts",
    description:
      "Full Stack Developers Wes Bos and Scott Tolinski dive deep into web development topics.",
  },
);

describe("webAnswer.run", () => {
  it("accepts every candidate Jev confirmed and quotes the evidence sentence", async () => {
    const { presented, log } = await runMultiStep(
      webAnswer,
      { query: "hosts the Syntax podcast", __answerType: "people" },
      {
        message: "Who hosts the Syntax podcast?",
        results: { brave_web_search: peopleResults },
        asks: [{ c1: true, c2: true, evidence: "(syntax.fm) Syntax is a web development podcast" }],
      },
    );

    expect(log.calls).toEqual([
      { tool: "brave_web_search", args: { query: "hosts the Syntax podcast", count: 5 } },
    ]);
    expect(log.asks[0].questions).toEqual(expect.arrayContaining(["c1", "c2", "evidence"]));

    const card = presented.card as Extract<typeof presented.card, { type: "answer" }>;
    expect(card.answers.map((a) => a.value).toSorted()).toEqual(["Scott Tolinski", "Wes Bos"]);
    expect(card.evidence?.source).toBe("syntax.fm");
    const joined = card.answers.map((a) => a.value).join(" and ");
    expect(presented.text).toBe(`Based on web results: ${joined}.`);
    expect(presented.lastResult?.summary).toBe(
      `Answer to "Who hosts the Syntax podcast?": ${joined}`,
    );
    expect(log.asks[0].title).toMatch(/^Jev judges \d+ candidate names \+ picks the evidence$/);
  });

  it("says it found no clear answer when Jev accepts nothing and picks no evidence", async () => {
    const { presented } = await runMultiStep(
      webAnswer,
      { query: "hosts the Syntax podcast", __answerType: "people" },
      {
        message: "Who hosts the Syntax podcast?",
        results: { brave_web_search: peopleResults },
        asks: [{ c1: false, c2: false }],
      },
    );
    expect(presented.text).toBe(
      'I searched for "hosts the Syntax podcast" but couldn\'t find a clear answer.',
    );
    expect(presented.lastResult?.summary).toBe('Web results for "hosts the Syntax podcast"');
  });

  it("drops the candidates Jev rejected", async () => {
    const { presented } = await runMultiStep(
      webAnswer,
      { query: "hosts the Syntax podcast", __answerType: "people" },
      {
        message: "Who hosts the Syntax podcast?",
        results: { brave_web_search: peopleResults },
        asks: [
          { c1: true, c2: false, evidence: "(syntax.fm) Syntax is a web development podcast" },
        ],
      },
    );
    const card = presented.card as Extract<typeof presented.card, { type: "answer" }>;
    expect(card.answers.map((a) => a.value)).toEqual(["Wes Bos"]);
  });

  it("picks a single value for a non-people question and reuses its number", async () => {
    const { presented, log } = await runMultiStep(
      webAnswer,
      { query: "Mount Rainier height", __answerType: "number" },
      {
        message: "How tall is Mount Rainier?",
        results: {
          brave_web_search: jsonResult({
            url: "https://nps.gov/mora",
            title: "Mount Rainier National Park",
            description:
              "The summit of Mount Rainier stands at 14,411 ft above sea level in Washington state.",
          }),
        },
        asks: [{ value: "14,411 ft", evidence: "(nps.gov) The summit of Mount Rainier" }],
      },
    );

    const card = presented.card as Extract<typeof presented.card, { type: "answer" }>;
    expect(card.answers.map((a) => a.value)).toEqual(["14,411 ft"]);
    expect(presented.text).toBe("Based on web results: 14,411 ft.");
    expect(log.asks[0].title).toMatch(/^Jev judges \d+ candidate values \+ picks the evidence$/);
    expect(presented.lastResult?.numbers[0]?.value).toBe(14411);
  });

  it("offers the amount at full magnitude, so a follow-up converts the right number", async () => {
    const { presented } = await runMultiStep(
      webAnswer,
      { query: "Eiffel Tower cost", __answerType: "number" },
      {
        message: "How much did the Eiffel Tower cost to build?",
        results: {
          brave_web_search: jsonResult({
            url: "https://toureiffel.paris/en",
            title: "The Eiffel Tower",
            description:
              "Construction of the tower cost $1.5 million in 1889, a considerable sum at the time.",
          }),
        },
        asks: [{ value: "$1.5 million", evidence: "(toureiffel.paris) Construction of the tower" }],
      },
    );

    expect(presented.lastResult?.numbers).toEqual([{ value: 1_500_000, label: "$1.5 million" }]);
  });

  it("shows the best line it found when no candidate is accepted", async () => {
    const { presented } = await runMultiStep(
      webAnswer,
      { query: "hosts the Syntax podcast", __answerType: "people" },
      {
        message: "Who hosts the Syntax podcast?",
        results: { brave_web_search: peopleResults },
        asks: [
          { c1: false, c2: false, evidence: "(syntax.fm) Syntax is a web development podcast" },
        ],
      },
    );
    expect(presented.text).toBe("Here's the most relevant line I found:");
  });

  it("stops cleanly when the search returns nothing usable", async () => {
    const { presented } = await runMultiStep(
      webAnswer,
      { query: "asdfqwer", __answerType: "other" },
      {
        message: "asdfqwer?",
        results: { brave_web_search: textResult("no results", true) },
        asks: [],
      },
    );
    expect(presented.card?.type).toBe("error");
    expect(presented.text).toMatch(/couldn't find anything/i);
  });
});
