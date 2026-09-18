import { describe, expect, it } from "vitest";

import type { ConversationState } from "../../shared/types.ts";
import { buildArgs, runBuild, textResult, toolResult } from "../kit/testkit.ts";
import { addTask, completeTask, findTasks } from "./todoist.ts";

const withResults: ConversationState = {
  recent: [],
  results: [
    {
      toolId: "search.brave_web_search",
      label: "Web search",
      args: { query: "rainy day things to do in Denver" },
      summary: "Search results",
      items: [
        { title: "Denver Museum of Nature & Science", url: "https://dmns.org", subtitle: "Museum" },
      ],
      numbers: [],
    },
  ],
};

describe("addTask.build", () => {
  it("takes the task text and the due date from the message", () => {
    const args = buildArgs(addTask, {
      message: "Remind me to renew my passport tomorrow",
      answers: { content: "renew my passport", due_stated: true, due: "tomorrow" },
    });
    expect(args).toEqual({ tasks: [{ dueString: "tomorrow", content: "renew my passport" }] });
  });

  it("leaves the due date off when the user didn't give one", () => {
    const args = buildArgs(addTask, {
      message: "Add buy milk to my list",
      answers: { content: "buy milk", due_stated: false },
    });
    expect(args).toEqual({ tasks: [{ content: "buy milk" }] });
  });

  it("uses a shown item's title when the user points at it, and keeps its link", () => {
    const args = buildArgs(addTask, {
      message: "Remind me to check out the first one tomorrow",
      state: withResults,
      answers: { reference: "#1", due_stated: true, due: "tomorrow" },
    }) as { tasks: Record<string, unknown>[] };
    expect(args.tasks[0]).toMatchObject({
      content: "Denver Museum of Nature & Science",
      description: "https://dmns.org",
    });
  });

  it("uses the item's title when the picked phrase only points at it", () => {
    for (const content of ["out the first one", "out the first", "first one"]) {
      const args = buildArgs(addTask, {
        message: "Remind me to check out the first one tomorrow",
        state: withResults,
        answers: { reference: "#1", content },
      }) as { tasks: Record<string, unknown>[] };
      expect(args.tasks[0].content).toBe("Denver Museum of Nature & Science");
    }
  });

  it("keeps the user's own phrase when it says what to do with the item", () => {
    const args = buildArgs(addTask, {
      message: "Remind me to book tickets for the museum from that list",
      state: withResults,
      answers: { reference: "#1", content: "book tickets for the museum" },
    }) as { tasks: Record<string, unknown>[] };
    expect(args.tasks[0].content).toBe("book tickets for the museum");
  });

  it("keeps a phrase that uses an ordinal without pointing at an item", () => {
    const args = buildArgs(addTask, {
      message: "Remind me to finish my first draft about that museum",
      state: withResults,
      answers: { reference: "#1", content: "finish my first draft" },
    }) as { tasks: Record<string, unknown>[] };
    expect(args.tasks[0].content).toBe("finish my first draft");
  });

  it("shows the item's link in the trace, since it is sent as the description", () => {
    const { result } = runBuild(addTask, {
      message: "Remind me to check out the first one",
      state: withResults,
      answers: { reference: "#1" },
    });
    expect(result.sources).toContainEqual(
      expect.objectContaining({ name: "description", value: "https://dmns.org" }),
    );
  });

  it("asks what the task is rather than adding an empty one", () => {
    const { result } = runBuild(addTask, { message: "add a task", answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("content");
  });

  it("always confirms before writing", () => {
    expect(addTask.confirm?.({})).toBe(true);
  });
});

describe("findTasks.build", () => {
  it("asks Todoist for today by default", () => {
    expect(buildArgs(findTasks, { message: "what's due?", answers: {} })).toMatchObject({
      startDate: "today",
      daysCount: 1,
    });
  });

  it("resolves tomorrow to a real date in the assistant's zone", () => {
    const args = buildArgs(findTasks, {
      message: "what's on my list tomorrow?",
      answers: { day: "tomorrow" },
    });
    expect(args).toMatchObject({ daysCount: 1, overdueOption: "exclude-overdue" });
    expect(args.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("covers the week and overdue-only as their own shapes", () => {
    expect(
      buildArgs(findTasks, { message: "this week", answers: { day: "next_7_days" } }),
    ).toMatchObject({ startDate: "today", daysCount: 7 });
    expect(buildArgs(findTasks, { message: "overdue", answers: { day: "overdue" } })).toMatchObject(
      { overdueOption: "overdue-only" },
    );
  });
});

describe("findTasks.present", () => {
  const tasks = {
    tasks: [{ id: "1", content: "Renew passport", dueDate: "2026-09-19", priority: "p1" }],
  };

  it("lists the tasks and says which day they belong to", () => {
    const out = findTasks.present(toolResult(tasks), { startDate: "today", daysCount: 1 });
    expect(out.text).toBe("1 task today:");
    expect(out.card).toMatchObject({ type: "tasks", heading: "Tasks today" });
    expect(out.lastResult?.items[0]).toMatchObject({
      id: "1",
      title: "Renew passport",
      subtitle: "due 2026-09-19",
    });
  });

  it("says so when there is nothing on the list", () => {
    const out = findTasks.present(toolResult({ tasks: [] }), { startDate: "today", daysCount: 7 });
    expect(out.text).toBe("Nothing on your list this week.");
  });

  it("names the date for a day other than today", () => {
    const out = findTasks.present(toolResult(tasks), { startDate: "2026-09-19", daysCount: 1 });
    expect(out.text).toBe("1 task on 2026-09-19:");
  });

  it("treats overdue-only as today", () => {
    const out = findTasks.present(toolResult({ tasks: [] }), {
      startDate: "today",
      overdueOption: "overdue-only",
    });
    expect(out.text).toBe("Nothing on your list today.");
  });
});

describe("completeTask", () => {
  const withTasks: ConversationState = {
    recent: [],
    results: [
      {
        toolId: "todoist.find-tasks-by-date",
        label: "List tasks",
        args: {},
        summary: "Tasks today",
        items: [{ id: "42", title: "Renew passport" }],
        numbers: [],
      },
    ],
  };

  it("completes the task the user pointed at", () => {
    expect(
      buildArgs(completeTask, {
        message: "mark the first one as done",
        state: withTasks,
        answers: { task: "#1" },
      }),
    ).toEqual({ ids: ["42"] });
  });

  it("asks for a list first when nothing has been shown", () => {
    const { result } = runBuild(completeTask, { message: "mark it done", answers: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.prompt).toMatch(/show your list/i);
  });

  it("is flagged destructive and confirmed", () => {
    expect(completeTask.destructive).toBe(true);
    expect(completeTask.confirm?.({})).toBe(true);
  });

  it("reports a failed completion from the tool's own text", () => {
    const out = completeTask.present(textResult("Task 42 not found"), {});
    expect(out.card).toMatchObject({ type: "action", ok: false });
  });
});
