import { describe, expect, it, vi } from "vitest";

import { buildArgs, runBuild, textResult } from "../kit/testkit.ts";
import {
  ensureHomeCatalog,
  homeTargetsFrom,
  homeWords,
  parseLiveContext,
  setHomeCatalogFromText,
  type HomeCatalog,
  type HomeToolCaller,
} from "./catalog.ts";
import { climateSet, homeStatus, lightSet, turnAdapter } from "./home.ts";

const turnOn = turnAdapter(true);
const turnOff = turnAdapter(false);

const home: HomeCatalog = {
  areas: ["Living Room", "Office"],
  entities: [
    { name: "Living Room Lights", domain: "light", area: "Living Room", state: "off" },
    { name: "Desk Lamp", domain: "light", area: "Office", state: "on" },
    { name: "Front Door", domain: "lock", area: "Hallway", state: "locked" },
  ],
};

describe("parseLiveContext", () => {
  const raw = JSON.stringify({
    success: true,
    result: [
      "Live Context: An overview of the areas and the devices in this smart home:",
      "- names: Ceiling Light",
      "  domain: light",
      "  areas: Kitchen",
      "  state: 'on'",
      "  attributes:",
      "    brightness: 255",
      "- names: Coffee Maker",
      "  domain: switch",
      "  areas: Kitchen",
      "  state: 'off'",
      "- names: Porch Lamp",
      "  domain: light",
      "  areas: Porch",
      "  state: 'off'",
    ].join("\n"),
  });

  it("reads every entity with its domain, area and state", () => {
    expect(parseLiveContext(raw).entities).toEqual([
      { name: "Ceiling Light", domain: "light", area: "Kitchen", state: "on" },
      { name: "Coffee Maker", domain: "switch", area: "Kitchen", state: "off" },
      { name: "Porch Lamp", domain: "light", area: "Porch", state: "off" },
    ]);
  });

  it("collects each area once", () => {
    expect(parseLiveContext(raw).areas).toEqual(["Kitchen", "Porch"]);
  });

  it("ignores nested attribute keys", () => {
    expect(parseLiveContext(raw).entities[0]).not.toHaveProperty("brightness");
  });

  it("accepts plain text that isn't JSON-wrapped", () => {
    expect(parseLiveContext("- names: Desk Lamp\n  domain: light").entities).toEqual([
      { name: "Desk Lamp", domain: "light" },
    ]);
  });

  it("returns empty for unparseable input rather than throwing", () => {
    expect(parseLiveContext("nothing useful here")).toEqual({ areas: [], entities: [] });
    expect(parseLiveContext("Live Context:\n- names: [unclosed")).toEqual({
      areas: [],
      entities: [],
    });
  });

  it("takes the first of several names and areas", () => {
    const text = "Live Context:\n- names: Desk Lamp, Office Lamp\n  areas: Office, Upstairs";
    expect(parseLiveContext(text).entities).toEqual([{ name: "Desk Lamp", area: "Office" }]);
  });

  it("reads YAML values the way Home Assistant writes them", () => {
    const text = [
      "Live Context:",
      "- names: Thermostat",
      "  domain: climate",
      "  state: 21.5",
      "- names: Desk Lamp",
      "  state: on",
      '- names: "Kid\'s Room: Night Light"',
      "  state: off",
    ].join("\n");
    expect(parseLiveContext(text).entities).toEqual([
      { name: "Thermostat", domain: "climate", state: "21.5" },
      { name: "Desk Lamp", state: "on" },
      { name: "Kid's Room: Night Light", state: "off" },
    ]);
  });

  it("skips list entries without a name", () => {
    expect(parseLiveContext("Live Context:\n- domain: light\n- names: Lamp").entities).toEqual([
      { name: "Lamp" },
    ]);
  });
});

