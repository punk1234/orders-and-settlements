/**
 * Small retry-with-backoff helper for third-party API calls. Retries on
 * transient failures only: network/connection errors (no HTTP status) and
 * 429/5xx responses. Does NOT retry on 4xx errors like bad auth or a
 * malformed request — retrying those just wastes time and money since the
 * next attempt will fail the same way.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Unreachable — the loop always either returns or throws — but keeps TS happy.
  throw lastErr;
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  if (status === undefined) return true; // connection/network error, no HTTP status at all
  return status === 429 || status >= 500;
}
