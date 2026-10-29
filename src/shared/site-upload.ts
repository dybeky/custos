/**
 * Upload errors that waiting will never fix (the site refused the check itself,
 * or it no longer exists here). Any other failure — no network, the site down
 * or busy — is passing: the check is kept and sent later.
 */
export const UNSENDABLE_ERRORS: ReadonlySet<string> = new Set([
  'invalid_report', 'invalid_request', 'invalid_payload', 'too_large', 'disabled', 'not_found', 'forbidden'
])

export const isPassingUploadError = (error?: string): boolean => !UNSENDABLE_ERRORS.has(error ?? '')
