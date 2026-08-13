/**
 * True for a MongoDB duplicate-key error (E11000), thrown when a write
 * violates a unique index. Useful for turning a race on a check-then-insert
 * pattern (not atomic on its own) into the same clean error the initial
 * check would have produced if it had won the race.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}
