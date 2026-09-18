import type { JevAnswerJson, JevQuestionJson } from "@jev-chat/server/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuestionCard } from "./QuestionCard.tsx";

function criteria(count: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`o${i}`, `Option ${i}`]));
}

function render(q: JevQuestionJson, a?: JevAnswerJson, labels?: Record<string, string>): string {
  return renderToStaticMarkup(<QuestionCard name="city" q={q} a={a} used={true} labels={labels} />);
}

describe("QuestionCard", () => {
  it("labels the chosen option from the labels, then the criteria, then the key", () => {
    const q: JevQuestionJson = { type: "choice", criteria: { s1: "Seattle", s2: "Denver" } };
    const probabilities = { s1: 0.8, s2: 0.2 };

    expect(render(q, { type: "choice", choice: "s1", probabilities })).toContain("<b>Seattle</b>");
    expect(
      render(q, { type: "choice", choice: "s1", probabilities }, { s1: "Seattle, WA" }),
    ).toContain("<b>Seattle, WA</b>");
    expect(render({ type: "choice" }, { type: "choice", choice: "s9", probabilities })).toContain(
      "<b>s9</b>",
    );
  });

  it("shows the top options with a button to show every option", () => {
    const q: JevQuestionJson = { type: "choice", criteria: criteria(5) };
    const probabilities = { o0: 0.5, o1: 0.2, o2: 0.15, o3: 0.1, o4: 0.05 };
    const html = render(q, { type: "choice", choice: "o0", probabilities });

    expect(html).toContain("Option 3");
    expect(html).not.toContain("Option 4");
    expect(html).toContain("Show all 5 options");
  });

  it("lists the first six options of an unanswered choice question", () => {
    const html = render({ type: "choice", criteria: criteria(7) });

    expect(html).toContain("no answer");
    expect(html).toContain("Option 5");
    expect(html).not.toContain("Option 6");
    expect(html).toContain("Show all 7 options");
  });

  it("omits the show-all button when every unanswered option fits", () => {
    const html = render({ type: "choice", criteria: criteria(6) });

    expect(html).toContain("Option 5");
    expect(html).not.toContain("Show all");
  });

  it("reads a noul answer as yes above one half", () => {
    expect(render({ type: "noul" }, { type: "noul", noul: 0.7 })).toContain("<b>yes</b>");
    expect(render({ type: "noul" }, { type: "noul", noul: 0.2 })).toContain("<b>no</b>");
  });
});
