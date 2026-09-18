import { describe, expect, it } from "vitest";

import type { ShownResult } from "../shared/types.ts";
import { buildPools, messageNumbers, messageSpans } from "./pools.ts";

describe("messageSpans", () => {
  it("keeps the city and the search topic as candidates", () => {
    expect(messageSpans("What's the weather in Seattle tomorrow?")).toEqual(
      expect.arrayContaining(["Seattle", "tomorrow"]),
    );
    expect(messageSpans("Search for rainy day things to do in Seattle")).toContain(
      "rainy day things to do in Seattle",
    );
  });

  it("trims stop words from both edges so spans are usable as arguments", () => {
    const spans = messageSpans("Turn on the kitchen lights");
    expect(spans).toContain("kitchen lights");
    expect(spans.every((s) => !s.startsWith("the ") && !s.endsWith(" the"))).toBe(true);
  });

  it("does not repeat a span", () => {
    const spans = messageSpans("book a book about a book");
    expect(new Set(spans.map((s) => s.toLowerCase())).size).toBe(spans.length);
  });

  it("keeps whole time phrases even when they start or end with a stop word", () => {
    expect(messageSpans("What's the weather in 2 hours?")).toContain("in 2 hours");
    expect(messageSpans("Weather at noon tomorrow")).toContain("noon tomorrow");
  });
});

describe("messageNumbers", () => {
  it("finds numbers including money", () => {
    expect(messageNumbers("What's a 20% tip on $64?")).toEqual([20, 64]);
  });

  it("handles thousands separators, decimals and negatives", () => {
    expect(messageNumbers("from -3.5 to 1,200 degrees")).toEqual([-3.5, 1200]);
  });

  it("reads numbers written as words, in message order", () => {
    expect(messageNumbers("add six and 5")).toEqual([6, 5]);
    expect(messageNumbers("add 5 to twenty six")).toEqual([5, 26]);
    expect(messageNumbers("what is a hundred and twelve times three")).toEqual([112, 3]);
  });

  it("skips ordinals and 'one' standing for a thing", () => {
    expect(messageNumbers("convert that one to celsius")).toEqual([]);
    expect(messageNumbers("the first one")).toEqual([]);
    expect(messageNumbers("one cup of flour in grams")).toEqual([1]);
  });

  it("returns nothing when there are no numbers", () => {
    expect(messageNumbers("turn the lights off")).toEqual([]);
  });
});

const result = (over: Partial<ShownResult>): ShownResult => ({
  toolId: "search.brave_web_search",
  label: "Web search",
  args: {},
  summary: "",
  items: [],
  numbers: [],
  ...over,
});

describe("buildPools", () => {
  it("offers message phrases, then earlier results, as text candidates", () => {
    const state = { recent: [], results: [result({ items: [{ title: "Rainier Beach" }] })] };
    const pools = buildPools("what about the first one", state);
    const earlier = pools.text.find((c) => c.value === "Rainier Beach");
    expect(earlier?.source).toBe("earlier result");
  });

  it("carries numbers from the last result so follow-ups can reuse them", () => {
    const state = {
      recent: [],
      results: [result({ numbers: [{ value: 72, label: "high today, °F", unit: "fahrenheit" }] })],
    };
    const pools = buildPools("what's that in celsius", state);
    const n = pools.numbers.find((c) => c.value === 72);
    expect(n?.source).toBe("earlier result");
    expect(n?.shown?.unit).toBe("fahrenheit");
  });

  it("keeps numbers and arguments of older results, but items of the newest only", () => {
    const state = {
      recent: [],
      results: [
        result({
          toolId: "units.convert_units",
          numbers: [{ value: 28.89, label: "high today, converted to celsius" }],
          items: [{ title: "Newest item" }],
        }),
        result({
          toolId: "weather.get_weather",
          args: { place: "Denver" },
          numbers: [
            { value: 78, label: "current temperature in Denver, °F" },
            { value: 84, label: "high today, °F" },
          ],
          items: [{ title: "Older item" }],
        }),
      ],
    };
    const pools = buildPools("whats the current in celsius", state);
    expect(pools.numbers.map((n) => n.value)).toEqual([28.89, 78, 84]);
    expect(pools.text.map((c) => c.value)).toContain("Denver");
    expect(pools.items.map((i) => i.value.title)).toEqual(["Newest item"]);
  });

  it("offers a number repeated across results once", () => {
    const n = { value: 72, label: "high today, °F" };
    const state = { recent: [], results: [result({ numbers: [n] }), result({ numbers: [n] })] };
    expect(buildPools("in celsius", state).numbers).toHaveLength(1);
  });

  it("passes a tool's own targets through untouched", () => {
    const targets = [
      {
        key: "e0",
        value: { kind: "name" as const, value: "Desk Lamp" },
        label: "Device: Desk Lamp",
        source: "Home Assistant",
      },
    ];
    expect(buildPools("turn on the desk lamp", { recent: [] }, targets).homeTargets).toEqual(
      targets,
    );
  });

  it("falls back to message phrases when a tool supplies no targets", () => {
    const pools = buildPools("turn on the desk lamp", { recent: [] });
    expect(pools.homeTargets.every((t) => t.source === "message")).toBe(true);
    expect(pools.homeTargets.map((t) => t.value.value)).toContain("desk lamp");
  });
});
