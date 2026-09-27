/**
 * Wire format shared between the file-hash scanner and the risk engine.
 *
 * The file-hash scanner reports two very different kinds of evidence through
 * the same string list: a content match against the known-cheat hash database
 * (strong, file-content evidence) and a mere file-name keyword match (a lead,
 * like any other name match). The trailing tag tells them apart so the risk
 * engine never mistakes a filename coincidence for a verified hash.
 */
export const FILEHASH_KNOWN_TAG = '(known-hash)'
export const FILEHASH_KEYWORD_TAG = '(keyword)'

/** Format a file-hash finding: `<path> [sha256:<prefix>…] (<tag>)`. */
export function formatFileHashFinding(filePath: string, sha256: string, knownHash: boolean): string {
  return `${filePath} [sha256:${sha256.slice(0, 16)}…] ${knownHash ? FILEHASH_KNOWN_TAG : FILEHASH_KEYWORD_TAG}`
}

/** True when a file-hash finding is a content match against the hash database. */
export function isKnownHashFinding(value: string): boolean {
  return value.trimEnd().endsWith(FILEHASH_KNOWN_TAG)
}

/** The `sha256:<prefix>` token of a file-hash finding, if present. */
export function hashTokenOf(value: string): string | null {
  const m = /\[(sha256:[0-9a-f]+)…?\]/i.exec(value)
  return m ? m[1].toLowerCase() : null
}
