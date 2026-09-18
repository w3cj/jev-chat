import type { JevTrace } from "@jev-chat/server/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FollowUp, Spelling } from "./Preprocess.tsx";

function jevAsked(key: string): JevTrace {
  return {
    request: { model: "jev", state: {}, questions: { [key]: { type: "choice", criteria: {} } } },
    ms: 42,
  };
}

describe("Spelling", () => {
  it("shows typed and used text, each word's pick, and Jev's questions", () => {
    const html = renderToStaticMarkup(
      <Spelling
        spelling={{
          original: "wether in denvr for teh trip",
          corrected: "weather in denver for the trip",
          words: [
            {
              word: "wether",
              suggestions: ["weather", "whether"],
              replacement: "weather",
              decidedBy: "jev",
            },
            {
              word: "denvr",
              suggestions: ["denver"],
              replacement: "denver",
              decidedBy: "only close match",
            },
            {
              word: "teh",
              suggestions: ["the"],
              replacement: "the",
              decidedBy: "common misspelling",
            },
            { word: "zorp", suggestions: [], decidedBy: "jev" },
          ],
          jev: jevAsked("word_1"),
        }}
      />,
    );

    expect(html).toContain("Jev · 42 ms");
    expect(html).toContain("Typed: </span>wether in denvr for teh trip");
    expect(html).toContain('<span class="font-semibold">weather in denver for the trip</span>');
    expect(html).toContain("wether → weather</span>");
    expect(html).toContain("denvr → denver<span");
    expect(html).toContain("(only close match)");
    expect(html).toContain("(common misspelling)");
    expect(html).toContain("zorp → kept</span>");
    expect(html).toContain('font-mono text-xs">word_1</span>');
  });

  it("omits the Jev badge and questions when Jev wasn't asked", () => {
    const html = renderToStaticMarkup(
      <Spelling spelling={{ original: "hi", corrected: "hi", words: [] }} />,
    );

    expect(html).not.toContain("Jev ·");
    expect(html).toContain('<span class="">hi</span>');
  });
});

describe("FollowUp", () => {
  it("explains a slot swap and shows the rewrite", () => {
    const html = renderToStaticMarkup(
      <FollowUp
        followUp={{
          original: "and in Boston?",
          previous: "weather in Denver",
          resolved: "weather in Boston",
          slot: "place",
        }}
      />,
    );

    expect(html).toContain(
      "naming a new place: code put it in place of the previous question&#x27;s place",
    );
    expect(html).toContain("Previous: </span>weather in Denver");
    expect(html).toContain('<span class="font-semibold">weather in Boston</span>');
    expect(html).not.toContain("as-is");
  });

  it("marks a message kept as-is", () => {
    const html = renderToStaticMarkup(
      <FollowUp
        followUp={{
          original: "thanks",
          previous: "hi",
          resolved: "thanks",
          jev: jevAsked("rewrite"),
        }}
      />,
    );

    expect(html).toContain("Jev picked the rewrite that matches");
    expect(html).toContain("as-is");
    expect(html).toContain('font-mono text-xs">rewrite</span>');
  });
});
