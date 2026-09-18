import { z } from "zod";

import { candidateQ, choiceQ, noulQ } from "../../jev/questions.ts";
import { argText, localDate, readResult, textOf, type SingleStepAdapter } from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";

const task = z.object({
  id: z.string(),
  content: z.string(),
  dueDate: z.string().optional(),
  priority: z.string().optional(),
});
const taskList = z.object({ tasks: z.array(task).default([]) });
const completion = z.object({ successCount: z.number().default(0) });

type Task = z.infer<typeof task>;

function taskItems(tasks: Task[]) {
  return tasks.map((t) => ({
    id: t.id,
    title: t.content,
    subtitle: t.dueDate ? `due ${t.dueDate}` : undefined,
    due: t.dueDate,
    priority: t.priority,
  }));
}

const POINTER =
  /\b(?:it|them|th(?:at|is) one|the (?:first|second|third|fourth|fifth|last|top|\d+(?:st|nd|rd|th)))\b/i;

/** Whether a phrase says what to do, rather than being short or pointing at an item ("the first one"). */
function describesTask(phrase: string): boolean {
  return phrase.split(" ").length > 2 && !POINTER.test(phrase);
}

export const addTask: SingleStepAdapter = {
  id: "todoist.add-tasks",
  server: "todoist",
  mcpName: "add-tasks",
  label: "Add a task",
  description: "Add a task or reminder to the user's Todoist to-do list",
  examples: ["Remind me to renew my passport tomorrow", "Add buy milk to my list"],
  questions: (p) => ({
    content: candidateQ(
      "For adding a task: which phrase is the task itself (what the user needs to do)? If the user refers to an item shown earlier ('the first one'), pick that item's title.",
      p.text,
      "The task isn't stated",
    ),
    due_stated: noulQ("For adding a task: does the user say when the task is due?"),
    due: candidateQ(
      "For adding a task: which phrase says when it's due (e.g. 'tomorrow', 'friday at 6pm')?",
      p.text,
      "No due date",
    ),
    reference: candidateQ(
      "For adding a task: does the user refer to one of the items shown earlier? Which one?",
      p.items,
      "No reference to an earlier item",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    const newTask: Record<string, unknown> = {};

    const ref = args.candidate("reference", p.items);
    const content = args.candidate("content", p.text);
    let taskContent: string | undefined;
    if (ref) {
      taskContent =
        content && content.source === "message" && describesTask(content.value)
          ? content.value
          : ref.value.title;
      args.note(
        "content",
        taskContent,
        taskContent === ref.value.title ? "earlier result" : "message",
        args.key("reference"),
      );
    } else if (content) {
      taskContent = content.value;
      args.note("content", content.value, content.source, args.key("content"));
    }
    if (ref?.value.url) {
      newTask.description = ref.value.url;
      args.note("description", ref.value.url, ref.source, args.key("reference"));
    }

    if (args.yes("due_stated")) {
      const due = args.candidate("due", p.text);
      if (due) {
        newTask.dueString = due.value;
        args.note("dueString", due.value, due.source, args.key("due"));
      }
    }

    if (!taskContent) return args.missing("content", "What's the task?", { tasks: [newTask] });
    newTask.content = taskContent;
    return args.ok({ tasks: [newTask] });
  },
  confirm: () => true,
  confirmLabel: "Add task",
  present(result) {
    const items = taskItems(readResult(result, taskList, "add-tasks")?.tasks ?? []);
    return {
      text: items.length
        ? `Added "${items[0].title}"${items[0].due ? `, due ${items[0].due}` : ""}.`
        : textOf(result),
      card: { type: "tasks", heading: "Added to Todoist", items },
      lastResult: { summary: "Task added", items, numbers: [] },
    };
  },
};

const DAY_OPTIONS = {
  today: "Today (including overdue)",
  tomorrow: "Tomorrow",
  next_7_days: "This week / the next 7 days",
  overdue: "Only overdue tasks",
};

function dayRange(day: string): Record<string, unknown> {
  // Todoist accepts the literal "today"; other days need a real date.
  switch (day) {
    case "tomorrow":
      return { startDate: localDate(1), daysCount: 1, overdueOption: "exclude-overdue" };
    case "next_7_days":
      return { startDate: "today", daysCount: 7 };
    case "overdue":
      return { startDate: "today", overdueOption: "overdue-only" };
    default:
      return { startDate: "today", daysCount: 1 };
  }
}

function whenPhrase(args: Record<string, unknown>): string {
  if (args.startDate !== "today") return `on ${argText(args.startDate)}`;
  return args.daysCount === 7 ? "this week" : "today";
}

export const findTasks: SingleStepAdapter = {
  id: "todoist.find-tasks-by-date",
  server: "todoist",
  mcpName: "find-tasks-by-date",
  label: "List tasks",
  description: "Show what's on the user's Todoist to-do list for a day or the week",
  examples: ["What's on my todo list for tomorrow?", "What's due today?"],
  questions: () => ({
    day: choiceQ("For listing tasks: which day or range does the user ask about?", DAY_OPTIONS),
  }),
  build(a) {
    const args = new Args(a);
    const day = args.choice("day", "today")!;
    args.note("day", day, "option", args.key("day"));
    return args.ok({ ...dayRange(day), limit: 10 });
  },
  present(result, args) {
    const items = taskItems(readResult(result, taskList, "find-tasks-by-date")?.tasks ?? []);
    const when = whenPhrase(args);
    return {
      text: items.length
        ? `${items.length} task${items.length === 1 ? "" : "s"} ${when}:`
        : `Nothing on your list ${when}.`,
      card: { type: "tasks", heading: `Tasks ${when}`, items },
      lastResult: { summary: `Tasks ${when}`, items, numbers: [] },
    };
  },
};

export const completeTask: SingleStepAdapter = {
  id: "todoist.complete-tasks",
  server: "todoist",
  mcpName: "complete-tasks",
  label: "Complete a task",
  description: "Mark a task shown earlier as done in Todoist",
  examples: ["Mark the first one as done"],
  questions: (p) => ({
    task: candidateQ(
      "For completing a task: which of the tasks shown earlier should be marked done?",
      p.items,
      "None of the shown tasks",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    const t = args.candidate("task", p.items);
    if (!t?.value.id) {
      return args.missing(
        "task",
        "Which task should I mark as done? Show your list first, then pick one.",
      );
    }
    args.note("ids", `${t.value.title} (${t.value.id})`, t.source, args.key("task"));
    return args.ok({ ids: [t.value.id] });
  },
  confirm: () => true,
  confirmLabel: "Mark done",
  destructive: true,
  present(result) {
    const completed = readResult(result, completion, "complete-tasks")?.successCount ?? 0;
    return {
      text: completed ? "Marked as done." : textOf(result),
      card: {
        type: "action",
        title: completed ? "Task completed" : "Couldn't complete task",
        lines: [textOf(result)],
        ok: completed > 0,
      },
    };
  },
};
