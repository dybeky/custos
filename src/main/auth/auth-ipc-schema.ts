import { z } from 'zod'

/** Validates the auth:login renderer payload at the IPC boundary. */
export const AuthLoginPayloadSchema = z.object({
  provider: z.enum(['google', 'github', 'device'])
}).strict()

/**
 * Hard ceiling on avatar bytes accepted from the renderer. The renderer exports
 * a 512² webp (tens of KB); anything past this is malformed or hostile and is
 * rejected before it is buffered into a multipart upload.
 */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/**
 * Validates the auth:upload-avatar payload. `bytes` is the cropped image as an
 * ArrayBuffer (structured-cloned across IPC); the renderer never holds the bearer
 * token, so main performs the upload. `mime` is restricted to what the web
 * endpoint accepts.
 */
export const AuthUploadAvatarPayloadSchema = z.object({
  bytes: z
    .instanceof(ArrayBuffer)
    .refine((b) => b.byteLength > 0 && b.byteLength <= MAX_AVATAR_BYTES, 'avatar size out of range'),
  mime: z.enum(['image/webp', 'image/png', 'image/jpeg'])
}).strict()

/** site:upload-check — a saved check (by history id) plus the case details. */
export const SiteUploadPayloadSchema = z.object({
  historyId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  player: z.string().max(200),
  notes: z.string().max(20000),
  checker: z.string().max(200).default('')
}).strict()

/** site:player-checks — the player field as typed (main derives the key). */
export const SitePlayerPayloadSchema = z.object({
  player: z.string().min(1).max(200)
}).strict()

/** site:open — an uploaded check id, or a player field. */
export const SiteOpenPayloadSchema = z.union([
  z.object({ checkId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict(),
  z.object({ player: z.string().min(1).max(200) }).strict()
])

export const SitePreviousPayloadSchema = z.object({
  player: z.string().max(200),
  before: z.string().datetime({ offset: true })
})

/** site:checks — a page of the site's checks, optionally filtered by player. */
export const SiteChecksPayloadSchema = z.object({
  page: z.number().int().min(1).max(10_000),
  q: z.string().max(80).default('')
}).strict()

/** site:check — one check of the site, by id. */
export const SiteCheckPayloadSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
}).strict()
