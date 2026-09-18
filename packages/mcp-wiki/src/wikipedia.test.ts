import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";
import wtf from "wtf_wikipedia";

import { getArticle, INFOBOX, readArticle, searchArticles } from "./wikipedia.ts";

/** A page recorded from English Wikipedia; long articles are cut after a few sections. */
const page = (file: string, title: string) =>
  wtf(readFileSync(new URL(`./fixtures/${file}.wiki`, import.meta.url), "utf8"), { title });
const recorded = (file: string, title: string) => readArticle(page(file, title));

const rainier = recorded("mount-rainier", "Mount Rainier");
const nintendo = recorded("nintendo", "Nintendo");
const texts = (article: typeof rainier) => article.lines.map((l) => l.text);

describe("readArticle", () => {
  it("puts infobox fields first, labelled, as their own lines", () => {
    expect(rainier.lines[0]).toEqual({ n: 1, section: INFOBOX, text: "Name: Mount Rainier" });
    expect(texts(rainier)).toContain("Elevation: 14,406 ft (2025, NAVD88)");
    expect(texts(rainier)).toContain("Prominence ft: 13,210");
    expect(texts(nintendo)).toEqual(
      expect.arrayContaining([
        "Founder: Fusajiro Yamauchi",
        "Founded: September 23, 1889 in Shimogyō-ku, Kyoto, Japan",
      ]),
    );
  });

  it("joins a field's list into one line and leaves out image files", () => {
    expect(texts(nintendo)).toContain("Industry: Video games, Electronics");
    expect(texts(nintendo).some((t) => /\.(?:jpg|svg)\b/i.test(t))).toBe(false);
  });

  it("follows the infobox with each section's sentences, lead first", () => {
    const firstSentence = rainier.lines.find((l) => l.section !== INFOBOX);
    expect(firstSentence).toMatchObject({ section: "Introduction" });
    expect(firstSentence?.text).toMatch(/^Mount Rainier, also known as Tahoma/);
    expect(rainier.lines.map((l) => l.n)).toEqual(rainier.lines.map((_, i) => i + 1));
  });

  it("reads nested sections and nothing from the reference sections", () => {
    expect([...new Set(rainier.lines.map((l) => l.section))]).toEqual([
      INFOBOX,
      "Introduction",
      "Name",
      "Geographical setting",
      "Subsidiary peaks",
      "Height of the mountain",
    ]);
  });

  it("skips sentence fragments too short to answer anything", () => {
    const sentences = rainier.lines.filter((l) => l.section !== INFOBOX);
    expect(sentences.every((l) => l.text.length >= 20)).toBe(true);
  });

  it("lists a disambiguation page's meanings instead of lines", () => {
    const mercury = recorded("mercury", "Mercury");
    expect(mercury.lines).toEqual([]);
    expect(mercury.meanings?.slice(0, 2)).toEqual([
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
    ]);
    expect(new Set(mercury.meanings?.map((m) => m.title)).size).toBe(mercury.meanings?.length);
    expect(rainier.meanings).toBeUndefined();
  });

  it("stops at the line cap and says it did", () => {
    const long = Array.from({ length: 200 }, (_, i) => `Sentence ${i} is long enough to keep.`);
    const article = readArticle(wtf(long.join(" "), { title: "Long" }));
    expect(article.lines).toHaveLength(120);
    expect(article.truncated).toBe(true);
    expect(rainier.truncated).toBe(false);
  });
});

const DISAMBIGUATION = { disambiguation: "" };

/** Stub Wikipedia's search API to return these pages. */
const searchReturns = (pages: object[]) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ query: { pages } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

