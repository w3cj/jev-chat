import { describe, expect, it } from "vitest";

import { applyCorrections, checkSpelling } from "./spelling.ts";

const check = (message: string, fromTools: string[] = []) =>
  checkSpelling(message, { recent: [] }, fromTools);

describe("checkSpelling", () => {
  it("flags an unknown word with suggestions in the dictionary's own case", async () => {
    const { fixed, flagged } = await check("What is the weather in seatle");
    expect(fixed).toEqual([]);
    expect(flagged).toEqual([{ word: "seatle", suggestions: expect.arrayContaining(["Seattle"]) }]);
    expect(flagged[0].suggestions).not.toContain("seattle");
  });

  it("fixes a listed common misspelling without asking", async () => {
    expect(await check("remind me tomorow to recieve the parcel")).toEqual({
      fixed: [
        { word: "tomorow", replacement: "tomorrow", reason: "common misspelling" },
        { word: "recieve", replacement: "receive", reason: "common misspelling" },
      ],
      flagged: [],
    });
  });

  it("offers only the listed fixes when a common misspelling has several", async () => {
    expect((await check("what's the wether like")).flagged).toEqual([
      { word: "wether", suggestions: ["weather", "whether"] },
    ]);
  });

  it("fixes a lowercase word whose only suggestion is one edit away", async () => {
    expect((await check("set the thermostt to 70")).fixed).toEqual([
      { word: "thermostt", replacement: "thermostat", reason: "only close match" },
    ]);
  });

  it("asks when several suggestions are one edit away", async () => {
    const { fixed, flagged } = await check("weather in denvr");
    expect(fixed).toEqual([]);
    expect(flagged[0].suggestions).toEqual(expect.arrayContaining(["denar", "Denver"]));
  });

  it("asks whether a real word after a tens word was meant as a number", async () => {
    expect(await check("add 5 to twenty sig")).toEqual({
      fixed: [],
      flagged: [{ word: "sig", suggestions: ["six"] }],
    });
    expect(await check("add 5 to twenty six")).toEqual({ fixed: [], flagged: [] });
  });

  it("also asks after a misspelled tens word", async () => {
    const { flagged } = await check("ad 5 to tweny sig");
    expect(flagged).toEqual([
      { word: "tweny", suggestions: expect.arrayContaining(["twenty"]) },
      { word: "sig", suggestions: ["six"] },
    ]);
  });

  it("asks rather than fixing a capitalised word, which may be a name", async () => {
    const { fixed, flagged } = await check("Thermostt is off");
    expect(fixed).toEqual([]);
    expect(flagged.map((f) => f.word)).toEqual(["Thermostt"]);
  });

  it("skips names mid-sentence, acronyms, links and emails", async () => {
    expect(await check("is Tolinski by the Govee lamp")).toEqual({ fixed: [], flagged: [] });
    expect(await check("check https://exmple.com and NASA's site, or mail bob@exmple.com")).toEqual(
      { fixed: [], flagged: [] },
    );
  });

  it("treats names from tools and earlier results as known", async () => {
    const state = {
      recent: [],
      results: [
        {
          toolId: "search.answer",
          label: "Web answer",
          args: {},
          summary: "",
          items: [{ title: "Scott Tolinski" }],
          numbers: [],
        },
      ],
    };
    const message = "is tolinski by the govee lamp";
    expect(await checkSpelling(message, state, ["Govee Loft Lamp"])).toEqual({
      fixed: [],
      flagged: [],
    });
    expect((await check(message)).flagged.map((f) => f.word)).toEqual(["govee"]);
  });

  it("knows place names the dictionary doesn't", async () => {
    expect(await check("weather in nuuk")).toEqual({ fixed: [], flagged: [] });
  });

  it("still flags a typo that already appeared in the conversation", async () => {
    const state = {
      recent: [
        {
          user: "What is the weather in seatle",
          assistant: 'Couldn\'t find a place called "seatle".',
        },
      ],
    };
    expect(
      (await checkSpelling("What is the weather in seatle", state)).flagged.map((f) => f.word),
    ).toEqual(["seatle"]);
  });

  it("checks a word once, and a possessive as its base word", async () => {
    const { flagged } = await check("seatle and seatle's weather");
    expect(flagged.map((f) => f.word)).toEqual(["seatle"]);
  });
});

describe("applyCorrections", () => {
  it("replaces only picked words and keeps capitals", () => {
    expect(
      applyCorrections("Wether in seatle tomorow", [
        { word: "Wether", replacement: "weather" },
        { word: "seatle", replacement: "Seattle" },
        { word: "tomorow", replacement: undefined },
      ]),
    ).toBe("Weather in Seattle tomorow");
  });

  it("replaces whole words only, including before a possessive", () => {
    expect(
      applyCorrections("seatle's seatles unseatle", [{ word: "seatle", replacement: "Seattle" }]),
    ).toBe("Seattle's seatles unseatle");
  });
});
