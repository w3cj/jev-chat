const DEMO_SCRIPT = [
  "What's the weather in Denver tomorrow?",
  "What's the high in celsius?",
  "Search for rainy day things to do in Denver",
  "Remind me to check out the first one tomorrow",
  "What's on my todo list for tomorrow?",
  "Turn on the living room lights",
  "Set the thermostat to 70",
  "What's a 20% tip on $64?",
  "Something vegan for dinner",
  "How do I make the first one?",
  "How tall is Mount Rainier?",
  "Who hosts the Syntax podcast?",
  "Book me a flight to Denver",
];

/** A scrollable row of numbered demo prompts; clicking one sends it. */
export function SuggestedPrompts({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {DEMO_SCRIPT.map((p, i) => (
        <button
          key={p}
          className="btn btn-outline btn-xs shrink-0 font-normal"
          disabled={disabled}
          onClick={() => onPick(p)}
        >
          <span className="text-base-content/40">{i + 1}</span> {p}
        </button>
      ))}
    </div>
  );
}
