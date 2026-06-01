import { describe, it, expect } from 'vitest'
import { KeywordMatcher } from './keyword-matcher'

describe('KeywordMatcher', () => {
  describe('containsKeyword', () => {
    it('should match exact patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat', 'hack', 'aimbot'],
        exactMatch: []
      })

      expect(matcher.containsKeyword('this contains cheat word')).toBe(true)
      expect(matcher.containsKeyword('hack tool')).toBe(true)
      expect(matcher.containsKeyword('aimbot.exe')).toBe(true)
    })

    it('should not match partial words', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat'],
        exactMatch: []
      })

      // Should not match 'cheat' inside 'cheater' due to word boundary
      expect(matcher.containsKeyword('cheater')).toBe(false)
      expect(matcher.containsKeyword('uncheatable')).toBe(false)
    })

    it('should be case insensitive', () => {
      const matcher = new KeywordMatcher({
        patterns: ['Cheat', 'HACK'],
        exactMatch: []
      })

      expect(matcher.containsKeyword('CHEAT')).toBe(true)
      expect(matcher.containsKeyword('hack')).toBe(true)
      expect(matcher.containsKeyword('HaCk')).toBe(true)
    })

    it('should handle exact match patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: [],
        exactMatch: ['x22cheats', 'aimware']
      })

      expect(matcher.containsKeyword('C:\\Games\\x22cheats.exe')).toBe(true)
      expect(matcher.containsKeyword('aimware.dll')).toBe(true)
      expect(matcher.containsKeyword('x22cheats_modified.exe')).toBe(false)
    })

    it('should return false for empty input', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat'],
        exactMatch: []
      })

      expect(matcher.containsKeyword('')).toBe(false)
      expect(matcher.containsKeyword(null as unknown as string)).toBe(false)
    })

    it('should handle empty patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: [],
        exactMatch: []
      })

      expect(matcher.containsKeyword('anything')).toBe(false)
    })
  })

  describe('findKeyword', () => {
    it('should return the matched keyword', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat', 'hack', 'aimbot'],
        exactMatch: []
      })

      expect(matcher.findKeyword('using cheat software')).toBe('cheat')
      expect(matcher.findKeyword('hack tool detected')).toBe('hack')
    })

    it('should return null when no match', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat'],
        exactMatch: []
      })

      expect(matcher.findKeyword('legitimate software')).toBe(null)
    })

    it('should return original case pattern', () => {
      const matcher = new KeywordMatcher({
        patterns: ['AimBot', 'WallHack'],
        exactMatch: []
      })

      expect(matcher.findKeyword('detected aimbot')).toBe('AimBot')
      expect(matcher.findKeyword('WALLHACK found')).toBe('WallHack')
    })

    it('should match exact match patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: [],
        exactMatch: ['x22cheats']
      })

      expect(matcher.findKeyword('x22cheats.exe')).toBe('x22cheats')
    })
  })

  describe('getKeywords', () => {
    it('should return all patterns', () => {
      const patterns = ['cheat', 'hack', 'aimbot']
      const matcher = new KeywordMatcher({
        patterns,
        exactMatch: []
      })

      expect(matcher.getKeywords()).toEqual(patterns)
    })
  })

  describe('researched cheat indicators', () => {
    // Uses a small, stable custom keyword set — does NOT depend on the shipped
    // keywords.json so tests remain stable if the resource file changes.
    const researchedPatterns = [
      'egguware',
      'egguwarev1',
      'defthack',
      'codakcheat',
      'undeadhacks',
      'thanking',
      'bocheat',
      'novax',
      'smgcheat',
      'kakzy',
      'loaderarcane',
      'xenosinjector',
      'xenos64',
      'extremeinjector',
      'melonloader',
      'titanium'
    ]
    const researchedExactMatch = ['arcane', 'eggu']

    const matcher = new KeywordMatcher({
      patterns: researchedPatterns,
      exactMatch: researchedExactMatch
    })

    describe('pattern matches (new aliases and loader names)', () => {
      it('should detect EgguWare DLL by name', () => {
        expect(matcher.containsKeyword('C:\\Users\\player\\EgguWare.dll')).toBe(true)
      })

      it('should detect EgguWare v1 asset file', () => {
        expect(matcher.containsKeyword('C:\\Windows\\Tasks\\EgguWareV1.assets')).toBe(true)
      })

      it('should detect DeftHack in a path', () => {
        expect(matcher.containsKeyword('C:\\Users\\player\\Downloads\\DeftHack\\loader.exe')).toBe(true)
      })

      it('should detect CodakCheat alias', () => {
        expect(matcher.containsKeyword('CodakCheat_v2.exe')).toBe(true)
      })

      it('should detect UndeadHacks by filename', () => {
        expect(matcher.containsKeyword('undeadhacks-loader.exe')).toBe(true)
      })

      it('should detect Thanking cheat project name', () => {
        // "thanking" as a standalone word in a path (word-boundary matched)
        expect(matcher.containsKeyword('C:\\cheats\\thanking\\loader.exe')).toBe(true)
      })

      it('should detect BoCheat', () => {
        // "bocheat" isolated by underscores (non-alphanumeric boundaries)
        expect(matcher.containsKeyword('bocheat_unturned.dll')).toBe(true)
      })

      it('should detect NovaX cheat loader', () => {
        expect(matcher.containsKeyword('NovaX_Unturned.zip')).toBe(true)
      })

      it('should detect Kakzy cheat reference', () => {
        expect(matcher.containsKeyword('kakzy_loader_v3.exe')).toBe(true)
      })

      it('should detect Arcane loader archive name', () => {
        expect(matcher.containsKeyword('LoaderArcane.zip')).toBe(true)
      })

      it('should detect Xenos64 injector', () => {
        expect(matcher.containsKeyword('Xenos64.exe')).toBe(true)
      })

      it('should detect Extreme Injector executable (compact form)', () => {
        // The keyword "extremeinjector" matches the compact/slugified form
        // commonly used in download links and file archives
        expect(matcher.containsKeyword('extremeinjector.exe')).toBe(true)
      })

      it('should detect MelonLoader installer', () => {
        expect(matcher.containsKeyword('MelonLoader.Installer.exe')).toBe(true)
      })

      it('should detect MelonLoader mod handler DLL', () => {
        expect(matcher.containsKeyword('MelonLoader.ModHandler.dll')).toBe(true)
      })

      it('should detect Titanium loader DLL', () => {
        expect(matcher.containsKeyword('titanium.dll')).toBe(true)
      })

      it('should detect SMGCheat reference', () => {
        expect(matcher.containsKeyword('smgcheat_v1.exe')).toBe(true)
      })
    })

    describe('exactMatch for short indicators', () => {
      it('should detect "arcane" as exact basename match', () => {
        expect(matcher.containsKeyword('C:\\cheats\\arcane.dll')).toBe(true)
      })

      it('should detect "eggu" as exact basename match', () => {
        expect(matcher.containsKeyword('C:\\cheats\\eggu.exe')).toBe(true)
      })

      it('should NOT match "arcane" as a substring inside a longer basename', () => {
        // "arcanegame" basename does not equal "arcane" so exactMatch should not fire
        expect(matcher.containsKeyword('C:\\Games\\arcanegame.exe')).toBe(false)
      })
    })

    describe('benign control strings (false-positive guards)', () => {
      it('should NOT flag a normal Windows system DLL', () => {
        expect(matcher.containsKeyword('C:\\Windows\\System32\\ntdll.dll')).toBe(false)
      })

      it('should NOT flag a legitimate game executable', () => {
        expect(matcher.containsKeyword('C:\\SteamLibrary\\Unturned\\Unturned.exe')).toBe(false)
      })

      it('should NOT flag a common office application', () => {
        expect(matcher.containsKeyword('C:\\Program Files\\Microsoft Office\\WINWORD.EXE')).toBe(false)
      })

      it('should NOT flag a legitimate Unity game module', () => {
        expect(matcher.containsKeyword('UnityEngine.CoreModule.dll')).toBe(false)
      })

      it('should NOT flag a Steam runtime library', () => {
        expect(matcher.containsKeyword('steam_api64.dll')).toBe(false)
      })

      it('should NOT flag a legitimate Harmony modding library path', () => {
        // Harmony is a legitimate mod framework — we deliberately do NOT keyword it
        expect(matcher.containsKeyword('0Harmony.dll')).toBe(false)
      })

      it('should NOT flag Process Hacker (legitimate sysadmin tool)', () => {
        // ProcessHacker.exe is a legitimate tool we deliberately excluded
        expect(matcher.containsKeyword('ProcessHacker.exe')).toBe(false)
      })

      it('should NOT match "titanium" inside an unrelated product name', () => {
        // "TitaniumBackup.apk" — titanium hits here; this is an accepted FP risk
        // documented in research.md. Test confirms the word-boundary behaviour.
        // "TitaniumBackup" has no boundary between "titanium" and "backup",
        // so it SHOULD NOT match under word-boundary semantics.
        expect(matcher.containsKeyword('TitaniumBackup.apk')).toBe(false)
      })
    })
  })
})
