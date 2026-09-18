import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import YAML from "yaml";
import { z } from "zod";

import type { Candidate, HomeTarget } from "../../jev/pools.ts";
import { errorMessage } from "../../lib/errors.ts";
import type { ConversationState } from "../../shared/types.ts";
import { textOf } from "../kit/adapter.ts";

export interface HomeCatalog {
  areas: string[];
  entities: { name: string; domain?: string; area?: string; state?: string }[];
}

/** Calls a tool on the Home Assistant MCP server. */
export type HomeToolCaller = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<CallToolResult>;

let homeCatalog: HomeCatalog = { areas: [], entities: [] };

/** The current in-memory catalog; empty until a GetLiveContext result has been parsed. */
export function getHomeCatalog(): HomeCatalog {
  return homeCatalog;
}

/** Replace the catalog with one parsed from GetLiveContext's text, and return it. */
export function setHomeCatalogFromText(text: string): HomeCatalog {
  homeCatalog = parseLiveContext(text);
  return homeCatalog;
}

/** Fetch the exposed devices if the catalog is empty. A failure logs and keeps the old catalog. */
export async function ensureHomeCatalog(callHomeTool: HomeToolCaller): Promise<HomeCatalog> {
  if (homeCatalog.entities.length) return homeCatalog;
  try {
    return setHomeCatalogFromText(textOf(await callHomeTool("GetLiveContext", {})));
  } catch (err) {
    // oxlint-disable-next-line no-console
    console.warn("[home] GetLiveContext failed:", errorMessage(err));
    return homeCatalog;
  }
}

const liveEntity = z.object({
  names: z.coerce.string(),
  domain: z.coerce.string().optional(),
  areas: z.coerce.string().optional(),
  state: z.coerce.string().optional(),
});

function firstOf(list: string): string {
  return list.split(",")[0].trim();
}

/** The YAML entity list after GetLiveContext's header line; empty when there is none. */
function liveEntities(text: string): unknown[] {
  const listStart = text.search(/^- /m);
  if (listStart < 0) return [];
  try {
    const parsed: unknown = YAML.parse(text.slice(listStart));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** GetLiveContext's text as entities (name, domain, area, state) and areas; never throws. */
export function parseLiveContext(raw: string): HomeCatalog {
  // HA wraps the text in JSON: {"success": true, "result": "Live Context: ...\n- names: ..."}
  let text = raw;
  try {
    const json = JSON.parse(raw);
    if (typeof json?.result === "string") text = json.result;
  } catch {
    /* already plain text */
  }

  const entities = liveEntities(text).flatMap((item) => {
    const parsed = liveEntity.safeParse(item);
    if (!parsed.success) return [];
    const { names, domain, areas, state } = parsed.data;
    return [
      {
        name: firstOf(names),
        ...(domain ? { domain } : {}),
        ...(areas ? { area: firstOf(areas) } : {}),
        ...(state ? { state } : {}),
      },
    ];
  });
  const areas = [...new Set(entities.map((e) => e.area).filter((a): a is string => !!a))];
  return { areas, entities };
}

const CONTROLLABLE_DOMAINS = new Set([
  "light",
  "switch",
  "fan",
  "cover",
  "lock",
  "media_player",
  "climate",
  "scene",
  "script",
  "input_boolean",
  "vacuum",
  "valve",
  "button",
  "humidifier",
  "water_heater",
]);

/** Every area and device name in the catalog. */
export function homeWords(): string[] {
  return [...homeCatalog.areas, ...homeCatalog.entities.map((e) => e.name)];
}

function deviceLabel(entity: HomeCatalog["entities"][number], justChanged: boolean): string {
  const { name, domain, area } = entity;
  const where = area ? `, ${area}` : "";
  const kind = domain ? ` (${domain}${where})` : "";
  const marker = justChanged ? ' ← just changed ("it" / "them")' : "";
  return `Device: ${name}${kind}${marker}`;
}

/**
 * The areas and controllable or unknown-kind devices Jev may choose between, marking what the
 * newest result changed when it was a home action (not a status check).
 */
export function homeTargetsFrom(
  catalog: HomeCatalog,
  state: ConversationState,
): Candidate<HomeTarget>[] {
  const newest = state.results?.[0];
  const justChanged = new Set(
    newest?.toolId.startsWith("home.") && newest.toolId !== "home.GetLiveContext"
      ? newest.items.map((i) => i.title.toLowerCase())
      : [],
  );
  const out: Candidate<HomeTarget>[] = [];
  for (const area of catalog.areas) {
    out.push({
      key: `a${out.length}`,
      value: { kind: "area", value: area },
      label: `Area: ${area}`,
      source: "Home Assistant",
    });
  }
  for (const e of catalog.entities) {
    if (e.domain && !CONTROLLABLE_DOMAINS.has(e.domain)) continue;
    out.push({
      key: `e${out.length}`,
      value: { kind: "name", value: e.name, domain: e.domain },
      label: deviceLabel(e, justChanged.has(e.name.toLowerCase())),
      source: "Home Assistant",
    });
  }
  return out;
}

/** `homeTargetsFrom` over the current catalog. */
export function homeTargetPool(state: ConversationState): Candidate<HomeTarget>[] {
  return homeTargetsFrom(homeCatalog, state);
}
