/**
 * Hiding the Windows account name of whoever was checked. One rule for every
 * text that leaves the PC (the site upload and the crash reports), so the two
 * can never disagree about which path forms hold a name.
 *
 * Recognised path forms: C:\Users\<name>\…, C:/Users/… (file:/// links from
 * browser history), \Device\HarddiskVolumeN\Users\… (BAM, when the volume has
 * no drive letter) and the administrative shares of a network path,
 * \\PC\C$\Users\<name>\… (also \\?\UNC\PC\C$\… and the forward-slash spelling).
 * Shared profiles (Public, Default, All Users) are not personal and stay. A name
 * with spaces ("Иван Петров") is taken whole only when a path goes on after it;
 * otherwise the name ends at the first space, comma or bracket, so text after a
 * bare profile folder is kept.
 */
const NAME_CHAR = String.raw`[^\s\\/:*?"<>|\[\]();,=+@]`
// A name that is followed by a path may hold brackets and @ ("John Doe (work)"),
// which Windows allows in account names.
const NAME_WORD = String.raw`[^\s\\/:*?"<>|\[\];,=+]`
const VOLUME_PREFIX = String.raw`(?:[A-Za-z]:|\\?Device\\HarddiskVolume\d+|(?:[\\/]{2}\?[\\/]UNC|[\\/]{2})[\\/]?[^\s\\/:*?"<>|]+[\\/][A-Za-z]\$)`
const PROFILE_DIR = new RegExp(
  `(${VOLUME_PREFIX}` + String.raw`[\\/]+Users[\\/]+)` +
    String.raw`(?!(?:Public|Default|Default User|All Users)(?:[\\/]|$))` +
    `(${NAME_WORD}+(?: ${NAME_WORD}+)*(?=[\\\\/])|${NAME_CHAR}+)`,
  'giu'
)

/**
 * A report copy that leaves this PC carries no Windows account name: the path
 * keeps everything that makes it evidence, only the profile folder becomes
 * <user>. Not applied to findings at scan time, since the app reveals those
 * paths in Explorer.
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
