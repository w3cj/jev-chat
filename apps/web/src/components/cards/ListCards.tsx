import type { ReactNode } from "react";

import { ExtLink } from "../ui/ExtLink.tsx";
import type { CardComponent } from "./types.ts";

/** A headed list in a box, with a message when it's empty. */
function ItemList({
  heading,
  empty,
  items,
  children,
}: {
  heading: string;
  empty: string;
  items: unknown[];
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-base-200 p-2">
      <div className="mb-1 text-sm font-semibold">{heading}</div>
      {items.length === 0 && <div className="text-sm text-base-content/60">{empty}</div>}
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Index({ n }: { n: number }) {
  return <span className="text-base-content/40">#{n}</span>;
}

/** Numbered web search results, each linking out with a short snippet. */
export const SearchResultsCard: CardComponent<"search_results"> = ({ card }) => (
  <ol className="space-y-2">
    {card.items.map((it, i) => (
      <li key={it.url ?? i} className="rounded-lg bg-base-200 p-2">
        <ExtLink href={it.url} className="font-medium">
          <Index n={i + 1} /> {it.title}
        </ExtLink>
        {it.subtitle && <p className="line-clamp-2 text-sm text-base-content/70">{it.subtitle}</p>}
      </li>
    ))}
  </ol>
);

/** A numbered task list; priority is badged unless it's the default p4. */
export const TasksCard: CardComponent<"tasks"> = ({ card }) => (
  <ItemList heading={card.heading} empty="Nothing here." items={card.items}>
    {card.items.map((t, i) => (
      <li key={t.id ?? i} className="flex items-center gap-2 text-sm">
        <Index n={i + 1} />
        <span className="flex-1">{t.title}</span>
        {t.subtitle && <span className="badge badge-ghost badge-sm">{t.subtitle}</span>}
        {t.priority && t.priority !== "p4" && (
          <span className="badge badge-warning badge-sm">{t.priority}</span>
        )}
      </li>
    ))}
  </ItemList>
);

/** Smart home devices and their current state. */
export const DeviceStatusCard: CardComponent<"device_status"> = ({ card }) => (
  <ItemList
    heading={card.heading}
    empty="No devices are exposed to the assistant."
    items={card.items}
  >
    {card.items.map((d, i) => (
      <li key={d.id ?? i} className="flex items-center gap-2 text-sm">
        <span className="flex-1">{d.title}</span>
        {d.subtitle && <span className="badge badge-ghost badge-sm">{d.subtitle}</span>}
      </li>
    ))}
  </ItemList>
);

/** Each tool server with its connection status and example prompts. */
export const CapabilitiesCard: CardComponent<"capabilities"> = ({ card }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {card.servers.map((s) => (
      <div key={s.label} className="rounded-lg bg-base-200 p-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <span className={`status ${s.connected ? "status-success" : "status-warning"}`} />{" "}
          {s.label}
        </div>
        {s.examples.map((e) => (
          <div key={e} className="text-base-content/70">
            “{e}”
          </div>
        ))}
      </div>
    ))}
  </div>
);
