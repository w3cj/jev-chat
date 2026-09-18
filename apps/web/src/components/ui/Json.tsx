/** A collapsible blob of JSON with its size and a copy button. */
export function Json({
  title,
  value,
  open = false,
}: {
  title: string;
  value: unknown;
  open?: boolean;
}) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="collapse-arrow collapse border border-base-300 bg-base-100">
      <input type="checkbox" defaultChecked={open} />
      <div className="collapse-title min-h-0 px-3 py-2 text-sm font-semibold">
        {title}{" "}
        <span className="font-normal text-base-content/50">
          ({(text.length / 1024).toFixed(1)} KB)
        </span>
      </div>
      <div className="collapse-content px-3">
        <button className="btn btn-xs mb-1" onClick={() => navigator.clipboard.writeText(text)}>
          Copy
        </button>
        <pre className="max-h-96 overflow-auto rounded bg-base-200 p-2 text-xs">{text}</pre>
      </div>
    </div>
  );
}
