/** Pointer arithmetic in bigint so x64 addresses are never truncated by doubles. */

export function toPtr(v: number | bigint | string): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'string') return BigInt(v)
  return BigInt(Math.trunc(v))
}

/** True when addr ∈ [base, base+size). End-exclusive. */
export function ptrInRange(addr: bigint, base: bigint, size: bigint): boolean {
  return addr >= base && addr < base + size
}

/** Render an address as uppercase hex (e.g. "0x1400ABCDE"). */
export function formatPtr(addr: bigint): string {
  return '0x' + addr.toString(16).toUpperCase()
}
