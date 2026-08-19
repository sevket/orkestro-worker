import { describe, test, expect } from "vitest";
import { Readable } from "node:stream";
import { JsonLogSimplifier } from "../../src/runner.js";

/** Pipes the given chunks through the transform and returns everything emitted. */
async function pipeThrough(chunks: string[]): Promise<string> {
  const simplifier = new JsonLogSimplifier();
  const source = Readable.from(chunks);
  let out = "";
  simplifier.on("data", (c: Buffer) => {
    out += c.toString();
  });
  source.pipe(simplifier);
  await new Promise((resolve) => simplifier.on("end", resolve));
  return out;
}

describe("JsonLogSimplifier", () => {
  test("passes plain terminal output through untouched", async () => {
    expect(await pipeThrough(["npm install\n", "done\n"])).toBe("npm install\ndone\n");
  });

  test("renders a tool use block and its matching result", async () => {
    const lines = [
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_start", content_block: { type: "tool_use", id: "t1", name: "Edit" } },
      }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "1 file changed" }] },
      }),
    ].join("\n") + "\n";

    const out = await pipeThrough([lines]);

    expect(out).toContain('Tool: "Edit"');
    expect(out).toContain('Result: "Edit"');
    expect(out).toContain("1 file changed");
  });

  test("streams assistant text deltas", async () => {
    const lines = [
      JSON.stringify({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } } }),
    ].join("\n") + "\n";

    const out = await pipeThrough([lines]);

    expect(out).toContain("Assistant");
    expect(out).toContain("Hello");
  });

  test("truncates a very long tool result", async () => {
    const line = JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "x", content: "y".repeat(900) }] },
    }) + "\n";

    const out = await pipeThrough([line]);

    expect(out).toContain("...");
    expect(out.length).toBeLessThan(900);
  });

  test("suppresses noisy system events", async () => {
    const lines = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "rate_limit_event" }),
      JSON.stringify({ type: "result", result: "ok" }),
    ].join("\n") + "\n";

    expect(await pipeThrough([lines])).toBe("");
  });

  test("renders API errors so they reach the Kanban card", async () => {
    const line = JSON.stringify({ type: "error", error: "overloaded" }) + "\n";

    expect(await pipeThrough([line])).toContain("API Error");
  });

  test("reassembles a json object split across two chunks", async () => {
    const payload = JSON.stringify({ type: "step", name: "Build" }) + "\n";
    const mid = Math.floor(payload.length / 2);

    const out = await pipeThrough([payload.slice(0, mid), payload.slice(mid)]);

    expect(out).toContain("Step: Build");
  });

  test("flushes a trailing partial line at end of stream", async () => {
    expect(await pipeThrough(["no trailing newline"])).toBe("no trailing newline\n");
  });

  test("renders tool input as it streams in", async () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: '{"path":' } },
    }) + "\n";

    expect(await pipeThrough([line])).toContain('{"path":');
  });

  test("renders user text turns", async () => {
    const line = JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "retry please" }] } }) + "\n";

    const out = await pipeThrough([line]);
    expect(out).toContain("User");
    expect(out).toContain("retry please");
  });

  test("labels an unknown event type instead of dropping it", async () => {
    const line = JSON.stringify({ type: "mystery_event" }) + "\n";

    expect(await pipeThrough([line])).toContain("Event: mystery_event");
  });

  test("renders tool_use_result file actions", async () => {
    const line = JSON.stringify({ tool_use_result: { type: "write", filePath: "/srv/a.ts" } }) + "\n";

    const out = await pipeThrough([line]);
    expect(out).toContain("Action: write");
    expect(out).toContain("/srv/a.ts");
  });

  test("passes through a line that looks like json but is not", async () => {
    expect(await pipeThrough(["{not really json}\n"])).toBe("{not really json}\n");
  });

  test("keeps blank lines out of the transformed output", async () => {
    expect(await pipeThrough(["\n\n"])).toBe("");
  });

  test("labels a step with no name", async () => {
    const line = JSON.stringify({ type: "step" }) + "\n";
    expect(await pipeThrough([line])).toContain("Unknown Step");
  });

  test("names an unmatched tool result Unknown Tool", async () => {
    const line = JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "missing", content: { ok: true } }] },
    }) + "\n";

    expect(await pipeThrough([line])).toContain("Unknown Tool");
  });
});
