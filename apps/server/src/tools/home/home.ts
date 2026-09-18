import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { HomeTarget, Pools } from "../../jev/pools.ts";
import { candidateQ, choiceQ, noulQ } from "../../jev/questions.ts";
import {
  argText,
  jsonTexts,
  textOf,
  type SingleStepAdapter,
  type Presented,
} from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";
import { getHomeCatalog, setHomeCatalogFromText } from "./catalog.ts";

const DOMAIN_OPTIONS = {
  light: "Lights",
  switch: "Switches / plugs",
  fan: "Fans",
  cover: "Blinds, curtains, garage doors",
  lock: "Locks",
  media_player: "TVs, speakers",
  any: "Not specific / a named device",
};

const HOME_TARGET_HINT =
  'Users often say only part of a device name, so match a partial name to the closest device in the list. If they say "it" or "them", pick the device marked as just changed.';
const HOME_TARGET_NONE = "No device or room is mentioned or referred to at all";

/** Set the picked area or device as Home Assistant's `area` or `name` argument. */
function homeTarget(args: Args, p: Pools, question = "target"): HomeTarget | undefined {
  const t = args.candidate(question, p.homeTargets);
  if (t) args.set(t.value.kind, t.value.value, t.source, args.key(question));
  return t?.value;
}

// The envelope varies between Home Assistant versions (sometimes wrapped in `data`).
const namedTargets = z.array(z.object({ name: z.string() })).default([]);
const intentResponse = z.object({
  data: z.object({ success: namedTargets, failed: namedTargets }).optional(),
  success: namedTargets.optional(),
  failed: namedTargets.optional(),
  speech: z
    .object({ plain: z.object({ speech: z.string() }).partial() })
    .partial()
    .optional(),
});

function presentHome(result: CallToolResult, title: string): Presented {
  const [json] = jsonTexts(result);
  const parsed = intentResponse.safeParse(json);
  const envelope = parsed.success ? parsed.data : undefined;
  const success = (envelope?.data?.success ?? envelope?.success ?? []).map((s) => s.name);
  const failed = (envelope?.data?.failed ?? envelope?.failed ?? []).map((s) => s.name);
  const speech = envelope?.speech?.plain?.speech;
  const succeeded = !result.isError && failed.length === 0;
  const lines = [
    ...(speech ? [speech] : []),
    ...success.map((s) => `✓ ${s}`),
    ...failed.map((s) => `✗ ${s}`),
  ];
  return {
    text: succeeded
      ? `${title}${success.length ? `: ${success.join(", ")}` : ""}.`
      : `Home Assistant: ${textOf(result)}`,
    card: { type: "action", title, lines: lines.length ? lines : [textOf(result)], ok: succeeded },
    lastResult: { summary: title, items: success.map((s) => ({ title: s })), numbers: [] },
  };
}

const GUARDED_DOMAINS = new Set(["lock", "cover"]);

/** Whether a turn on/off call could reach a lock, a cover, or a device of unknown kind. */
function reachesGuarded(args: Record<string, unknown>): boolean {
  let domains: (string | undefined)[];
  if (args.domain) {
    domains = args.domain as string[];
  } else if (typeof args.area === "string") {
    const inArea = getHomeCatalog().entities.filter((e) => e.area === args.area);
    domains = inArea.map((e) => e.domain);
  } else {
    domains = [args.__domain as string | undefined];
  }
  return domains.some((d) => d === undefined || GUARDED_DOMAINS.has(d));
}

/**
 * The HassTurnOn or HassTurnOff adapter; a call that could reach a lock, cover or unknown device
 * requires confirmation.
 */
export function turnAdapter(on: boolean): SingleStepAdapter {
  return {
    id: on ? "home.HassTurnOn" : "home.HassTurnOff",
    server: "home",
    mcpName: on ? "HassTurnOn" : "HassTurnOff",
    label: on ? "Turn on" : "Turn off",
    description: on
      ? "Turn on or open a device, light, switch, scene or area in the home"
      : "Turn off or close a device, light, switch or area in the home",
    examples: on ? ["Turn on the living room lights"] : ["Turn off the kitchen lights"],
    questions: (p) => ({
      target: candidateQ(
        `For turning something ${on ? "on" : "off"} in the home: which device or area? ${HOME_TARGET_HINT}`,
        p.homeTargets,
        HOME_TARGET_NONE,
      ),
      domain: choiceQ(
        `For turning something ${on ? "on" : "off"} in the home: which kind of device?`,
        DOMAIN_OPTIONS,
      ),
    }),
    build(a, p) {
      const args = new Args(a);
      const target = homeTarget(args, p);
      // A domain filter can only break an exact name match.
      if (target?.kind === "name" && target.domain) {
        args.fixed("__domain", target.domain);
        args.note("domain", target.domain, "Home Assistant");
      } else {
        const domain = args.choice("domain", "any");
        if (domain !== "any") {
          args.fixed("domain", [domain]);
          args.note("domain", domain, "option", args.key("domain"));
        }
      }
      if (!target) {
        return args.missing("target", `Which device or room should I turn ${on ? "on" : "off"}?`);
      }
      return args.ok();
    },
    confirm: reachesGuarded,
    confirmLabel: on ? "Turn on" : "Turn off",
    destructive: true,
    present: (result) => presentHome(result, on ? "Turned on" : "Turned off"),
  };
}

