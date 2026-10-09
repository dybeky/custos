import { describe, it, expect } from 'vitest'
import { dedupeDetections, defenderRelevance, parseDefenderEvents, parseDefenderPaths, unescapeXml } from './defender-history'

const ev = (id: number, threat: string, path: string, time: string, action = 'Quarantine') =>
  `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><EventID>${id}</EventID>` +
  `<TimeCreated SystemTime='${time}'/></System><EventData>` +
  `<Data Name='Product Name'>Microsoft Defender Antivirus</Data>` +
  `<Data Name='Detection Time'>${time}</Data>` +
  `<Data Name='Threat Name'>${threat}</Data>` +
  `<Data Name='Path'>${path}</Data>` +
  `<Data Name='Action Name'>${action}</Data></EventData></Event>`

const containsKeyword = (s: string) => /undead|fecurity|melony/i.test(s)

describe('Defender history', () => {
  it('strips path prefixes and splits multiple paths', () => {
    expect(parseDefenderPaths('file:_C:\\a\\x.exe;containerfile:_C:\\a\\y.zip')).toEqual(['C:\\a\\x.exe', 'C:\\a\\y.zip'])
    expect(parseDefenderPaths(null)).toEqual([])
  })

  it('parses detection events', () => {
    const out = parseDefenderEvents(ev(1116, 'HackTool:Win64/GameHack.B', 'file:_C:\\Users\\p\\Downloads\\loader.exe', '2026-09-27T10:30:00.000Z'))
    expect(out).toEqual([{
      threatName: 'HackTool:Win64/GameHack.B', paths: ['C:\\Users\\p\\Downloads\\loader.exe'],
      detectedAt: Date.parse('2026-09-27T10:30:00.000Z'), action: 'Quarantine'
    }])
    expect(parseDefenderEvents('')).toEqual([])
  })

  it('trusts cheat families on their own', () => {
    const [d] = parseDefenderEvents(ev(1116, 'HackTool:Win32/GameHack!MSR', 'file:_C:\\x\\setup.exe', '2026-09-27T10:30:00Z'))
    expect(defenderRelevance(d, containsKeyword)).toBe('cheat-family')
    const [ce] = parseDefenderEvents(ev(1116, 'PUA:Win32/CheatEngine', 'file:_C:\\x\\ce.exe', '2026-09-27T10:30:00Z'))
    expect(defenderRelevance(ce, containsKeyword)).toBe('cheat-family')
  })

  it('ignores Windows activators, keygens and unrelated threats', () => {
    for (const threat of ['HackTool:Win32/AutoKMS', 'HackTool:Win64/KMSpico', 'HackTool:Win32/Keygen', 'PUA:Win32/uTorrent', 'Trojan:Win32/Wacatac.B!ml']) {
      const [d] = parseDefenderEvents(ev(1116, threat, 'file:_C:\\x\\tool.exe', '2026-09-27T10:30:00Z'))
      expect(defenderRelevance(d, containsKeyword), threat).toBeNull()
    }
  })

  it('keeps any threat whose file is named like a known cheat', () => {
    const [d] = parseDefenderEvents(ev(1116, 'Trojan:Win32/Wacatac.B!ml', 'file:_C:\\x\\Fecurity64.exe', '2026-09-27T10:30:00Z'))
    expect(defenderRelevance(d, containsKeyword)).toBe('keyword')
    const [kms] = parseDefenderEvents(ev(1116, 'HackTool:Win32/AutoKMS', 'file:_C:\\x\\undead_kms.exe', '2026-09-27T10:30:00Z'))
    expect(defenderRelevance(kms, containsKeyword)).toBe('keyword')
  })

  it('merges the detected/actioned event pair for one file', () => {
    const xml =
      ev(1117, 'HackTool:Win64/GameHack.B', 'file:_C:\\x\\a.exe', '2026-09-27T10:31:00Z', 'Remove') +
      ev(1116, 'HackTool:Win64/GameHack.B', 'file:_C:\\x\\a.exe', '2026-09-27T10:30:00Z', 'Not Applicable')
    const out = dedupeDetections(parseDefenderEvents(xml))
    expect(out).toHaveLength(1)
    expect(out[0].action).toBe('Remove')
    expect(out[0].detectedAt).toBe(Date.parse('2026-09-27T10:31:00Z'))
  })
})

describe('Defender XML text', () => {
  it('unescapes paths and names', () => {
    const xml = "<Event><Data Name='Threat Name'>HackTool:Win32/GameHack</Data><Data Name='Path'>file:_C:\\Games &amp; Mods\\it&apos;s\\aim.exe</Data><Data Name='Detection Time'>2026-09-01T10:00:00.000Z</Data></Event>"
    expect(parseDefenderEvents(xml)[0].paths).toEqual(["C:\\Games & Mods\\it's\\aim.exe"])
    expect(unescapeXml('&lt;a&gt; &#x41;&#66; &bogus;')).toBe('<a> AB &bogus;')
  })
})
