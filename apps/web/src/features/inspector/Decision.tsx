import type { Trace } from "@jev-chat/server/types";

/** Where each argument came from, colour-coded. "option" means Jev chose from a fixed list. */
const SOURCE_BADGE: Record<string, string> = {
  message: "badge-primary",
  "earlier result": "badge-secondary",
  "earlier request": "badge-secondary",
  "earlier message": "badge-secondary",
  "Home Assistant": "badge-accent",
  option: "badge-neutral",
};

/** The code's decision for a turn: outcome, tool, arguments and their sources, and the call. */
export function Decision({ trace }: { trace: Trace }) {
  const d = trace.decision;
  return (
    <section className="rounded-box border border-base-300 p-3">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/60">
        What the code did
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="badge badge-lg badge-primary">{d.outcome}</span>
        <span className="text-base-content/70">{d.reason}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {d.requestKind && (
          <>
            <dt className="text-base-content/60">Request kind</dt>
            <dd className="font-mono">{d.requestKind}</dd>
          </>
        )}
        {d.toolId && (
          <>
            <dt className="text-base-content/60">Tool</dt>
            <dd className="font-mono">
              {d.toolId}
              {d.toolConfidence !== undefined && (
                <span className="ml-2 text-base-content/50">
                  confidence {d.toolConfidence.toFixed(2)}
                </span>
              )}
            </dd>
          </>
        )}
      </dl>
      {trace.args && trace.args.length > 0 && (
        <table className="table table-xs mt-2">
          <thead>
            <tr>
              <th>Argument</th>
              <th>Value</th>
              <th>Came from</th>
            </tr>
          </thead>
          <tbody>
            {trace.args.map((a) => (
              <tr key={a.name}>
                <td className="font-mono">{a.name}</td>
                <td className="font-medium">
                  {typeof a.value === "string" ? a.value : JSON.stringify(a.value)}
                </td>
                <td>
                  <span
                    className={`badge badge-soft badge-xs ${SOURCE_BADGE[a.source] ?? "badge-ghost"}`}
                  >
                    {a.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {trace.call && (
        <div className="mt-2 rounded-lg bg-base-200 p-2 font-mono text-xs">
          <div className="text-base-content/60">
            tools/call → {trace.call.server} · {trace.call.tool} ({trace.call.ms} ms)
            {trace.call.isError && <span className="text-error"> · error</span>}
          </div>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(trace.call.args, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
