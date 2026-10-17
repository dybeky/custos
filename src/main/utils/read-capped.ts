import { open } from 'fs/promises'

/**
 * Read at most `maxBytes` of a file the checked PC controls. A scanner that
 * calls readFile on a hostile, multi-gigabyte "config" would otherwise run the
 * whole app out of memory. `from` picks which end survives when the file is
 * larger than the cap: the head (config files) or the tail (logs, where the
 * recent entries are at the end).
 */
export async function readCapped(path: string, maxBytes: number, from: 'head' | 'tail' = 'head'): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, maxBytes)
    if (length <= 0) return Buffer.alloc(0)
    const buffer = Buffer.alloc(length)
    const position = from === 'tail' ? size - length : 0
    let filled = 0
    while (filled < length) {
      const { bytesRead } = await handle.read(buffer, filled, length - filled, position + filled)
      if (bytesRead === 0) break
      filled += bytesRead
    }
    return filled === length ? buffer : buffer.subarray(0, filled)
  } finally {
    await handle.close()
  }
}

/** readCapped decoded as UTF-8 (a stray byte cut by the cap becomes U+FFFD). */
export async function readTextCapped(path: string, maxBytes: number, from: 'head' | 'tail' = 'head'): Promise<string> {
  return (await readCapped(path, maxBytes, from)).toString('utf8')
}
