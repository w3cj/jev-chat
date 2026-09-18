import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMessages } from "./queries.ts";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body, { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMessages", () => {
  it("returns the conversation and its messages", async () => {
    const data = { conversation: { id: "c1" }, messages: [] };
    respondWith(200, data);

    await expect(fetchMessages("c1")).resolves.toEqual(data);
  });

  it("says the conversation wasn't found on a 404", async () => {
    respondWith(404, { error: "Not found" });

    await expect(fetchMessages("c1")).rejects.toThrow("Conversation not found");
  });

  it("surfaces other failures with their status", async () => {
    respondWith(500, { error: "Database is locked" });

    await expect(fetchMessages("c1")).rejects.toThrow('500 {"error":"Database is locked"}');
  });
});
