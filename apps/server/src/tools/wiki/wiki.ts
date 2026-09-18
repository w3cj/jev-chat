import { z } from "zod";

import { ANSWER_RUNNER_UP_MARGIN } from "../../config.ts";
import { candidateQ, runnerUp } from "../../jev/questions.ts";
import type { ShownItem } from "../../shared/types.ts";
import { argText, readResult, textOf, type MultiStepAdapter } from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";

const NUMBER_IN_TEXT = /\d[\d,]*(?:\.\d+)?/g;
/** The section name get_article gives infobox fields. */
const INFOBOX = "Infobox";

const searchResults = z.object({
  results: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().default(""),
        url: z.string(),
        from: z.string().optional(),
      }),
    )
    .default([]),
});
const articleResult = z.object({
  title: z.string(),
  url: z.string(),
  lines: z.array(z.object({ n: z.number(), section: z.string(), text: z.string() })).default([]),
  meanings: z
    .array(z.object({ title: z.string(), description: z.string(), url: z.string() }))
    .optional(),
});

/**
 * Search Wikipedia, Jev picks the article (a search result, or a meaning from a disambiguation
 * page in the results), read it, Jev picks the answering infobox field or sentence. An article
 * that turns out to be a disambiguation page is listed for the user to choose from.
 */
export const wikiFact: MultiStepAdapter = {
  id: "wiki.answer",
  server: "wiki",
  mcpName: "search_articles",
  label: "Wikipedia",
  description:
    "Answer an encyclopedic question about a well-known place, landmark, company, historical person or event from Wikipedia (how tall, how deep, who founded, when was it built)",
  examples: ["How tall is Mount Rainier?", "Who founded Nintendo?"],
  questions: (p) => ({
    topic: candidateQ(
      "For a factual question: which phrase names the thing, place or person the question is about (the Wikipedia article to look up)?",
      p.text,
      "No topic is named",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    const topic = args.candidate("topic", p.text);
    if (!topic) return args.missing("topic", "What should I look up?");
    args.set("query", topic.value, topic.source, args.key("topic"));
    return args.ok();
  },
  async run(args, ctx) {
    const search = await ctx.call("search_articles", { query: args.query }, "Search Wikipedia");
    const results = readResult(search, searchResults, "search_articles")?.results ?? [];
    if (search.isError || !results.length) {
      return {
        text: `I couldn't find a Wikipedia article about "${argText(args.query)}".`,
        card: { type: "error", message: textOf(search) || "No articles found" },
      };
    }

    const articleOptions = results.map((r, i) => ({
      key: `r${i + 1}`,
      value: r,
      label: `${r.title} — ${r.description || "no description"}`,
      source: r.from ? `"${r.from}" disambiguation page` : "search result",
    }));
    const pickArticle = await ctx.ask(
      "Jev picks the article",
      { question: ctx.message, searched_for: String(args.query) },
      {
        article: candidateQ(
          "Which Wikipedia article is most likely to answer the question?",
          articleOptions,
          "None of these articles fits",
        ),
      },
    );
    const chosen = articleOptions.find((o) => o.key === pickArticle.article?.choice)?.value;
    if (!chosen) {
      return {
        text: `None of the Wikipedia results for "${argText(args.query)}" looked right.`,
        card: {
          type: "search_results",
          query: String(args.query),
          items: results.map((r) => ({ title: r.title, subtitle: r.description, url: r.url })),
        },
      };
    }

    const read = await ctx.call("get_article", { title: chosen.title }, "Read the article");
    const article = readResult(read, articleResult, "get_article");
    if (!read.isError && article?.meanings) {
      const items = article.meanings.map((m) => ({
        title: m.title,
        subtitle: m.description,
        url: m.url,
      }));
      return {
        text: `"${article.title}" can mean several things. Which one did you mean?`,
        card: { type: "search_results", query: article.title, items },
        lastResult: { summary: `Meanings of "${article.title}"`, items, numbers: [] },
      };
    }
    if (read.isError || !article?.lines.length) {
      return {
        text: `Couldn't read "${chosen.title}".`,
        card: { type: "error", message: textOf(read) },
      };
    }

    const lineOptions = article.lines.map((l) => ({
      key: `l${l.n}`,
      value: l,
      label: l.text,
      source: "article",
    }));
    const pickLine = await ctx.ask(
      "Jev picks the answering line",
      { question: ctx.message, article: article.title },
      {
        line: candidateQ(
          "Which line from the article (an infobox field or a sentence) directly answers the question? Pick the one containing the specific fact asked for.",
          lineOptions,
          "No line answers the question",
        ),
      },
    );
    const answer = pickLine.line;
    const line = lineOptions.find((o) => o.key === answer?.choice)?.value;
    const items: ShownItem[] = [
      { title: article.title, subtitle: chosen.description, url: article.url },
    ];

    if (!line) {
      return {
        text: `I read "${article.title}" but no single sentence answers that. Here's how it starts:`,
        card: {
          type: "quote",
          question: ctx.message,
          article: article.title,
          url: article.url,
          fallback: (article.lines.find((l) => l.section !== INFOBOX) ?? article.lines[0]).text,
        },
        lastResult: { summary: `Wikipedia: ${article.title}`, items, numbers: [] },
      };
    }

    const secondKey = runnerUp(answer, ANSWER_RUNNER_UP_MARGIN);
    const also = lineOptions.find((o) => o.key === secondKey)?.value;

    const numbers = (line.text.match(NUMBER_IN_TEXT) ?? [])
      .map((n) => Number(n.replace(/,/g, "")))
      .filter((n) => Number.isFinite(n))
      .map((value) => ({ value, label: `from the quoted sentence about ${article.title}` }));

    return {
      text: `From Wikipedia's "${article.title}" article:`,
      card: {
        type: "quote",
        question: ctx.message,
        article: article.title,
        url: article.url,
        section: line.section,
        quote: line.text,
        lineNumber: line.n,
        confidence: answer?.confidence,
        also: also?.text,
      },
      lastResult: { summary: `Wikipedia "${article.title}": ${line.text}`, items, numbers },
    };
  },
};
