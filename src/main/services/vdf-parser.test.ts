import { describe, it, expect } from 'vitest'
import { VdfParser } from './vdf-parser'

describe('VdfParser', () => {
  const parser = new VdfParser()

  describe('parseSteamAccounts', () => {
    it('should parse valid loginusers.vdf content', () => {
      const vdfContent = `
"users"
{
  "76561198012345678"
  {
    "AccountName"   "testuser"
    "PersonaName"   "Test User"
    "RememberPassword"  "1"
    "Timestamp"   "1609459200"
  }
}
`
      const accounts = parser.parseSteamAccounts(vdfContent)

      expect(accounts).toHaveLength(1)
      expect(accounts[0].steamId).toBe('76561198012345678')
      expect(accounts[0].accountName).toBe('testuser')
      expect(accounts[0].personaName).toBe('Test User')
      expect(accounts[0].rememberPassword).toBe(true)
      expect(accounts[0].timestamp).toBe(1609459200)
    })

    it('should parse multiple accounts', () => {
      const vdfContent = `
"users"
{
  "76561198012345678"
  {
    "AccountName"   "user1"
    "PersonaName"   "User One"
    "RememberPassword"  "1"
  }
  "76561198087654321"
  {
    "AccountName"   "user2"
    "PersonaName"   "User Two"
    "RememberPassword"  "0"
  }
}
`
      const accounts = parser.parseSteamAccounts(vdfContent)

      expect(accounts).toHaveLength(2)
      expect(accounts[0].accountName).toBe('user1')
      expect(accounts[1].accountName).toBe('user2')
      expect(accounts[1].rememberPassword).toBe(false)
    })

    it('should handle empty content', () => {
      const accounts = parser.parseSteamAccounts('')
      expect(accounts).toHaveLength(0)
    })

    it('should handle content without users section', () => {
      const vdfContent = `
"config"
{
  "setting"   "value"
}
`
      const accounts = parser.parseSteamAccounts(vdfContent)
      expect(accounts).toHaveLength(0)
    })

    it('should skip invalid Steam IDs', () => {
      const vdfContent = `
"users"
{
  "invalid_id"
  {
    "AccountName"   "testuser"
  }
  "76561198012345678"
  {
    "AccountName"   "validuser"
  }
}
`
      const accounts = parser.parseSteamAccounts(vdfContent)

      expect(accounts).toHaveLength(1)
      expect(accounts[0].accountName).toBe('validuser')
    })
  })

  describe('validateAccount', () => {
    it('should validate correct account', () => {
      const result = VdfParser.validateAccount({
        steamId: '76561198012345678',
        accountName: 'testuser',
        rememberPassword: true
      })

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid Steam ID', () => {
      const result = VdfParser.validateAccount({
        steamId: '12345',
        accountName: 'testuser',
        rememberPassword: true
      })

      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.includes('SteamID'))).toBe(true)
    })

    it('should reject empty account name', () => {
      const result = VdfParser.validateAccount({
        steamId: '76561198012345678',
        accountName: '',
        rememberPassword: true
      })

      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.includes('AccountName'))).toBe(true)
    })
  })

  describe('parseGenericVdf', () => {
    it('should parse generic VDF structure', () => {
      const vdfContent = `
"root"
{
  "key1"   "value1"
  "key2"   "value2"
  "nested"
  {
    "innerKey"   "innerValue"
  }
}
`
      const result = parser.parseGenericVdf(vdfContent)

      expect(result.root).toBeDefined()
      const root = result.root as Record<string, unknown>
      expect(root.key1).toBe('value1')
      expect(root.key2).toBe('value2')
      expect((root.nested as Record<string, unknown>).innerKey).toBe('innerValue')
    })
  })
})
