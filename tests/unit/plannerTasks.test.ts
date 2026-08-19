import { describe, test, expect, vi, beforeEach } from "vitest";
import { extractPlannerTasks } from "../../src/lib/plannerTasks.js";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("extractPlannerTasks", () => {
  test("reads the explicit JSON_TASKS envelope", () => {
    const out = `chatter before
[JSON_TASKS_START] [{"title":"Add tests","role":"coder"}] [JSON_TASKS_END]
chatter after`;

    expect(extractPlannerTasks(out)).toEqual([{ title: "Add tests", role: "coder" }]);
  });

  test("falls back to a fenced json block", () => {
    const out = "Here is the plan:\n```json\n[{\"title\":\"Ship it\"}]\n```\n";

    expect(extractPlannerTasks(out)).toEqual([{ title: "Ship it" }]);
  });

  test("falls back to a bare json array", () => {
    expect(extractPlannerTasks('noise [{"title":"Bare"}] noise')).toEqual([{ title: "Bare" }]);
  });

  test("prefers the envelope over a fenced block when both are present", () => {
    const out = '```json\n[{"title":"wrong"}]\n```\n[JSON_TASKS_START][{"title":"right"}][JSON_TASKS_END]';

    expect(extractPlannerTasks(out)).toEqual([{ title: "right" }]);
  });

  test("returns null when the planner produced no task block", () => {
    expect(extractPlannerTasks("I could not plan this task.")).toBeNull();
  });

  test("returns null for an empty array instead of dispatching nothing", () => {
    expect(extractPlannerTasks("[JSON_TASKS_START][][JSON_TASKS_END]")).toBeNull();
  });

  test("returns null on malformed json rather than throwing", () => {
    expect(extractPlannerTasks("[JSON_TASKS_START][{title: broken}][JSON_TASKS_END]")).toBeNull();
  });
});
