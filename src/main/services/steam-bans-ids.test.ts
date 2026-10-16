import { describe, it, expect } from 'vitest'
import { SteamIdsSchema } from './steam-bans-service'

describe('SteamIdsSchema', () => {
  it('accepts a PC with more Steam accounts than the site answers for', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `7656119${String(8000010000 + i)}`)
    expect(SteamIdsSchema.safeParse(ids).success).toBe(true)
  })

  it('rejects anything that is not a list of 17-digit ids', () => {
    expect(SteamIdsSchema.safeParse(['abc']).success).toBe(false)
    expect(SteamIdsSchema.safeParse('76561198000000000').success).toBe(false)
    expect(SteamIdsSchema.safeParse(Array(201).fill('76561198000000000')).success).toBe(false)
  })
})
