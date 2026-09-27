/**
 * Map `items` through async `fn` with at most `limit` calls in flight,
 * preserving input order in the result. A non-positive limit runs serially.
 */
export async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(limit) || 1), items.length) }, worker))
  return results
}
