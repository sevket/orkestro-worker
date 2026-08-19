/**
 * Extraction of planner output into structured subtasks.
 *
 * LLM output is non-deterministic, so three fallbacks are attempted in order:
 *   1. the explicit [JSON_TASKS_START] ... [JSON_TASKS_END] envelope,
 *   2. a fenced ```json block,
 *   3. a bare JSON array literal.
 */

export type PlannerTask = {
  title: string;
  description?: string;
  role?: string;
  task_type?: string;
};

export function extractPlannerTasks(fullOutputBuffer: string): PlannerTask[] | null {
  let jsonStr = "";

  const customMatch = fullOutputBuffer.match(/\[JSON_TASKS_START\]([\s\S]*?)\[JSON_TASKS_END\]/);
  if (customMatch && customMatch[1]) {
    jsonStr = customMatch[1].trim();
  } else {
    const mdMatch = fullOutputBuffer.match(/```json\s*([\s\S]*?)\s*```/);
    if (mdMatch && mdMatch[1]) {
      jsonStr = mdMatch[1].trim();
    } else {
      const arrayMatch = fullOutputBuffer.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch && arrayMatch[0]) {
        jsonStr = arrayMatch[0].trim();
      }
    }
  }

  if (!jsonStr) return null;

  try {
    const tasksArray = JSON.parse(jsonStr);
    if (Array.isArray(tasksArray) && tasksArray.length > 0) {
      return tasksArray as PlannerTask[];
    }
  } catch (e: any) {
    console.error("[Worker] Failed to parse Planner JSON block!", e.message);
  }
  return null;
}
