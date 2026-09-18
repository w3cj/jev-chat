#!/usr/bin/env node
import { defineTool, serve, structured } from "@jev-chat/mcp-kit";
import { z } from "zod";

import { getArticle, searchArticles } from "./wikipedia.ts";

await serve("wikipedia", "0.1.0", (server) => {
  defineTool(
    server,
    "search_articles",
    {
      title: "Search Wikipedia",
      description:
        "Find Wikipedia articles matching a topic. Returns the top 5 search hits with short descriptions, best first; a disambiguation page among them is replaced by the articles it lists (up to 20, each with `from` naming the page), so the list can run longer.",
      inputSchema: { query: z.string().describe("Topic to look up, e.g. 'Mount Rainier'") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query }) => {
      const results = await searchArticles(query);
      const summary = results.map((r, i) => `${i + 1}. ${r.title} — ${r.description}`).join("\n");
      return structured(summary || "No articles found.", { query, results });
    },
  );

  defineTool(
    server,
    "get_article",
    {
      title: "Read a Wikipedia article",
      description:
        "Get an article as numbered lines (infobox fields, then sentences, lead section first), for quoting the line that answers a question. For a disambiguation page, lists the articles it points to in `meanings` instead.",
      inputSchema: { title: z.string().describe("Exact article title from search_articles") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ title }) => {
      const article = await getArticle(title);
      const summary = article.meanings
        ? `${article.title} is a disambiguation page (${article.meanings.length} meanings)`
        : `${article.title} (${article.lines.length} lines)`;
      return structured(summary, article);
    },
  );
});
