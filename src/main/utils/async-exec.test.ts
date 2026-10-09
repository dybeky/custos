import { describe, it, expect } from 'vitest'
import { decodeOutput, oemDecoderFor } from './async-exec'

describe('decodeOutput', () => {
  it('keeps UTF-8 and ASCII output as is', async () => {
    expect(await decodeOutput(Buffer.from('C:\\Users\\Иван\\aimbot.exe', 'utf8'), oemDecoderFor('866'))).toBe('C:\\Users\\Иван\\aimbot.exe')
    expect(await decodeOutput(Buffer.from('HKEY_LOCAL_MACHINE\\SOFTWARE'), oemDecoderFor('866'))).toBe('HKEY_LOCAL_MACHINE\\SOFTWARE')
    expect(await decodeOutput(Buffer.alloc(0))).toBe('')
  })

  it("reads a Russian console's CP866 output instead of garbling it", async () => {
    // "C:\Users\Иван" as reg.exe writes it on Russian Windows.
    const cp866 = Buffer.concat([Buffer.from('C:\\Users\\'), Buffer.from([0x88, 0xa2, 0xa0, 0xad])])
    expect(await decodeOutput(cp866, oemDecoderFor('866'))).toBe('C:\\Users\\Иван')
  })

  it("reads a German console's CP850 output (umlauts)", async () => {
    // "C:\Users\Jürgen\Größe" as fsutil writes it on German Windows.
    const cp850 = Buffer.from([...Buffer.from('C:\\Users\\J'), 0x81, ...Buffer.from('rgen\\Gr'), 0x94, 0xe1, 0x65])
    expect(await decodeOutput(cp850, oemDecoderFor('850'))).toBe('C:\\Users\\Jürgen\\Größe')
    expect(oemDecoderFor('852').decode(Uint8Array.from([0x88, 0x9d]))).toBe('łŁ')
    expect(oemDecoderFor('437').decode(Uint8Array.from([0x9c, 0xe1]))).toBe('£ß')
  })

  it('falls back to latin1 for unknown code pages', () => {
    expect((oemDecoderFor('999') as TextDecoder).encoding).toBe('windows-1252')
  })
})
