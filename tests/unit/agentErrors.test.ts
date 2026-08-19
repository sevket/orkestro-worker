import { describe, test, expect } from "vitest";
import { describeAgentFailure, findJsonObject } from "../../src/lib/agentErrors.js";

describe("describeAgentFailure", () => {
  test("surfaces the message from a structured API error", () => {
    const buffer = 'API Error {"error":"overloaded","message":{"content":[{"text":"Model is overloaded"}]}}';

    expect(describeAgentFailure(buffer, 1)).toContain("Model is overloaded");
  });

  test("falls back to the error field when there is no message content", () => {
    const buffer = 'API Error {"error":"invalid_api_key"}';

    expect(describeAgentFailure(buffer, 2)).toContain("invalid_api_key");
  });

  test("detects an exhausted credit balance", () => {
    expect(describeAgentFailure("Credit balance is too low", 1)).toMatch(/Kredi bakiyesi/);
  });

  test("detects rate limiting", () => {
    expect(describeAgentFailure("stream error: rate_limit exceeded", 1)).toMatch(/Rate-Limit/);
  });

  test("falls back to a generic crash message", () => {
    expect(describeAgentFailure("segfault", 139)).toMatch(/Exit 139/);
  });

  test("treats a null exit code as exit 1", () => {
    expect(describeAgentFailure("boom", null)).toContain("Exit 1");
  });

  test("handles a nested error payload", () => {
    const buffer = 'API Error {"error":{"type":"overloaded_error","message":"Overloaded"}}';

    expect(describeAgentFailure(buffer, 1)).toContain("Overloaded");
  });

  test("falls back to generic text when the payload is malformed", () => {
    expect(describeAgentFailure("API Error {broken", 1)).toMatch(/beklenmedik/);
  });
});

describe("findJsonObject", () => {
  test("returns the first balanced object", () => {
    expect(findJsonObject('noise {"a":{"b":1}} tail')).toBe('{"a":{"b":1}}');
  });

  test("ignores braces inside strings", () => {
    expect(findJsonObject('{"a":"}{"}')).toBe('{"a":"}{"}');
  });

  test("ignores escaped quotes", () => {
    expect(findJsonObject('{"a":"say \\"hi\\""}')).toBe('{"a":"say \\"hi\\""}');
  });

  test("returns null when there is no object", () => {
    expect(findJsonObject("no json here")).toBeNull();
  });

  test("returns null for an unterminated object", () => {
    expect(findJsonObject('{"a":1')).toBeNull();
  });
});
