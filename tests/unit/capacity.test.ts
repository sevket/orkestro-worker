import { describe, test, expect } from "vitest";
import { computeAssignedCapacity } from "../../src/lib/capacity.js";

describe("computeAssignedCapacity", () => {
  test("grants the requested capacity when the hardware allows it", () => {
    expect(computeAssignedCapacity({ requested: 4, cpus: 16, freeMemGB: 32 })).toBe(4);
  });

  test("caps on available RAM", () => {
    expect(computeAssignedCapacity({ requested: 8, cpus: 16, freeMemGB: 3 })).toBe(2);
  });

  test("caps on CPU count, leaving one core for the host", () => {
    expect(computeAssignedCapacity({ requested: 8, cpus: 4, freeMemGB: 64 })).toBe(3);
  });

  test("never drops below a single slot", () => {
    expect(computeAssignedCapacity({ requested: 4, cpus: 1, freeMemGB: 0.2 })).toBe(1);
  });

  test("honours the explicit hardware-limit override", () => {
    expect(
      computeAssignedCapacity({ requested: 12, cpus: 2, freeMemGB: 1, ignoreHardwareLimits: true }),
    ).toBe(12);
  });
});
