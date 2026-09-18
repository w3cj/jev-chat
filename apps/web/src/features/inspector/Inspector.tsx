import type { JevAnswerJson, JevQuestionJson, Trace } from "@jev-chat/server/types";

import type { ChatMessage } from "../../api.ts";
import { Json } from "../../components/ui/Json.tsx";
import { jevTotals } from "../../jevTrace.ts";
import { useUi } from "../../store.ts";
import { Decision } from "./Decision.tsx";
import { FollowUp, Spelling } from "./Preprocess.tsx";
import { QuestionCard } from "./QuestionCard.tsx";
import { Steps } from "./Steps.tsx";

/**
 * Everything recorded for one reply's turn: timings, rewrites, the decision, Jev's questions, and
 * the raw JSON. Shows a hint instead when there is no traced reply to inspect.
 */
export function Inspector({ message }: { message?: ChatMessage }) {
  const trace = message?.trace as Trace | null | undefined;

  if (!message || !trace) {
    return (
      <div className="p-6 text-sm text-base-content/60">
        <h2 className="mb-2 text-lg font-semibold text-base-content">Jev inspector</h2>
        Send a message, then click any assistant reply to see the request sent to Jev, what it
        chose, and what the code did with it.
      </div>
    );
  }

  const questions = trace.jev?.request.questions ?? {};
  const answers = trace.jev?.response?.answers ?? {};
  const used = new Set(trace.usedQuestions);
  const total = Object.keys(questions).length;
  const steps = trace.steps ?? [];
  const jev = jevTotals(trace);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Jev inspector</h2>
        <p className="truncate text-xs text-base-content/60">Reply: “{message.text}”</p>
      </div>

      <div className="stats stats-horizontal w-full bg-base-200 text-center">
        <Stat
          title="Jev"
          value={trace.jev ? `${jev.ms} ms` : "—"}
          desc={jev.requests > 1 ? `${jev.requests} requests` : undefined}
        />
        <Stat title="Tool" value={trace.call ? `${trace.call.ms} ms` : "—"} />
        <Stat title="Total" value={`${trace.totalMs} ms`} />
        <Stat
          title="Questions"
          value={total ? `${used.size}/${total}` : "—"}
          desc={
            trace.jev?.response
              ? `${trace.jev.response.usage.input_tokens} in / ${trace.jev.response.usage.output_tokens} out tok`
              : undefined
          }
        />
      </div>

      {trace.spelling && <Spelling spelling={trace.spelling} />}
      {trace.followUp && <FollowUp followUp={trace.followUp} />}

      <Decision trace={trace} />

      {trace.jev?.error && (
        <div role="alert" className="alert alert-warning alert-soft text-sm">
          Jev request failed: {trace.jev.error}
        </div>
      )}

      {total > 0 && <Questions trace={trace} questions={questions} answers={answers} used={used} />}

      {steps.length > 0 && <Steps steps={steps} />}

      {trace.jev && (
        <>
          <Json title="State sent to Jev" value={trace.jev.request.state} open />
          <Json title="Raw request JSON" value={trace.jev.request} />
          {trace.jev.response && <Json title="Raw response JSON" value={trace.jev.response} />}
        </>
      )}
      {trace.call && <Json title={`MCP result · ${trace.call.tool}`} value={trace.call.result} />}
    </div>
  );
}

function Stat({ title, value, desc }: { title: string; value: string; desc?: string }) {
  return (
    <div className="stat px-2 py-2">
      <div className="stat-title text-xs">{title}</div>
      <div className="stat-value text-base">{value}</div>
      {desc && <div className="stat-desc text-[10px]">{desc}</div>}
    </div>
  );
}

/** The main request's questions, the ones the code read sorted to the top. */
function Questions(props: {
  trace: Trace;
  questions: Record<string, JevQuestionJson>;
  answers: Record<string, JevAnswerJson>;
  used: Set<string>;
}) {
  const { trace, questions, answers, used } = props;
  const { onlyUsedQuestions, setOnlyUsed } = useUi();
  const entries = Object.entries(questions).toSorted(
    ([a], [b]) => Number(used.has(b)) - Number(used.has(a)),
  );
  const shown = onlyUsedQuestions ? entries.filter(([k]) => used.has(k)) : entries;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-base-content/60">
          Questions asked in one request ({entries.length})
        </h3>
        <label className="label cursor-pointer gap-2 text-xs">
          Only used
          <input
            type="checkbox"
            className="toggle toggle-xs"
            checked={onlyUsedQuestions}
            onChange={(e) => setOnlyUsed(e.target.checked)}
          />
        </label>
      </div>
      <p className="mb-2 text-xs text-base-content/60">
        Every tool's argument questions are asked speculatively in the same call. Greyed-out answers
        weren't needed for this turn.
      </p>
      <div className="space-y-2">
        {shown.map(([key, q]) => (
          <QuestionCard
            key={key}
            name={key}
            q={q}
            a={answers[key]}
            used={used.has(key)}
            labels={trace.optionLabels?.[key]}
          />
        ))}
      </div>
    </section>
  );
}
