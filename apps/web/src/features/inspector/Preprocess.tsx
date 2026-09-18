import type { FollowUpTrace, JevTrace, SpellingTrace } from "@jev-chat/server/types";
import type { ReactNode } from "react";

import { QuestionList } from "./QuestionCard.tsx";

function Heading({ title, jev }: { title: string; jev?: JevTrace }) {
  return (
    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-base-content/60">
      {title}
      {jev && <span className="badge badge-ghost badge-xs normal-case">Jev · {jev.ms} ms</span>}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-base-content/50">{label}: </span>
      {children}
    </div>
  );
}

/** The spell-check pass before the main request: typed text, text used, and Jev's picks. */
export function Spelling({ spelling }: { spelling: SpellingTrace }) {
  const changed = spelling.corrected !== spelling.original;
  return (
    <section className="rounded-box border border-base-300 p-3">
      <Heading title="Spell check" jev={spelling.jev} />
      <p className="mb-2 text-xs text-base-content/60">
        A dictionary checked each word. Listed common misspellings and words with a single close
        match were fixed directly; for the rest Jev picked a suggestion or kept the word, before the
        request below ran on the result.
      </p>
      <div className="mb-2 space-y-1 text-sm">
        <Field label="Typed">{spelling.original}</Field>
        <Field label="Used">
          <span className={changed ? "font-semibold" : ""}>{spelling.corrected}</span>
        </Field>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {spelling.words.map((w) => (
          <span
            key={w.word}
            className={`badge badge-sm ${w.replacement ? "badge-primary badge-soft" : "badge-ghost"}`}
          >
            {w.word} → {w.replacement ?? "kept"}
            {w.decidedBy !== "jev" && <span className="opacity-60">({w.decidedBy})</span>}
          </span>
        ))}
      </div>
      {spelling.jev && (
        <div className="space-y-2">
          <QuestionList jev={spelling.jev} optionLabels={spelling.optionLabels} />
        </div>
      )}
    </section>
  );
}

/**
 * The follow-up rewrite before the main request: the previous question, what was typed, what was
 * used, and, when Jev was asked, the question it answered to pick the rewrite.
 */
export function FollowUp({ followUp }: { followUp: FollowUpTrace }) {
  const changed = followUp.resolved !== followUp.original;
  return (
    <section className="rounded-box border border-base-300 p-3">
      <Heading title="Follow-up" jev={followUp.jev} />
      <p className="mb-2 text-xs text-base-content/60">
        {followUp.slot
          ? `A short follow-up naming a new ${followUp.slot}: code put it in place of the previous question's ${followUp.slot}.`
          : "A short follow-up: code rewrote the previous question with the new words swapped in, and Jev picked the rewrite that matches (or kept the message as-is)."}
      </p>
      <div className="mb-2 space-y-1 text-sm">
        <Field label="Previous">{followUp.previous}</Field>
        <Field label="Typed">{followUp.original}</Field>
        <Field label="Used">
          <span className={changed ? "font-semibold" : ""}>{followUp.resolved}</span>
          {!changed && <span className="badge badge-ghost badge-xs ml-2">as-is</span>}
        </Field>
      </div>
      {followUp.jev && <QuestionList jev={followUp.jev} optionLabels={followUp.optionLabels} />}
    </section>
  );
}
