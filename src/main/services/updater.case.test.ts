import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => '3.2.0', isPackaged: true } }))

import { pickAsset } from './updater'

const sha = 'a'.repeat(64)

describe('pickAsset', () => {
  it('accepts the release URL whatever the letter case of the repository name', () => {
    const asset = { name: 'custos-x64.exe', url: 'https://github.com/DybekY/Custos/releases/download/3.3.0/custos-x64.exe', size: 1000, sha256: sha }
    expect(pickAsset([asset], 'x64')).toEqual(asset)
  })

  it('still rejects another repository or host', () => {
    const base = { name: 'custos-x64.exe', size: 1000, sha256: sha }
    expect(pickAsset([{ ...base, url: 'https://github.com/evil/custos/releases/download/3.3.0/custos-x64.exe' }], 'x64')).toBeNull()
    expect(pickAsset([{ ...base, url: 'https://github.com.evil.dev/dybeky/custos/releases/download/3.3.0/custos-x64.exe' }], 'x64')).toBeNull()
  })
})
