import { describe, it, expect } from 'vitest'
import { harddiskVolumeMap } from './dos-devices'

describe('harddiskVolumeMap', () => {
  it('maps HarddiskVolume numbers to drive letters and skips other devices', () => {
    const devices: Record<string, string> = {
      'C:': '\\Device\\HarddiskVolume3',
      'D:': '\\Device\\HarddiskVolume5',
      'E:': '\\Device\\CdRom0',
      'Z:': '\\Device\\LanmanRedirector\\;Z:0000\\server\\share'
    }
    const map = harddiskVolumeMap((d) => devices[d] ?? null)
    expect([...map]).toEqual([[3, 'C:'], [5, 'D:']])
  })
})
