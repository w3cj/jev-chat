import { NOUL_YES } from "../../config.ts";
import { candidateQ, choiceQ, noulQ, type BuiltQuestion } from "../../jev/questions.ts";
import type { ShownItem } from "../../shared/types.ts";
import {
  argText,
  hostOf,
  jsonTexts,
  textOf,
  type MultiStepAdapter,
  type SingleStepAdapter,
} from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";
import {
  ANSWER_TYPES,
  type AnswerType,
  cleanHtml,
  dedupeOverlapping,
  findCandidates,
  numericValue,
  resultSentences,
  type ScoredAnswer,
  type SearchResult,
} from "./extract.ts";

export const webSearch: SingleStepAdapter = {
  id: "search.brave_web_search",
  server: "search",
  mcpName: "brave_web_search",
  label: "Web search",
  description:
    "List web pages to browse: things to do, places, recommendations, articles, reviews (not a direct question)",
  examples: ["Search for rainy day things to do in Denver"],
  questions: (p) => ({
    query: candidateQ(
      "For a web search: which phrase is the most complete search query for what the user wants to find? Prefer the longest phrase that still only contains the topic.",
      p.text,
      "No search topic in the message",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    args.pick("query", p.text);
    args.fixed("count", 5);
    return args.require("query", "What should I search for?");
  },
  present(result, args) {
    const items: ShownItem[] = jsonTexts(result)
      .filter((r) => r && r.url && r.title)
      .slice(0, 5)
      .map((r) => ({
        title: cleanHtml(String(r.title)),
        subtitle: r.description ? cleanHtml(String(r.description)) : undefined,
        url: r.url,
      }));
    if (!items.length) {
      return {
        text: `No results for "${argText(args.query)}".`,
        card: { type: "error", message: textOf(result) || "No results" },
      };
    }
    return {
      text: `Top ${items.length} results for "${argText(args.query)}":`,
      card: { type: "search_results", query: String(args.query), items },
      lastResult: { summary: `Search results for "${argText(args.query)}"`, items, numbers: [] },
    };
  },
};

function listPhrase(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Brave search, then one Jev request judges the candidate values found in the results and picks
 * the evidence sentence.
 */
export const webAnswer: MultiStepAdapter = {
  id: "search.answer",
  server: "search",
  mcpName: "brave_web_search",
  label: "Web answer",
  description:
    "Answer a direct question about current, recent or niche things using web search (who hosts/runs/stars in something, a price, a release date, a current fact)",
  examples: ["Who hosts the Syntax podcast?", "When is the next iPhone released?"],
  questions: (p) => ({
    query: candidateQ(
      "For answering a question from the web: which phrase is the best search query? Prefer a phrase with the topic plus the key word of what's asked (e.g. 'hosts the Syntax podcast').",
      p.text,
      "No topic in the message",
    ),
    answer_type: choiceQ(
      "For answering a question from the web: what kind of answer is the user asking for?",
      ANSWER_TYPES,
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    args.pick("query", p.text);
    args.fixed("count", 5);
    const type = args.choice("answer_type", "other") as AnswerType;
    args.fixed("__answerType", type);
    args.note("answer type", type, "option", args.key("answer_type"));
    return args.require("query", "What should I look up?");
  },
  async run(args, ctx) {
    const answerType = (args.__answerType as AnswerType) ?? "other";

    const search = await ctx.call(
      "brave_web_search",
      { query: args.query, count: 5 },
      "Search the web",
    );
    const results = jsonTexts(search).filter((r): r is SearchResult => !!r?.url && !!r?.title);
    const sentences = resultSentences(results);
    const sources = results.map((r) => ({
      title: cleanHtml(r.title),
      url: r.url,
      source: hostOf(r.url),
    }));
    if (search.isError || !sentences.length) {
      return {
        text: `I couldn't find anything for "${argText(args.query)}".`,
        card: { type: "error", message: textOf(search) || "No results" },
      };
    }

    const candidates = findCandidates(answerType, sentences);

    const questions: Record<string, BuiltQuestion> = {};
    const multi = answerType === "people";
    const candidateOptions = candidates.map((value, i) => ({
      key: `c${i + 1}`,
      value,
      label: value,
      source: "search results",
    }));
    if (candidates.length) {
      if (multi) {
        for (const c of candidateOptions) {
          questions[c.key] = {
            ...noulQ(
              `According to the sources, is "${c.value}" a correct answer to the question? Only count sources about the same thing the question asks about; ignore other things with the same name.`,
            ),
            labels: { subject: c.value },
          };
        }
      } else {
        questions.value = candidateQ(
          "According to the sources, which value answers the question? Only count sources about the same thing the question asks about.",
          candidateOptions,
          "None of these answers the question",
        );
      }
    }
    const sentenceOptions = sentences.map((s) => ({
      key: `s${s.n}`,
      value: s,
      label: `(${s.source}) ${s.text}`,
      source: s.source,
    }));
    questions.evidence = candidateQ(
      "Which source sentence most directly answers the question?",
      sentenceOptions,
      "No sentence answers the question",
    );

    const answers = await ctx.ask(
      candidates.length
        ? `Jev judges ${candidates.length} candidate ${multi ? "names" : "values"} + picks the evidence`
        : "Jev picks the evidence sentence",
      { question: ctx.message, sources: sentences.map((s) => `[${s.n}] (${s.source}) ${s.text}`) },
      questions,
    );

    let accepted: ScoredAnswer[] = [];
    if (multi) {
      accepted = dedupeOverlapping(
        candidateOptions
          .map((c) => ({ value: c.value, score: answers[c.key]?.noul ?? 0 }))
          .filter((c) => c.score > NOUL_YES),
      );
    } else if (answers.value?.choice && answers.value.choice !== "none") {
      const picked = candidateOptions.find((c) => c.key === answers.value.choice);
      if (picked) {
        accepted = [
          {
            value: picked.value,
            score: answers.value.probabilities?.[picked.key] ?? answers.value.confidence ?? 0,
          },
        ];
      }
    }

    const ev = sentenceOptions.find((o) => o.key === answers.evidence?.choice)?.value;
    const evidence = ev
      ? {
          text: ev.text,
          source: ev.source,
          url: ev.url,
          title: ev.title,
          confidence: answers.evidence?.confidence,
        }
      : undefined;

    const list = accepted.map((a) => a.value);
    const joined = listPhrase(list);
    let text: string;
    if (list.length) text = `Based on web results: ${joined}.`;
    else if (evidence) text = "Here's the most relevant line I found:";
    else text = `I searched for "${argText(args.query)}" but couldn't find a clear answer.`;

    const numbers =
      answerType === "number"
        ? accepted
            .map((a) => ({ value: numericValue(a.value), label: a.value }))
            .filter((n): n is { value: number; label: string } => n.value !== undefined)
        : [];

    return {
      text,
      card: {
        type: "answer",
        question: ctx.message,
        answerType,
        answers: accepted,
        evidence,
        sources,
      },
      lastResult: {
        summary: list.length
          ? `Answer to "${ctx.message}": ${joined}`
          : `Web results for "${argText(args.query)}"`,
        items: [
          ...accepted.map((a) => ({ title: a.value })),
          ...sources.map((s) => ({ title: s.title, url: s.url, subtitle: s.source })),
        ],
        numbers,
      },
    };
  },
};
