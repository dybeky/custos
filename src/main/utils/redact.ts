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

/** Longest stretch of free text (title, form value) kept in a finding. */
export const MAX_FREE_TEXT = 300

export function redactSecrets(text: string): string {
  return text
    .replace(LABELLED, (_m, label: string, sep: string) => `${label}${sep}${HIDDEN}`)
    .replace(URL_PARAM, `$1${HIDDEN}`)
    .replace(EMAIL, '[email]')
}

/** A page title / form value, redacted and capped so a report never carries a document. */
export function safeFreeText(text: string): string {
  const clean = redactSecrets(text)
  return clean.length > MAX_FREE_TEXT ? clean.slice(0, MAX_FREE_TEXT) + '…' : clean
}