describe("homeTargetsFrom", () => {
  it("offers areas and controllable devices, but not sensors", () => {
    const catalog: HomeCatalog = {
      areas: ["Kitchen"],
      entities: [
        { name: "Ceiling Light", domain: "light", area: "Kitchen" },
        { name: "Hallway Sensor", domain: "sensor", area: "Hallway" },
      ],
    };
    const values = homeTargetsFrom(catalog, { recent: [] }).map((t) => t.value.value);
    expect(values).toContain("Kitchen");
    expect(values).toContain("Ceiling Light");
    expect(values).not.toContain("Hallway Sensor");
  });

  it('marks the devices the last home action changed, so "it" can resolve', () => {
    const catalog: HomeCatalog = { areas: [], entities: [{ name: "Desk Lamp", domain: "light" }] };
    const state = {
      recent: [],
      results: [
        {
          toolId: "home.HassTurnOn",
          label: "Turn on",
          args: {},
          summary: "",
          items: [{ title: "Desk Lamp" }],
          numbers: [],
        },
      ],
    };
    expect(
      homeTargetsFrom(catalog, state).find((t) => t.value.value === "Desk Lamp")?.label,
    ).toContain("just changed");
  });

  it("marks nothing after a status check, which lists every device without changing any", () => {
    const catalog: HomeCatalog = { areas: [], entities: [{ name: "Desk Lamp", domain: "light" }] };
    const state = {
      recent: [],
      results: [
        {
          toolId: "home.GetLiveContext",
          label: "Home status",
          args: {},
          summary: "Home status",
          items: [{ title: "Desk Lamp" }],
          numbers: [],
        },
      ],
    };
    expect(homeTargetsFrom(catalog, state).map((t) => t.label)).toEqual([
      "Device: Desk Lamp (light)",
    ]);
  });

  it("offers nothing when no devices are exposed", () => {
    expect(homeTargetsFrom({ areas: [], entities: [] }, { recent: [] })).toEqual([]);
  });

  it("labels each target with its kind, domain and area", () => {
    const catalog: HomeCatalog = {
      areas: ["Office"],
      entities: [
        { name: "Desk Lamp", domain: "light", area: "Office" },
        { name: "Fan", domain: "fan" },
        { name: "Mystery" },
      ],
    };
    expect(homeTargetsFrom(catalog, { recent: [] }).map((t) => t.label)).toEqual([
      "Area: Office",
      "Device: Desk Lamp (light, Office)",
      "Device: Fan (fan)",
      "Device: Mystery",
    ]);
  });
});

