import { withRetry } from './retry';

function errorWithStatus(status: number | undefined) {
  return Object.assign(new Error(`status ${status}`), { status });
}

describe('withRetry', () => {
  it('returns the result immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a connection error (no status) and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(errorWithStatus(undefined))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 and 5xx', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(errorWithStatus(429))
      .mockRejectedValueOnce(errorWithStatus(503))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on a 4xx error other than 429', async () => {
    const fn = jest.fn().mockRejectedValue(errorWithStatus(401));

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('status 401');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error once maxAttempts is exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(errorWithStatus(500));

    await expect(withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 })).rejects.toThrow('status 500');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
