import { fetchJson } from "@jev-chat/mcp-kit";
import wtf from "wtf_wikipedia";
import { z } from "zod";

const UA = "jev-chat-demo/0.1 (Jev MCP demo; https://github.com/w3cj/jev-chat)";
const HOST = "https://en.wikipedia.org";

const searchResponse = z.object({
  query: z
    .object({
      pages: z
        .array(
          z.object({
            title: z.string(),
            index: z.number(),
            description: z.string().optional(),
            pageprops: z.object({ disambiguation: z.string().optional() }).optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

/** The English Wikipedia URL for an article title. */
export function articleUrl(title: string): string {
  return `${HOST}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export interface SearchHit {
  title: string;
  description: string;
  url: string;
  /** The disambiguation page that listed this article. */
  from?: string;
}

function isDisambiguation(page: { pageprops?: { disambiguation?: string } }): boolean {
  return page.pageprops?.disambiguation !== undefined;
}

/** A disambiguation page's meanings, or the page itself when it can't be read or lists none. */
async function expandDisambiguation(page: SearchHit): Promise<SearchHit[]> {
  try {
    const listed = (await getArticle(page.title)).meanings ?? [];
    for (const m of listed) m.from = page.title;
    return listed.length ? listed : [page];
  } catch {
    return [page];
  }
}

/**
 * Up to `limit` search hits for `query`, best first, with their short descriptions. Each
 * disambiguation hit is replaced in place by the articles it lists, less any already found, so
 * the result can be longer than `limit`.
 */
export async function searchArticles(query: string, limit = 5): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: "pageprops|description",
    ppprop: "disambiguation",
  });
  const data = await fetchJson(`${HOST}/w/api.php?${params}`, searchResponse, {
    service: "Wikipedia",
    headers: { "User-Agent": UA, "Api-User-Agent": UA },
  });
  const pages = (data.query?.pages ?? []).toSorted((a, b) => a.index - b.index);
  const groups = await Promise.all(
    pages.map(async (p) => {
      const hit: SearchHit = {
        title: p.title,
        description: p.description ?? "",
        url: articleUrl(p.title),
      };
      return isDisambiguation(p) ? expandDisambiguation(hit) : [hit];
    }),
  );
  const found = new Set(pages.filter((p) => !isDisambiguation(p)).map((p) => p.title));
  return groups.flat().filter((hit) => {
    if (!hit.from) return true;
    if (found.has(hit.title)) return false;
    found.add(hit.title);
    return true;
  });
}

export interface ArticleLine {
  n: number;
  section: string;
  text: string;
}

export interface Article {
  title: string;
  url: string;
  lines: ArticleLine[];
  truncated: boolean;
  /** Set for a disambiguation page: the articles it lists, and no lines. */
  meanings?: SearchHit[];
}

type Doc = ReturnType<typeof wtf>;
// wtf_wikipedia's type declarations return `object` for these.
type Sentence = { text(): string };
type ListLine = { text(): string; links(): { page(): string | undefined }[] };

export const INFOBOX = "Infobox";
const MAX_LINES = 120;
const MAX_CHARS = 14_000;
const MIN_SENTENCE_CHARS = 20;
const MAX_MEANINGS = 20;
const FILE_NAME = /\.(?:jpe?g|png|svg|gif|tiff?|webp)$/i;

/** "prominence_ft" → "Prominence ft" */
function fieldLabel(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * @yields Each infobox field as "Label: value", then each sentence of each section.
 */
function* articleTexts(doc: Doc) {
  for (const box of doc.infoboxes()) {
    for (const [key, value] of Object.entries(box.keyValue() as Record<string, string>)) {
      const text = value
        .split(/\n+/)
        .map((v) => v.trim())
        .filter(Boolean)
        .join(", ");
      if (text && !FILE_NAME.test(text)) {
        yield { section: INFOBOX, text: `${fieldLabel(key)}: ${text}` };
      }
    }
  }
  for (const section of doc.sections()) {
    for (const sentence of section.sentences() as Sentence[]) {
      const text = sentence.text().trim();
      if (text.length >= MIN_SENTENCE_CHARS) {
        yield { section: section.title() || "Introduction", text };
      }
    }
  }
}

/** The articles a disambiguation page lists, each with its line of the page as the description. */
function meanings(doc: Doc): SearchHit[] {
  const out = new Map<string, SearchHit>();
  for (const list of doc.lists()) {
    for (const line of list.lines() as ListLine[]) {
      const title = line
        .links()
        .find((l) => l.page())
        ?.page();
      if (title && !out.has(title)) {
        out.set(title, { title, description: line.text(), url: articleUrl(title) });
      }
    }
  }
  return [...out.values()].slice(0, MAX_MEANINGS);
}

/** A parsed page as numbered lines (infobox fields first, then sentences), capped in length. */
export function readArticle(doc: Doc): Article {
  const title = doc.title() ?? "";
  const url = articleUrl(title);
  if (doc.isDisambiguation()) {
    return { title, url, lines: [], truncated: false, meanings: meanings(doc) };
  }

  const lines: ArticleLine[] = [];
  let chars = 0;
  for (const { section, text } of articleTexts(doc)) {
    if (lines.length >= MAX_LINES || chars + text.length > MAX_CHARS) {
      return { title, url, lines, truncated: true };
    }
    lines.push({ n: lines.length + 1, section, text });
    chars += text.length;
  }
  return { title, url, lines, truncated: false };
}

/** The article, following redirects. Throws if there is no such article. */
export async function getArticle(title: string): Promise<Article> {
  const doc = await wtf.fetch(title, { lang: "en", "Api-User-Agent": UA });
  if (!doc) throw new Error(`No Wikipedia article called "${title}".`);
  return readArticle(doc);
}
