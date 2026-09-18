import type { TraceStep } from "@jev-chat/server/types";

import { Json } from "../../components/ui/Json.tsx";
import { keyed } from "../../components/ui/keyed.ts";
import { QuestionList } from "./QuestionCard.tsx";

/** The calls and Jev requests a multi-step tool made, in the order it made them. */
export function Steps({ steps }: { steps: TraceStep[] }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-base-content/60">
        Tool steps in this turn
      </h3>
      <p className="mb-2 text-xs text-base-content/60">
        Each tool result feeds the next Jev request. Jev only picks from the options code collected;
        the reply quotes the pick word for word.
      </p>
      <ul className="timeline timeline-vertical timeline-compact">
        {keyed(steps, (st) => st.title).map(({ key, item: st }, i) => (
          <li key={key}>
            {i > 0 && <hr />}
            <div className="timeline-middle">
              <span className={`badge badge-sm ${st.jev ? "badge-primary" : "badge-neutral"}`}>
                {i + 1}
              </span>
            </div>
            <div className="timeline-end mb-4 w-full min-w-0 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {st.title}
                <span className="badge badge-ghost badge-xs">
                  {st.jev ? `Jev · ${st.jev.ms} ms` : `${st.call?.tool} · ${st.call?.ms} ms`}
                </span>
                {st.jev?.response && (
                  <span className="text-xs font-normal text-base-content/50">
                    {st.jev.response.usage.input_tokens} in / {st.jev.response.usage.output_tokens}{" "}
                    out tok
                  </span>
                )}
              </div>
              {st.call && (
                <>
                  <pre className="whitespace-pre-wrap break-all rounded bg-base-200 p-2 font-mono text-xs">
                    tools/call {st.call.tool} {JSON.stringify(st.call.args)}
                    {st.call.isError && " · error"}
                  </pre>
                  <Json title="Result" value={st.call.result} />
                </>
              )}
              {st.jev && (
                <>
                  <QuestionList
                    jev={st.jev}
                    used={(q) => st.usedQuestions?.includes(q) ?? true}
                    optionLabels={st.optionLabels}
                  />
                  <Json title="State sent to Jev" value={st.jev.request.state} />
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
