/** Pure economy helpers shared across services. */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Increment a capped resource (e.g. shields), never exceeding `cap`. */
export function clampInc(current: number, delta: number, cap: number): number {
  return clamp(current + delta, 0, cap);
}

/**
 * Spins regenerate over time up to a cap (§5.2). Pure: given the stored amount,
 * the timestamp it was last reconciled, and "now", returns the new amount and
 * the timestamp to store. Regen stops at the cap (above-cap balances from IAP
 * are preserved and simply don't tick up).
 */
export function regenSpins(
  current: number,
  updatedAt: number,
  now: number,
  regenPerHour: number,
  cap: number,
): { spins: number; spinsUpdatedAt: number } {
  if (current >= cap) {
    // Already at/over cap — hold steady, advance the clock so no regen is owed.
    return { spins: current, spinsUpdatedAt: now };
  }
  const msPerSpin = 3_600_000 / regenPerHour;
  const elapsed = Math.max(0, now - updatedAt);
  const regened = Math.floor(elapsed / msPerSpin);
  if (regened <= 0) {
    return { spins: current, spinsUpdatedAt: updatedAt };
  }
  const next = Math.min(cap, current + regened);
  // Carry forward the unused remainder of time so fractional spins aren't lost.
  const consumedMs = regened * msPerSpin;
  return { spins: next, spinsUpdatedAt: updatedAt + consumedMs };
}
