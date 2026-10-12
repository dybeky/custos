/**
 * Strip credentials from text a scanner copied off the PC — page titles, form
 * values, URLs — before it goes into a report (which is uploaded to the site
 * and seen by staff). A page title can hold anything: a chat named after a
 * list of logins, a URL carrying a session token. The keyword that made the
 * line a finding is kept; only the secret around it is replaced.
 */

const HIDDEN = '[hidden]'

// "password: x", "Пароль = x", "Kennwort: x", "login: x" … — the label stays.
const LABELLED = new RegExp(
  '(?<![\\p{L}\\d])(' +
    [
      'pass(?:word|wort|wd)?', 'pwd', 'kennwort', 'contrase(?:ñ|n)a', 'mot de passe', 'senha', 'has(?:ł|l)o',
      'пароль', 'логин', 'login', 'user(?:name)?', 'benutzer(?:name)?', 'e-?mail', 'почта',
      'token', 'api[_ -]?key', 'secret', 'pin'
    ].join('|') +
    ')(\\s*[:=]\\s*)(\\S+)',
  'giu'
)

// Secret-carrying URL parameters.
const URL_PARAM = /([?&#;](?:access_token|id_token|refresh_token|token|auth|authorization|key|api_key|apikey|password|pass|pwd|session|sessionid|sid|code|secret|signature|sig)=)[^&#\s"|]+/gi

const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/gu

// Every scanner's findings pass through here, and most are file names and
// paths: "aimbot@v2.exe" is a file, not an address, and "Token = C:\x.exe" is
// a registry value, not a password. Hiding those would erase the keyword the
// finding exists for, so a file name or a Windows path is left alone.
const FILE_EXT = /\.(?:exe|dll|sys|drv|zip|rar|cab|iso|jar|json|txt|ini|cfg|conf|log|lua|dat|bin|bat|cmd|ps1|vbs|js|msi|lnk|pf|tmp|asi|ahk|py|xml|config|pak)$/i
const isPath = (value: string): boolean => value.includes('\\')

/** Longest stretch of free text (title, form value) kept in a finding. */
export const MAX_FREE_TEXT = 300

export function redactSecrets(text: string): string {
  return text
    .replace(LABELLED, (m, label: string, sep: string, value: string) => (isPath(value) ? m : `${label}${sep}${HIDDEN}`))
    .replace(URL_PARAM, `$1${HIDDEN}`)
    .replace(EMAIL, (m) => (FILE_EXT.test(m) ? m : '[email]'))
}

// C:\Users\<name>\… — the Windows account name of whoever was checked, in any
// form a finding carries a path: C:\Users\…, C:/Users/… (file:/// links from
// browser history) and \Device\HarddiskVolumeN\Users\… (BAM, when the volume
// has no drive letter). Shared profiles (Public, Default, All Users) are not
// personal and stay as they are. A name with spaces ("Иван Петров") is taken
// whole only when a path goes on after it; otherwise the name ends at the first
// space, comma or bracket, so text after a bare profile folder is kept.
const NAME_CHAR = String.raw`[^\s\\/:*?"<>|\[\]();,=+@]`
const PROFILE_DIR = new RegExp(
  String.raw`((?:[A-Za-z]:|\\?Device\\HarddiskVolume\d+)[\\/]+Users[\\/]+)` +
    String.raw`(?!(?:Public|Default|Default User|All Users)(?:[\\/]|$))` +
    `(${NAME_CHAR}+(?: ${NAME_CHAR}+)+(?=[\\\\/])|${NAME_CHAR}+)`,
  'giu'
)

/**
 * A report copy that leaves this PC (the site upload) carries no Windows
 * account name: the path keeps everything that makes it evidence, only the
 * profile folder becomes <user>. Not applied to findings at scan time, since the
 * app reveals those paths in Explorer.
 */
export function hideProfileNames(text: string): string {
  return text.replace(PROFILE_DIR, '$1<user>')
}

/** hideProfileNames over every string in a JSON-like value (a new copy). */
export function hideProfileNamesDeep<T>(value: T): T {
  if (typeof value === 'string') return hideProfileNames(value) as T
  if (Array.isArray(value)) return value.map(hideProfileNamesDeep) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hideProfileNamesDeep(v)])) as T
  }
  return value
}

/** A page title / form value, redacted and capped so a report never carries a document. */
export function safeFreeText(text: string): string {
  const clean = redactSecrets(text)
  return clean.length > MAX_FREE_TEXT ? clean.slice(0, MAX_FREE_TEXT) + '…' : clean
}