describe("ensureHomeCatalog", () => {
  const lamp = textResult("- names: Nook Lamp\n  domain: light");

  it("fetches the live context once, then reuses it", async () => {
    setHomeCatalogFromText("");
    const call = vi.fn<HomeToolCaller>(async () => lamp);
    expect((await ensureHomeCatalog(call)).entities).toEqual([
      { name: "Nook Lamp", domain: "light" },
    ]);
    await ensureHomeCatalog(call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("GetLiveContext", {});
  });

  it("keeps the old catalog when the fetch fails", async () => {
    setHomeCatalogFromText("");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const catalog = await ensureHomeCatalog(async () => {
      throw new Error("offline");
    });
    expect(catalog).toEqual({ areas: [], entities: [] });
    vi.restoreAllMocks();
  });
});

describe("homeWords", () => {
  it("lists the user's own device and area names, so the spell check leaves them alone", () => {
    homeStatus.present(
      textResult(["- names: Nook Lamp", "  domain: light", "  areas: Snug"].join("\n")),
      {},
    );
    expect(homeWords()).toEqual(expect.arrayContaining(["Snug", "Nook Lamp"]));
  });
});

describe("turnAdapter.build", () => {
  it("sends the device's own name and its real domain", () => {
    const args = buildArgs(turnOn, {
      message: "Turn on the living room lights",
      home,
      answers: { target: "Device: Living Room Lights" },
    });
    expect(args).toMatchObject({ name: "Living Room Lights", __domain: "light" });
  });

  it("targets a whole area when the user names a room", () => {
    const args = buildArgs(turnOff, {
      message: "Turn off the office",
      home,
      answers: { target: "Area: Office" },
    });
    expect(args).toMatchObject({ area: "Office" });
  });

  it("only applies the domain filter when the target isn't a known device", () => {
    const args = buildArgs(turnOn, {
      message: "Turn on the lights",
      answers: { target: "lights", domain: "light" },
    });
    expect(args).toMatchObject({ name: "lights", domain: ["light"] });
  });

  it("asks which device rather than guessing", () => {
    const { result } = runBuild(turnOn, { message: "turn it on", home, answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("target");
  });

  it("confirms for locks and covers but not for lights", () => {
    expect(turnOn.confirm?.({ __domain: "light" })).toBe(false);
    expect(turnOn.confirm?.({ __domain: "lock" })).toBe(true);
    expect(turnOff.confirm?.({ domain: ["cover"] })).toBe(true);
  });

  it("confirms an area that holds a lock unless a domain filter leaves it out", () => {
    setHomeCatalogFromText(
      "- names: Hall Light\n  domain: light\n  areas: Hallway\n- names: Front Door\n  domain: lock\n  areas: Hallway\n- names: Desk Lamp\n  domain: light\n  areas: Office",
    );
    expect(turnOff.confirm?.({ area: "Hallway" })).toBe(true);
    expect(turnOff.confirm?.({ area: "Hallway", domain: ["light"] })).toBe(false);
    expect(turnOff.confirm?.({ area: "Office" })).toBe(false);
    setHomeCatalogFromText("");
  });

  it("confirms a device whose kind is unknown", () => {
    expect(turnOn.confirm?.({ name: "Mystery" })).toBe(true);
  });
});

describe("lightSet.build", () => {
  it("sets a colour", () => {
    const args = buildArgs(lightSet, {
      message: "Turn the desk lamp green",
      home,
      answers: { target: "Device: Desk Lamp", change: "color", color: "green" },
    });
    expect(args).toMatchObject({ name: "Desk Lamp", color: "green" });
  });

  it("turns a white preset into kelvin", () => {
    const args = buildArgs(lightSet, {
      message: "Make the desk lamp warm white",
      home,
      answers: { target: "Device: Desk Lamp", change: "temperature", temperature: "warm" },
    });
    expect(args).toMatchObject({ temperature: 2700 });
  });

  it("clamps a brightness percentage", () => {
    const args = buildArgs(lightSet, {
      message: "Set the desk lamp to 140%",
      home,
      answers: { target: "Device: Desk Lamp", change: "brightness", brightness: "140" },
    });
    expect(args).toMatchObject({ brightness: 100 });
  });

  it("asks which colour when the user named one it doesn't know", () => {
    const { result } = runBuild(lightSet, {
      message: "Turn the desk lamp chartreuse",
      home,
      answers: { target: "Device: Desk Lamp", change: "color" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("color");
  });

  it("asks for a brightness when none was given", () => {
    const { result } = runBuild(lightSet, {
      message: "Dim the desk lamp",
      home,
      answers: { target: "Device: Desk Lamp", change: "brightness" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("brightness");
  });
});

describe("lightSet.present", () => {
  const done = textResult(JSON.stringify({ success: [{ name: "Desk Lamp" }], failed: [] }));

  it("titles the reply after what changed", () => {
    expect(lightSet.present(done, { color: "green" }).text).toBe("Set to green: Desk Lamp.");
    expect(lightSet.present(done, { temperature: 2700 }).text).toBe(
      "White set to 2700 K: Desk Lamp.",
    );
    expect(lightSet.present(done, { brightness: 40 }).text).toBe("Brightness set: Desk Lamp.");
  });
});

describe("climateSet.build", () => {
  it("sets the temperature without a target when no room was named", () => {
    const args = buildArgs(climateSet, {
      message: "Set the thermostat to 70",
      home,
      answers: { temperature: "70", target_stated: false },
    });
    expect(args).toEqual({ temperature: 70 });
  });

  it("narrows to a room when the user named one", () => {
    const args = buildArgs(climateSet, {
      message: "Set the office to 68",
      home,
      answers: { temperature: "68", target_stated: true, target: "Area: Office" },
    });
    expect(args).toMatchObject({ area: "Office", temperature: 68 });
  });

  it("asks for a temperature", () => {
    const { result } = runBuild(climateSet, {
      message: "turn the heat up",
      home,
      answers: { target_stated: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("temperature");
  });
});

describe("homeStatus", () => {
  it("takes no arguments but records what the user asked about", () => {
    const { result } = runBuild(homeStatus, {
      message: "Is the front door locked?",
      home,
      answers: { target: "Device: Front Door" },
    });
    expect(result.ok && result.args).toEqual({});
    expect(result.sources[0]).toMatchObject({ name: "filter", value: "Front Door" });
  });

  it("reads the live context into a device list", () => {
    const out = homeStatus.present(
      textResult(
        [
          "Live Context:",
          "- names: Desk Lamp",
          "  domain: light",
          "  areas: Office",
          "  state: on",
        ].join("\n"),
      ),
      {},
    );
    expect(out.card).toMatchObject({ type: "device_status" });
    expect(out.lastResult?.items[0]).toMatchObject({ title: "Desk Lamp", subtitle: "on · Office" });
  });
});