describe("searchArticles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks Wikipedia for descriptions and disambiguation flags in the same search", async () => {
    const fetch = searchReturns([]);
    expect(await searchArticles("Mount Rainier")).toEqual([]);
    const [url, init] = fetch.mock.calls[0];
    const params = new URL(url as string).searchParams;
    expect(params.get("generator")).toBe("search");
    expect(params.get("gsrsearch")).toBe("Mount Rainier");
    expect(params.get("prop")).toBe("pageprops|description");
    expect(params.get("ppprop")).toBe("disambiguation");
    expect(init?.headers).toMatchObject({ "User-Agent": expect.stringContaining("jev-chat") });
  });

  it("returns hits best first, which Wikipedia doesn't keep in order", async () => {
    searchReturns([
      { title: "Mount Rainier National Park", index: 2, description: "National park" },
      { title: "Mount Rainier", index: 1, description: "Stratovolcano in Washington" },
      { title: "Cascade Range", index: 3 },
    ]);
    expect(await searchArticles("Mount Rainier")).toEqual([
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
      {
        title: "Cascade Range",
        description: "",
        url: "https://en.wikipedia.org/wiki/Cascade_Range",
      },
    ]);
  });

  it("replaces a disambiguation page, in place, with the articles it lists", async () => {
    searchReturns([
      { title: "Mercury", index: 1, pageprops: DISAMBIGUATION },
      { title: "Mercury (planet)", index: 2, description: "First planet from the Sun" },
      { title: "Mercury Records", index: 3, description: "American record label" },
    ]);
    const read = vi.spyOn(wtf, "fetch").mockResolvedValue(page("mercury", "Mercury"));
    const hits = await searchArticles("Mercury");

    expect(read).toHaveBeenCalledWith("Mercury", expect.anything());
    expect(hits[0]).toEqual({
      title: "Mercury (element)",
      description: "Mercury (element), a chemical element",
      url: "https://en.wikipedia.org/wiki/Mercury_(element)",
      from: "Mercury",
    });
    expect(hits.map((h) => h.title)).not.toContain("Mercury");
    expect(hits.slice(-2)).toEqual([
      expect.objectContaining({
        title: "Mercury (planet)",
        description: "First planet from the Sun",
      }),
      expect.objectContaining({ title: "Mercury Records", description: "American record label" }),
    ]);
    expect(hits.filter((h) => h.title === "Mercury (planet)")).toHaveLength(1);
  });

  it("lists a meaning once when two disambiguation pages share it", async () => {
    searchReturns([
      { title: "Mercury", index: 1, pageprops: DISAMBIGUATION },
      { title: "Mercury (disambiguation)", index: 2, pageprops: DISAMBIGUATION },
    ]);
    vi.spyOn(wtf, "fetch").mockResolvedValue(page("mercury", "Mercury"));
    const titles = (await searchArticles("Mercury")).map((h) => h.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("keeps a disambiguation page it can't read, rather than failing the search", async () => {
    searchReturns([
      {
        title: "Mercury",
        index: 1,
        description: "Topics referred to by the same term",
        pageprops: DISAMBIGUATION,
      },
    ]);
    vi.spyOn(wtf, "fetch").mockRejectedValue(new Error("network down"));
    expect(await searchArticles("Mercury")).toEqual([
      {
        title: "Mercury",
        description: "Topics referred to by the same term",
        url: "https://en.wikipedia.org/wiki/Mercury",
      },
    ]);
  });
});

describe("getArticle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches with the app's user agent and reads the page", async () => {
    const fetch = vi
      .spyOn(wtf, "fetch")
      .mockResolvedValue(
        wtf("'''Kyoto''' is a city in Japan with many temples.", { title: "Kyoto" }),
      );
    const article = await getArticle("Kyoto");
    expect(fetch).toHaveBeenCalledWith(
      "Kyoto",
      expect.objectContaining({
        lang: "en",
        "Api-User-Agent": expect.stringContaining("jev-chat"),
      }),
    );
    expect(article).toMatchObject({
      title: "Kyoto",
      url: "https://en.wikipedia.org/wiki/Kyoto",
      lines: [
        { n: 1, section: "Introduction", text: "Kyoto is a city in Japan with many temples." },
      ],
    });
  });

  it("throws when there is no such article", async () => {
    vi.spyOn(wtf, "fetch").mockResolvedValue(null);
    await expect(getArticle("Xyzzy")).rejects.toThrow('No Wikipedia article called "Xyzzy".');
  });
});
