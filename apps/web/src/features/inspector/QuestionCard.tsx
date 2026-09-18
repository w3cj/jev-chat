import type { JevAnswerJson, JevQuestionJson, JevTrace } from "@jev-chat/server/types";
import { useState } from "react";

const TOP_OPTIONS = 4;
const UNANSWERED_OPTIONS = 6;

function optionLabel(q: JevQuestionJson, opt: string, labels?: Record<string, string>): string {
  if (labels?.[opt]) return labels[opt];
  const c = (q.criteria as Record<string, unknown> | undefined)?.[opt];
  return typeof c === "string" ? c : opt;
}

/**
 * One question, its answer, and the probability it gave every other option. Questions the code
 * never read are dimmed and start collapsed.
 */
export function QuestionCard(props: {
  name: string;
  q: JevQuestionJson;
  a?: JevAnswerJson;
  used: boolean;
  labels?: Record<string, string>;
}) {
  const { name, q, a, used, labels } = props;
  const [showAll, setShowAll] = useState(false);

  const probs = Object.entries(a?.probabilities ?? {}).toSorted((x, y) => y[1] - x[1]);
  const visible = showAll ? probs : probs.slice(0, TOP_OPTIONS);
  const options = q.criteria && typeof q.criteria === "object" ? Object.keys(q.criteria) : [];
  const noul = a?.noul ?? 0;

  return (
    <div
      className={`collapse-arrow collapse border border-base-300 bg-base-100 ${used ? "" : "opacity-50"}`}
    >
      <input type="checkbox" defaultChecked={used} />
      <div className="collapse-title min-h-0 px-3 py-2 pr-8">
        <div className="flex items-center gap-2">
          <span
            className={`badge badge-xs ${q.type === "choice" ? "badge-info" : "badge-secondary"}`}
          >
            {q.type}
          </span>
          <span className="truncate font-mono text-xs">{name}</span>
          {labels?.subject && (
            <span className="truncate text-sm font-semibold">{labels.subject}</span>
          )}
          {used ? (
            <span className="badge badge-success badge-xs">used</span>
          ) : (
            <span className="badge badge-ghost badge-xs">speculative</span>
          )}
        </div>
        <div className="mt-1 truncate text-sm">
          {a?.type === "choice" && a.choice !== undefined && (
            <>
              → <b>{optionLabel(q, a.choice, labels)}</b>{" "}
              <span className="text-base-content/50">
                {((a.probabilities?.[a.choice] ?? 0) * 100).toFixed(0)}%
              </span>
            </>
          )}
          {a?.type === "noul" && (
            <>
              → <b>{noul > 0.5 ? "yes" : "no"}</b>{" "}
              <span className="text-base-content/50">p(yes) = {noul.toFixed(3)}</span>
            </>
          )}
          {!a && <span className="text-base-content/50">no answer</span>}
        </div>
      </div>
      <div className="collapse-content px-3 text-sm">
        <p className="mb-2 text-base-content/70">
          {typeof q.instructions === "string" ? q.instructions : ""}
        </p>
        {q.type === "choice" && (
          <>
            <ul className="space-y-1">
              {visible.map(([opt, p]) => (
                <li key={opt} className={opt === a?.choice ? "font-semibold" : ""}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="truncate">
                      <span className="font-mono text-base-content/40">{opt}</span>{" "}
                      {optionLabel(q, opt, labels)}
                    </span>
                    <span className="font-mono">{(p * 100).toFixed(1)}%</span>
                  </div>
                  <progress
                    className={`progress h-1.5 ${opt === a?.choice ? "progress-primary" : ""}`}
                    value={p}
                    max={1}
                  />
                </li>
              ))}
            </ul>
            {probs.length > TOP_OPTIONS && (
              <button className="btn btn-link btn-xs px-0" onClick={() => setShowAll(!showAll)}>
                {showAll ? `Show top ${TOP_OPTIONS}` : `Show all ${options.length} options`}
              </button>
            )}
            {a?.confidence !== undefined && (
              <div className="mt-1 text-xs text-base-content/50">
                confidence {a.confidence.toFixed(3)}
              </div>
            )}
            {!a && (
              <ul className="text-xs text-base-content/60">
                {(showAll ? options : options.slice(0, UNANSWERED_OPTIONS)).map((opt) => (
                  <li key={opt}>
                    <span className="font-mono">{opt}</span> {optionLabel(q, opt, labels)}
                  </li>
                ))}
                {options.length > UNANSWERED_OPTIONS && (
                  <button className="btn btn-link btn-xs px-0" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Show fewer" : `Show all ${options.length} options`}
                  </button>
                )}
              </ul>
            )}
          </>
        )}
        {q.type === "noul" && a?.noul !== undefined && (
          <progress className="progress progress-secondary h-1.5" value={a.noul} max={1} />
        )}
      </div>
    </div>
  );
}

/** Every question from one Jev request, with its answer when Jev replied. */
export function QuestionList({
  jev,
  used,
  optionLabels,
}: {
  jev: JevTrace;
  used?: (key: string) => boolean;
  optionLabels?: Record<string, Record<string, string>>;
}) {
  return (
    <>
      {Object.entries(jev.request.questions).map(([key, q]) => (
        <QuestionCard
          key={key}
          name={key}
          q={q}
          a={jev.response?.answers[key]}
          used={used?.(key) ?? true}
          labels={optionLabels?.[key]}
        />
      ))}
    </>
  );
}
