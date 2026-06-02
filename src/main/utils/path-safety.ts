import { relative, isAbsolute } from 'path'

/**
 * True when `child` is the same path as `root` or nested beneath it.
 *
 * Used to stop directory traversal from escaping its scan root. On Windows,
 * directory junctions and volume mount points are reparse points that
 * `fs.Dirent.isSymbolicLink()` does NOT flag (they report as plain
 * directories), so the symlink guard alone lets a planted junction redirect a
 * scan outside its intended root. Comparing each entry's canonical (realpath)
 * location against the canonical root closes that hole regardless of the
 * reparse mechanism.
 *
 * Both arguments must be canonical absolute paths (e.g. from realpathSync).
 */
export function isWithin(root: string, child: string): boolean {
  const rel = relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
