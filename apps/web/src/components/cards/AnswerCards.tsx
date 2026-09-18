import { ExtLink } from "../ui/ExtLink.tsx";
import type { CardComponent } from "./types.ts";

/** An answer found in web sources: the values with scores, the evidence sentence, and the sources. */
export const AnswerCard: CardComponent<"answer"> = ({ card }) => (
  <div className="rounded-box border border-base-300 bg-base-200 p-3">
    {card.answers.length > 0 && (
      <div className="mb-2 flex flex-wrap gap-2">
        {card.answers.map((a) => (
          <span
            key={a.value}
            className="badge badge-primary badge-lg gap-2"
            title="Found in the sources by code, confirmed by Jev"
          >
            {a.value}
            <span className="text-xs opacity-70">{a.score.toFixed(2)}</span>
          </span>
        ))}
      </div>
    )}
    {card.evidence && (
      <blockquote className="border-l-4 border-primary pl-3 text-sm">
        “{card.evidence.text}”
        <div className="mt-1 text-xs text-base-content/60">
          <ExtLink href={card.evidence.url}>{card.evidence.source}</ExtLink>
          {card.evidence.confidence !== undefined && (
            <span> · Jev confidence {card.evidence.confidence.toFixed(2)}</span>
          )}
        </div>
      </blockquote>
    )}
    {card.sources.length > 0 && (
      <details className="mt-2 text-xs text-base-content/60">
        <summary className="cursor-pointer">{card.sources.length} sources searched</summary>
        <ul className="mt-1 space-y-0.5">
          {card.sources.map((s) => (
            <li key={s.url} className="truncate">
              <ExtLink href={s.url}>{s.title}</ExtLink>{" "}
              <span className="opacity-60">· {s.source}</span>
            </li>
          ))}
        </ul>
      </details>
    )}
  </div>
);

/** A line (sentence or infobox field) quoted word for word from Wikipedia, or a fallback when none matched. */
export const QuoteCard: CardComponent<"quote"> = ({ card }) => (
  <div className="rounded-box border border-base-300 bg-base-200 p-3">
    {card.quote ? (
      <blockquote className="border-l-4 border-primary pl-3 text-base">“{card.quote}”</blockquote>
    ) : (
      <p className="text-sm text-base-content/70">{card.fallback}</p>
    )}
    {card.also && (
      <blockquote className="mt-2 border-l-4 border-base-300 pl-3 text-sm text-base-content/70">
        <span className="text-xs uppercase tracking-wide text-base-content/50">Also relevant</span>
        <br />“{card.also}”
      </blockquote>
    )}
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-base-content/60">
      <ExtLink href={card.url} className="font-medium">
        Wikipedia · {card.article}
      </ExtLink>
      {card.section && <span>· {card.section}</span>}
      {card.lineNumber && <span>· line #{card.lineNumber}</span>}
      {card.confidence !== undefined && (
        <span className="badge badge-ghost badge-xs">
          Jev confidence {card.confidence.toFixed(2)}
        </span>
      )}
    </div>
  </div>
);