// Keys are sent to Home Assistant verbatim, so they must be CSS color names.
const LIGHT_COLORS: Record<string, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  gold: "Gold / amber",
  lime: "Lime / bright green",
  green: "Green",
  teal: "Teal",
  cyan: "Cyan / aqua",
  turquoise: "Turquoise",
  blue: "Blue",
  indigo: "Indigo",
  purple: "Purple",
  violet: "Violet / lavender",
  magenta: "Magenta",
  pink: "Pink",
  white: "White",
};

const WHITE_TEMPS: Record<string, { label: string; kelvin: number }> = {
  warm: { label: "Warm white / cozy / candlelight", kelvin: 2700 },
  soft: { label: "Soft white", kelvin: 3000 },
  neutral: { label: "Neutral white", kelvin: 4000 },
  daylight: { label: "Daylight / bright white", kelvin: 5000 },
  cool: { label: "Cool white / blue-ish white", kelvin: 6500 },
};

function lightSetTitle(args: Record<string, unknown>): string {
  if (args.color) return `Set to ${argText(args.color)}`;
  if (args.temperature) return `White set to ${argText(args.temperature)} K`;
  return "Brightness set";
}

export const lightSet: SingleStepAdapter = {
  id: "home.HassLightSet",
  server: "home",
  mcpName: "HassLightSet",
  label: "Set light",
  description: "Change a light's color (e.g. green, blue), brightness percentage, or white warmth",
  examples: ["Turn the desk lamp green", "Set the kitchen lights to 40%"],
  questions: (p) => ({
    target: candidateQ(
      `For changing a light's color or brightness: which light or area? ${HOME_TARGET_HINT}`,
      p.homeTargets,
      HOME_TARGET_NONE,
    ),
    change: choiceQ("For changing a light: what should change?", {
      color: "Its color (red, green, blue, …)",
      temperature: "Its white warmth (warm white, cool white, daylight)",
      brightness: "Its brightness (a percentage, dimmer, brighter)",
    }),
    color: choiceQ("For changing a light's color: which color?", {
      ...LIGHT_COLORS,
      none: "No color named, or a color not in this list",
    }),
    temperature: choiceQ(
      "For changing a light's white warmth: which white?",
      Object.fromEntries(Object.entries(WHITE_TEMPS).map(([k, v]) => [k, v.label])),
    ),
    brightness: candidateQ(
      "For changing a light's brightness: which number is the brightness percentage?",
      p.numbers,
      "No brightness given",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    const target = homeTarget(args, p);
    const change = args.choice("change", "brightness")!;
    args.note("change", change, "option", args.key("change"));

    if (change === "color") {
      args.option("color");
    } else if (change === "temperature") {
      const t = args.choice("temperature");
      const preset = t ? WHITE_TEMPS[t] : undefined;
      if (preset) {
        args.fixed("temperature", preset.kelvin);
        args.note("temperature", `${preset.kelvin} K (${t})`, "option", args.key("temperature"));
      }
    } else {
      const b = args.candidate("brightness", p.numbers);
      if (b) {
        args.set(
          "brightness",
          Math.max(0, Math.min(100, Math.round(b.value))),
          b.source,
          args.key("brightness"),
        );
      }
    }

    if (!target) return args.missing("target", "Which light?");
    if (change === "color" && !args.has("color")) {
      return args.missing("color", `Which color? I know ${Object.keys(LIGHT_COLORS).join(", ")}.`);
    }
    if (change === "brightness" && !args.has("brightness")) {
      return args.missing("brightness", "What brightness (0–100%)?");
    }
    return args.ok();
  },
  destructive: true,
  present: (result, args) => presentHome(result, lightSetTitle(args)),
};

export const climateSet: SingleStepAdapter = {
  id: "home.HassClimateSetTemperature",
  server: "home",
  mcpName: "HassClimateSetTemperature",
  label: "Set thermostat",
  description: "Set the thermostat / heating / air conditioning to a temperature",
  examples: ["Set the thermostat to 70"],
  questions: (p) => ({
    temperature: candidateQ(
      "For setting the thermostat: which number is the target temperature?",
      p.numbers,
      "No temperature given",
    ),
    target_stated: noulQ(
      "For setting the thermostat: does the user name a specific room or thermostat?",
    ),
    target: candidateQ(
      `For setting the thermostat: which room or thermostat? ${HOME_TARGET_HINT}`,
      p.homeTargets,
      HOME_TARGET_NONE,
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    if (args.yes("target_stated")) homeTarget(args, p);
    args.pick("temperature", p.numbers);
    return args.require("temperature", "What temperature should I set?");
  },
  destructive: true,
  present: (result) => presentHome(result, "Thermostat set"),
};

export const homeStatus: SingleStepAdapter = {
  id: "home.GetLiveContext",
  server: "home",
  mcpName: "GetLiveContext",
  label: "Home status",
  description:
    "Check the current state of smart home devices (is a door locked, are lights on, temperature inside)",
  examples: ["Which lights are on?", "Is anything still switched on?"],
  questions: (p) => ({
    target: candidateQ(
      "For checking the home's status: which device or area is the user asking about?",
      p.homeTargets,
      "The whole house / not specific",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    const t = args.candidate("target", p.homeTargets);
    if (t) args.note("filter", t.value.value, t.source, args.key("target"));
    return args.ok();
  },
  present(result) {
    const catalog = setHomeCatalogFromText(textOf(result));
    const items = catalog.entities.map((e) => ({
      title: e.name,
      subtitle: [e.state, e.area].filter(Boolean).join(" · "),
    }));
    return {
      text: `${items.length} devices exposed to the assistant.`,
      card: { type: "device_status", heading: "Home status", items: items.slice(0, 20) },
      lastResult: { summary: "Home status", items, numbers: [] },
    };
  },
};
