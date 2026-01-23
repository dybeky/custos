export interface SteamAccount {
  steamId: string
  accountName: string
  personaName?: string
  rememberPassword: boolean
  timestamp?: number
}

export class VdfParseException extends Error {
  lineNumber: number

  constructor(message: string, lineNumber: number) {
    super(message)
    this.name = 'VdfParseException'
    this.lineNumber = lineNumber
  }
}

export class VdfParser {
  /**
   * Parses Steam loginusers.vdf file and extracts account information
   */
  parseSteamAccounts(vdfContent: string): SteamAccount[] {
    const accounts: SteamAccount[] = []
    const lines = vdfContent.split('\n')
    let currentAccount: SteamAccount | null = null
    let lineNumber = 0
    let inUsersSection = false

    try {
      for (let rawLine of lines) {
        lineNumber++
        let line = rawLine.trim()

        // Skip empty lines and comments
        if (!line || line.startsWith('//')) {
          continue
        }

        // Remove UTF-8 BOM if present
        if (lineNumber === 1 && line.charCodeAt(0) === 0xfeff) {
          line = line.substring(1).trim()
        }

        // Check for "users" section
        if (line.toLowerCase().includes('"users"')) {
          inUsersSection = true
          continue
        }

        // Skip lines before users section
        if (!inUsersSection) {
          continue
        }

        // Try to parse as a Steam ID (starts with "7656" and is quoted)
        if (line.startsWith('"7656')) {
          const steamId = this.extractQuotedValue(line, lineNumber)
          if (this.validateSteamId(steamId)) {
            // Save previous account if exists
            if (currentAccount && currentAccount.accountName) {
              accounts.push(currentAccount)
            }

            currentAccount = {
              steamId,
              accountName: '',
              rememberPassword: false
            }
          }
        } else if (currentAccount) {
          // Parse key-value pairs within account
          if (line.toLowerCase().includes('"accountname"')) {
            currentAccount.accountName = this.extractKeyValue(line, lineNumber)
          } else if (line.toLowerCase().includes('"personaname"')) {
            currentAccount.personaName = this.extractKeyValue(line, lineNumber)
          } else if (line.toLowerCase().includes('"rememberpassword"')) {
            const value = this.extractKeyValue(line, lineNumber)
            currentAccount.rememberPassword = value === '1'
          } else if (line.toLowerCase().includes('"timestamp"')) {
            const value = this.extractKeyValue(line, lineNumber)
            const timestamp = parseInt(value, 10)
            if (!isNaN(timestamp)) {
              currentAccount.timestamp = timestamp
            }
          } else if (line === '}') {
            // End of account object
            if (currentAccount && currentAccount.accountName) {
              accounts.push(currentAccount)
            }
            currentAccount = null
          }
        }
      }

      // Add last account if not already added
      if (currentAccount && currentAccount.accountName) {
        accounts.push(currentAccount)
      }

      return accounts
    } catch (error) {
      throw new VdfParseException(
        `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lineNumber
      )
    }
  }

  /**
   * Extracts a quoted value from a line (for Steam ID)
   */
  private extractQuotedValue(line: string, lineNumber: number): string {
    const match = line.match(/"([^"]+)"/)
    if (match) {
      return match[1]
    }
    throw new VdfParseException(`Failed to extract quoted value from: ${line}`, lineNumber)
  }

  /**
   * Extracts value from a key-value pair
   */
  private extractKeyValue(line: string, _lineNumber: number): string {
    const matches = line.match(/"([^"]+)"/g)
    if (matches && matches.length >= 2) {
      // Remove quotes from the second match (value)
      return matches[1].replace(/"/g, '')
    }

    // Try alternative format: "key"\t\t"value"
    const parts = line.split('"').filter(p => p.trim())
    if (parts.length >= 2) {
      return parts[1]
    }

    return ''
  }

  /**
   * Validates Steam ID format (should start with 7656 and be 17 digits)
   */
  private validateSteamId(steamId: string): boolean {
    if (!steamId) return false

    // Steam ID 64 format: starts with 7656 and is exactly 17 digits
    if (!steamId.startsWith('7656')) return false
    if (steamId.length !== 17) return false

    return /^\d+$/.test(steamId)
  }

  /**
   * Validates Steam account has required fields
   */
  static validateAccount(account: SteamAccount): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate SteamID
    if (!account.steamId) {
      errors.push('SteamID is empty')
    } else if (!account.steamId.startsWith('7656') || account.steamId.length !== 17) {
      errors.push(`Invalid SteamID format: ${account.steamId}`)
    } else if (!/^\d+$/.test(account.steamId)) {
      errors.push(`SteamID contains non-digit characters: ${account.steamId}`)
    }

    // Validate AccountName
    if (!account.accountName) {
      errors.push('AccountName is empty')
    } else if (account.accountName.length > 64) {
      errors.push(`AccountName too long: ${account.accountName.length} characters`)
    } else if (!/^[a-zA-Z0-9_\-.]+$/.test(account.accountName)) {
      errors.push(`AccountName contains invalid characters: ${account.accountName}`)
    }

    // Validate PersonaName (optional but check if present)
    if (account.personaName && account.personaName.length > 128) {
      errors.push(`PersonaName too long: ${account.personaName.length} characters`)
    }

    return { isValid: errors.length === 0, errors }
  }

  /**
   * Parses VDF content into a generic dictionary structure
   */
  parseGenericVdf(vdfContent: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const stack: Record<string, unknown>[] = [result]

    const lines = vdfContent.split('\n')

    for (const rawLine of lines) {
      const line = rawLine.trim()

      if (!line || line.startsWith('//')) {
        continue
      }

      if (line === '{') {
        continue
      } else if (line === '}') {
        if (stack.length > 1) {
          stack.pop()
        }
        continue
      }

      // Parse key-value pair
      const matches = line.match(/"([^"]+)"/g)
      if (matches && matches.length === 2) {
        const key = matches[0].replace(/"/g, '')
        const value = matches[1].replace(/"/g, '')
        const current = stack[stack.length - 1]
        current[key] = value
      } else if (matches && matches.length === 1) {
        // Just a key, expecting an object
        const key = matches[0].replace(/"/g, '')
        const newDict: Record<string, unknown> = {}
        const current = stack[stack.length - 1]
        current[key] = newDict
        stack.push(newDict)
      }
    }

    return result
  }
}
