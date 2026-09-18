import { beforeEach, describe, expect, it, vi } from "vitest";

import { askJev, type JevResult } from "../../jev/client.ts";
import { correctSpelling, resolveFollowUp } from "./preprocess.ts";

vi.mock("../../jev/client.ts", () => ({ askJev: vi.fn<typeof askJev>() }));

const ask = vi.mocked(askJev);
const trace = { request: { model: "jev", state: {}, questions: {} }, ms: 1 };
const answering = (answers: Record<string, string>): JevResult => ({
  ok: true,
  trace,
  optionLabels: {},
  answers: Object.fromEntries(
    Object.entries(answers).map(([k, choice]) => [k, { type: "choice", choice }]),
  ),
});

const after = (user: string) => ({ recent: [{ user, assistant: "…" }] });

beforeEach(() => ask.mockReset());

describe("correctSpelling", () => {
  it("returns undefined without asking Jev when every word is known", async () => {
    expect(await correctSpelling("What's the weather in Seattle?", { recent: [] })).toBe(undefined);
    expect(ask).not.toHaveBeenCalled();
  });

  it("applies sure fixes without asking Jev", async () => {
    const out = await correctSpelling("set the thermostt tomorow", { recent: [] });
    expect(ask).not.toHaveBeenCalled();
    expect(out).toEqual({
      original: "set the thermostt tomorow",
      corrected: "set the thermostat tomorrow",
      words: [
        {
          word: "thermostt",
          suggestions: ["thermostat"],
          replacement: "thermostat",
          decidedBy: "only close match",
        },
        {
          word: "tomorow",
          suggestions: ["tomorrow"],
          replacement: "tomorrow",
          decidedBy: "common misspelling",
        },
      ],
    });
  });

  it("asks Jev about the rest, showing it the message with sure fixes applied", async () => {
    ask.mockResolvedValue(answering({ word_1: "s2" }));
    const out = await correctSpelling("weather in seatle tomorow", { recent: [] });

    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0][0]).toMatchObject({ latest_message: "weather in seatle tomorrow" });
    expect(Object.keys(ask.mock.calls[0][1])).toEqual(["word_1"]);
    expect(out?.corrected).toBe("weather in Seattle tomorrow");
    expect(out?.words.map((w) => [w.word, w.replacement, w.decidedBy])).toEqual([
      ["tomorow", "tomorrow", "common misspelling"],
      ["seatle", "Seattle", "jev"],
    ]);
    expect(out?.jev).toBe(trace);
  });

  it("keeps a word Jev says to keep", async () => {
    ask.mockResolvedValue(answering({ word_1: "keep" }));
    const out = await correctSpelling("weather in seatle", { recent: [] });
    expect(out?.corrected).toBe("weather in seatle");
    expect(out?.words[0]).toMatchObject({ word: "seatle", replacement: undefined });
  });

  it("throws when the Jev request fails", async () => {
    ask.mockResolvedValue({ ok: false, error: "boom", trace, optionLabels: {} });
    await expect(correctSpelling("weather in seatle", { recent: [] })).rejects.toThrow("boom");
  });
});

describe("resolveFollowUp", () => {
  it("swaps a same-kind span without asking Jev", async () => {
    expect(
      await resolveFollowUp("what about tomorrow?", after("What's on my list for today?")),
    ).toEqual({
      original: "what about tomorrow?",
      previous: "What's on my list for today?",
      resolved: "What's on my list for tomorrow?",
      slot: "date",
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks Jev to pick a rewrite otherwise", async () => {
    ask.mockResolvedValue(answering({ rewrite: "r1" }));
    const out = await resolveFollowUp(
      "What about the second?",
      after("What year did the first twilight movie come out?"),
    );
    expect(ask).toHaveBeenCalledOnce();
    expect(out?.slot).toBeUndefined();
    expect(out?.jev).toBe(trace);
  });

  it("ignores a message that isn't a follow-up", async () => {
    expect(
      await resolveFollowUp("Turn on the kitchen lights", after("What's the weather?")),
    ).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
  });
});
