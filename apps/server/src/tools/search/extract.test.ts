import { describe, expect, it } from "vitest";

import {
  cleanHtml,
  dedupeOverlapping,
  findDates,
  findNumbers,
  findPeople,
  findPlaces,
  numericValue,
  resultSentences,
} from "./extract.ts";

/** One search result carrying `description`, the shape Brave returns. */
const snippet = (description: string, url = "https://example.com/a") =>
  resultSentences([{ url, title: "t", description }]);

const sentences = resultSentences([
  {
    url: "https://www.amazon.com/x",
    title: "Syntax Podcast",
    description:
      "<strong>Syntax</strong> podcast is hosted by Full-Stack Developers Wes Bos and Scott Tolinski. The show started in 2017 as a weekly podcast.",
  },
  {
    url: "https://example.com/rainier",
    title: "Rainier",
    description:
      "At 14,406 ft (4,391 m) it is the highest mountain. It was founded on 23 September 1889.",
  },
]);

describe("extract", () => {
  it("splits snippets into cleaned sentences with sources", () => {
    expect(sentences[0]).toMatchObject({
      text: "Syntax podcast is hosted by Full-Stack Developers Wes Bos and Scott Tolinski.",
      source: "amazon.com",
    });
  });
  it("finds people, numbers and dates", () => {
    expect(findPeople(sentences)).toEqual(expect.arrayContaining(["Wes Bos", "Scott Tolinski"]));
    expect(findNumbers(sentences)).toEqual(expect.arrayContaining(["14,406 ft", "4,391 m"]));
    expect(findDates(sentences)).toEqual(expect.arrayContaining(["23 September 1889", "2017"]));
  });
  it("does not truncate names that carry diacritics", () => {
    const s = snippet("She moved from São Paulo to Reykjavík in 2011 and never returned home.");
    expect(findPlaces(s)).toEqual(expect.arrayContaining(["São Paulo", "Reykjavík"]));
    expect(findPlaces(s)).not.toContain("Reykjav");
  });

  it("finds a person whose name carries diacritics", () => {
    expect(
      findPeople(snippet("The café in Zürich was run by Renée Dubois for many years.")),
    ).toContain("Renée Dubois");
  });

  it("does not start a span at a capital inside a word", () => {
    const s = snippet("The iPhone 17 and the eBay listing were both updated by Apple recently.");
    expect(findPlaces(s).some((p) => p === "Phone" || p === "Bay")).toBe(false);
    expect(findPeople(s).some((p) => p.includes("Phone") || p.includes("Bay"))).toBe(false);
  });

  it("offers each part of a comma-joined place, since only one answers the question", () => {
    const places = findPlaces(
      snippet("Nintendo was founded by Fusajiro Yamauchi in Kyoto, Japan."),
    );
    expect(places).toEqual(expect.arrayContaining(["Kyoto", "Japan"]));
  });

  it("ranks real places ahead of junk, so the top-20 cut keeps them", () => {
    const pooled = resultSentences(
      [
        "Mount Rainier is a stratovolcano in Pierce County, Washington.",
        "He was born in Brandenburg, Germany, and later moved to Queensland.",
        "Listen on Apple Podcasts, Spotify and YouTube Music for new episodes.",
        "Full Stack Web Development Podcast Episodes | Show Notes | Listen Now",
        "The Privacy Policy and Terms of Service were updated by Rotten Tomatoes.",
      ].map((description, i) => ({ url: `https://s${i}.com`, title: "t", description })),
    );
    const places = findPlaces(pooled);
    for (const real of [
      "Mount Rainier",
      "Pierce County",
      "Washington",
      "Brandenburg",
      "Germany",
      "Queensland",
    ]) {
      expect(places).toContain(real);
    }
  });

  it("returns spans that are verbatim substrings of the source", () => {
    const text = "She moved from São Paulo to Reykjavík, Iceland in 2011 for a new job.";
    for (const span of findPlaces(snippet(text))) expect(text).toContain(span);
  });

  it("does not offer a place as a person", () => {
    const people = findPeople(
      snippet("Mount Rainier is a stratovolcano in Pierce County, Washington."),
    );
    expect(people).not.toContain("Mount Rainier");
    expect(people).not.toContain("Pierce County");
  });

  it("still finds every person after the place filter", () => {
    const cases: [string, string[]][] = [
      [
        "Syntax podcast is hosted by Full-Stack Developers Wes Bos and Scott Tolinski.",
        ["Wes Bos", "Scott Tolinski"],
      ],
      ["Nintendo was founded by Fusajiro Yamauchi in Kyoto, Japan.", ["Fusajiro Yamauchi"]],
      [
        "The film was directed by Bong Joon-ho and stars Song Kang-ho.",
        ["Bong Joon-ho", "Song Kang-ho"],
      ],
      ["The café in Zürich was run by Renée Dubois for many years.", ["Renée Dubois"]],
    ];
    for (const [text, expected] of cases) {
      expect(findPeople(snippet(text))).toEqual(expect.arrayContaining(expected));
    }
  });

  it("cuts names at a possessive", () => {
    const s = resultSentences([
      {
        url: "https://x.com",
        title: "x",
        description: "True stories with host Jack Rhysider's Darknet Diaries team every month.",
      },
    ]);
    const people = findPeople(s);
    expect(people).toContain("Jack Rhysider");
    expect(people.some((p) => p.includes("Darknet"))).toBe(false);
  });
  it("decodes every HTML entity, not just the common ones", () => {
    expect(cleanHtml("Ben &amp; Jerry&#x27;s &mdash; caf&eacute; &hellip; 50&nbsp;&deg;F")).toBe(
      "Ben & Jerry's — café … 50 °F",
    );
  });

  it("keeps text a page escaped on purpose, rather than stripping it as markup", () => {
    expect(cleanHtml("<p>Use &lt;b&gt; for bold</p>")).toBe("Use <b> for bold");
  });

  it("does not split a sentence on an abbreviation", () => {
    const texts = snippet(
      "At 14,406 ft it is the highest mountain in the U.S. It was founded on 23 Sept. 1889 by Dr. Smith.",
    ).map((s) => s.text);
    expect(texts).toEqual([
      "At 14,406 ft it is the highest mountain in the U.S. It was founded on 23 Sept. 1889 by Dr. Smith.",
    ]);
  });

  it("still splits genuinely separate sentences, and keeps each one's source", () => {
    const out = snippet(
      "Mount Rainier is an active stratovolcano in Washington. It rises above Seattle and is visible for miles.",
      "https://www.nps.gov/mora",
    );
    expect(out.map((s) => s.text)).toEqual([
      "Mount Rainier is an active stratovolcano in Washington.",
      "It rises above Seattle and is visible for miles.",
    ]);
    expect(out.every((s) => s.source === "nps.gov")).toBe(true);
    expect(out.map((s) => s.n)).toEqual([1, 2]);
  });

  it("reads a measurement as a number, never as a date", () => {
    const s = snippet("At 14,406 ft (4,391 m) it is the highest mountain in the range.");
    expect(findDates(s)).toEqual([]);
    expect(findNumbers(s)).toEqual(expect.arrayContaining(["14,406 ft"]));
  });

  it('finds a bare year, which is the whole answer to "what year?"', () => {
    expect(
      findDates(snippet("Twilight: New Moon came out in 2009 and made $700 million.")),
    ).toContain("2009");
  });

  it("finds dates in the several formats sources actually use", () => {
    const cases: [string, string][] = [
      ["It was founded on 23 September 1889 nearby.", "23 September 1889"],
      ["The phone was released April 21, 2026 worldwide.", "April 21, 2026"],
      ["Recorded 1889-09-23 in the official register.", "1889-09-23"],
      ["It shipped in September 2025 to acclaim.", "September 2025"],
    ];
    for (const [text, expected] of cases) expect(findDates(snippet(text))).toContain(expected);
  });

  it("drops the preposition chrono matched on", () => {
    expect(
      findDates(snippet("It was founded on 23 September 1889 nearby.")).some((d) =>
        d.startsWith("on "),
      ),
    ).toBe(false);
  });

  it("keeps a number and its unit together", () => {
    expect(
      findNumbers(snippet("The tower is 324 metres tall and weighs 10,100 tonnes in total.")),
    ).toEqual(expect.arrayContaining(["324 metres", "10,100 tonnes"]));
  });

  it("does not glue a preposition onto an amount", () => {
    expect(
      findNumbers(snippet("Construction of the tower cost $1.5 million in 1889 to complete.")),
    ).toContain("$1.5 million");
    expect(
      findNumbers(snippet("Construction of the tower cost $1.5 million in 1889 to complete.")).some(
        (n) => n.endsWith(" in"),
      ),
    ).toBe(false);
  });

  it("keeps the thing being counted after a magnitude word", () => {
    expect(findNumbers(snippet("The album went on to sell 2 million copies worldwide."))).toContain(
      "2 million copies",
    );
  });

  it("keeps two amounts in one sentence apart", () => {
    expect(findNumbers(snippet("It cost $4.5 million and 42% more than was planned."))).toEqual(
      expect.arrayContaining(["$4.5 million", "42%"]),
    );
  });

  it("keeps a percent sign with its number", () => {
    expect(findNumbers(snippet("Turnout rose to 67 % of voters, and later hit 71%."))).toEqual(
      expect.arrayContaining(["67%", "71%"]),
    );
  });

  describe("numericValue", () => {
    it("reads magnitude words at full value", () => {
      expect(numericValue("$4.5 million")).toBe(4_500_000);
      expect(numericValue("1.2 billion")).toBe(1_200_000_000);
      expect(numericValue("2 million copies")).toBe(2_000_000);
    });

    it("reads plain and formatted numbers", () => {
      expect(numericValue("14,406 ft")).toBe(14406);
      expect(numericValue("8,336,817 people")).toBe(8_336_817);
      expect(numericValue("42%")).toBe(42);
    });

    it("returns nothing when there is no number to read", () => {
      expect(numericValue("no digits here")).toBeUndefined();
      expect(numericValue("")).toBeUndefined();
    });
  });

  it("drops overlapping junk spans in favour of the clean name", () => {
    const kept = dedupeOverlapping([
      { value: "Wes Bos Scott", score: 0.96 },
      { value: "Wes Bos", score: 0.97 },
      { value: "Scott Tolinski", score: 0.97 },
    ]);
    expect(kept.map((k) => k.value).toSorted()).toEqual(["Scott Tolinski", "Wes Bos"]);
  });
});
