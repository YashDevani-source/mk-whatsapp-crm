// WA-11: the delay before reconnect attempt `attempt` (0-based): min(base × 2ⁿ, max) with ±20 %
// jitter, so several workers or a flapping network do not retry in lockstep.
export function reconnectDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  const delay = Math.min(baseMs * 2 ** attempt, maxMs);
  return Math.round(delay * (0.8 + 0.4 * random()));
}
