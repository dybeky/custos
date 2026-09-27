/**
 * Pure parsing for USB mass-storage history.
 *
 * Sources (all written by Windows itself):
 *  - Registry Enum\USBSTOR: every storage device ever attached (name + serial);
 *  - C:\Windows\INF\setupapi.dev.log: when each device was FIRST installed;
 *  - Partition/Diagnostic event 1006: each time a device was connected.
 */

export interface UsbDevice {
  /** Serial as Windows records it, lower-cased, without the trailing "&0". */
  serial: string
  name: string
}

/** Normalize a USBSTOR instance id / serial for matching across sources. */
export function normalizeSerial(raw: string): string {
  return raw.trim().toLowerCase().replace(/&\d+$/, '')
}

/** `reg query HKLM\SYSTEM\CurrentControlSet\Enum\USBSTOR /s /v FriendlyName` → devices. */
export function parseUsbstorRegistry(output: string): UsbDevice[] {
  const out: UsbDevice[] = []
  let serial: string | null = null
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    const key = /\\USBSTOR\\[^\\]+\\([^\\]+)$/i.exec(line)
    if (/^HKEY_/i.test(line)) {
      serial = key ? normalizeSerial(key[1]) : null
      continue
    }
    const v = /^FriendlyName\s+REG_SZ\s+(.+)$/i.exec(line)
    if (v && serial) out.push({ serial, name: v[1].trim() })
  }
  return out
}

/**
 * setupapi.dev.log → serial → first-install time (local clock, epoch ms).
 * Matches both `USBSTOR\Disk&…\<serial>` and `…USBSTOR#Disk&…#<serial>#{…}`.
 */
export function parseSetupapiUsb(log: string): Map<string, number> {
  const out = new Map<string, number>()
  const lines = log.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const dev = /Device Install[^\]]*USBSTOR[\\#][^\\#\]]+[\\#]([^\\#\]]+)/i.exec(lines[i])
    if (!dev) continue
    // The section's start time is on one of the next few lines.
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const ts = /Section start (\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(lines[j])
      if (!ts) continue
      const [, y, mo, d, h, mi, s] = ts.map(Number)
      const at = new Date(y, mo - 1, d, h, mi, s).getTime()
      const serial = normalizeSerial(dev[1])
      if (!out.has(serial) || at < out.get(serial)!) out.set(serial, at)
      break
    }
  }
  return out
}

/** Partition/Diagnostic 1006 XML → serial → latest connection (epoch ms). */
export function parsePartitionEvents(xml: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const ev of xml.split(/<\/Event>/i)) {
    const serial = /<Data Name=['"]SerialNumber['"]>([^<]+)<\/Data>/i.exec(ev)?.[1]
    const when = /<TimeCreated\s+SystemTime=['"]([^'"]+)['"]/i.exec(ev)?.[1]
    if (!serial || !when) continue
    const at = Date.parse(when)
    if (Number.isNaN(at)) continue
    const key = normalizeSerial(serial)
    if (at > (out.get(key) ?? 0)) out.set(key, at)
  }
  return out
}

/** Find a time for `serial` in a map whose keys may be longer/shorter variants. */
export function lookupBySerial(map: Map<string, number>, serial: string): number | undefined {
  const direct = map.get(serial)
  if (direct !== undefined) return direct
  for (const [k, v] of map) if (k.startsWith(serial) || serial.startsWith(k)) return v
  return undefined
}

/** Windows' own PnP cleanup only removes devices unseen for 30 days. */
export const PNP_CLEANUP_DAYS = 30

/**
 * Devices installed within the last 30 days (per setupapi.dev.log) that are
 * gone from Enum\USBSTOR. Windows would not have cleaned them up yet, so
 * something deleted them (e.g. USB Oblivion). Needs a readable registry
 * listing; pass null when the registry query failed.
 */
export function assessUsbWipe(setupapi: Map<string, number>, registry: UsbDevice[] | null, nowMs: number): string[] {
  if (registry === null) return []
  const known = registry.map((d) => d.serial)
  const window = PNP_CLEANUP_DAYS * 24 * 60 * 60 * 1000
  const missing = [...setupapi.entries()].filter(
    ([serial, at]) => nowMs - at <= window && at <= nowMs && !known.some((k) => k.startsWith(serial) || serial.startsWith(k))
  )
  if (missing.length === 0) return []
  return [
    `[Trace cleaning] USB device history was removed from the registry: ${missing.length} storage device(s) ` +
      `installed in the last ${PNP_CLEANUP_DAYS} days (per setupapi.dev.log) are missing from Enum\\USBSTOR`
  ]
}
