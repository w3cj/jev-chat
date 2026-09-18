import { ExtLink } from "../ui/ExtLink.tsx";
import { keyed } from "../ui/keyed.ts";
import type { CardComponent } from "./types.ts";

/** A numbered grid of recipe suggestions, each with a button that asks how to make it. */
export const RecipesCard: CardComponent<"recipes"> = ({ card, busy, onAction }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {card.meals.map((m, i) => (
      <div key={m.id} className="card card-sm overflow-hidden bg-base-200">
        <figure className="relative">
          <img
            src={`${m.thumbnail}/preview`}
            alt={m.name}
            className="aspect-square w-full object-cover"
            loading="lazy"
          />
          <span className="badge badge-neutral badge-sm absolute left-2 top-2">#{i + 1}</span>
        </figure>
        <div className="card-body gap-1 p-2">
          <div className="line-clamp-2 text-sm font-semibold leading-tight">{m.name}</div>
          <div className="text-xs text-base-content/60">
            {[m.cuisine, m.category].filter(Boolean).join(" · ")}
          </div>
          <button
            className="btn btn-primary btn-soft btn-xs mt-1"
            disabled={busy}
            onClick={() => onAction({ type: "say", text: `How do I make ${m.name}?` })}
          >
            How do I make this?
          </button>
        </div>
      </div>
    ))}
  </div>
);

/** One full recipe: photo, links, a checklist of ingredients, and numbered steps. */
export const RecipeCard: CardComponent<"recipe"> = ({ card }) => (
  <div className="overflow-hidden rounded-box border border-base-300 bg-base-200">
    <div className="flex gap-3 p-3">
      <img
        src={`${card.thumbnail}/preview`}
        alt={card.name}
        className="size-28 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight">{card.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {card.cuisine && <span className="badge badge-sm">{card.cuisine}</span>}
          {card.category && <span className="badge badge-sm">{card.category}</span>}
        </div>
        <div className="mt-2 flex gap-2 text-xs">
          {card.youtube && <ExtLink href={card.youtube}>▶ Video</ExtLink>}
          {card.source && <ExtLink href={card.source}>Original recipe</ExtLink>}
        </div>
      </div>
    </div>
    <div className="grid gap-3 border-t border-base-300 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60">
          Ingredients
        </div>
        <ul className="space-y-1 text-sm">
          {keyed(card.ingredients, (ing) => `${ing.measure} ${ing.ingredient}`).map(
            ({ key, item: ing }) => (
              <li key={key} className="flex gap-2">
                <input type="checkbox" className="checkbox checkbox-xs mt-0.5" />
                <span>
                  <span className="text-base-content/60">{ing.measure}</span> {ing.ingredient}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60">
          Steps
        </div>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          {keyed(card.steps, (step) => step).map(({ key, item }) => (
            <li key={key}>{item}</li>
          ))}
        </ol>
      </div>
    </div>
    <div className="px-3 pb-2 text-[10px] text-base-content/50">Recipe data by TheMealDB</div>
  </div>
);
