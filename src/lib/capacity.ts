/**
 * Hardware-aware concurrency budget for a worker node.
 *
 * Each locally spawned agent CLI is assumed to need ~1.5 GB of RAM; exceeding
 * that budget makes the V8 processes OOM instead of merely running slowly.
 */

export const RAM_GB_PER_AGENT = 1.5;

export type CapacityInput = {
  requested: number;
  cpus: number;
  freeMemGB: number;
  ignoreHardwareLimits?: boolean;
};

export function computeAssignedCapacity({
  requested,
  cpus,
  freeMemGB,
  ignoreHardwareLimits = false,
}: CapacityInput): number {
  if (ignoreHardwareLimits) return requested;

  const cpuLimit = Math.max(1, cpus - 1);
  const memLimit = Math.max(1, Math.floor(freeMemGB / RAM_GB_PER_AGENT));
  return Math.min(requested, Math.min(cpuLimit, memLimit));
}
