export interface RetryPolicy {
  /** Total deliveries including the first one. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export type FailureDecision =
  | { action: 'retry'; delayMs: number; nextAttempt: number }
  | { action: 'give-up' };

/** Exponential backoff: base, 2×base, 4×base, ... capped at maxDelayMs. */
export function backoffDelay(attempt: number, policy: RetryPolicy): number {
  const delay = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}

/** What to do after delivery number `attempt` (1-based) failed. */
export function decideOnFailure(attempt: number, policy: RetryPolicy): FailureDecision {
  if (attempt >= policy.maxAttempts) {
    return { action: 'give-up' };
  }
  return {
    action: 'retry',
    delayMs: backoffDelay(attempt, policy),
    nextAttempt: attempt + 1,
  };
}
