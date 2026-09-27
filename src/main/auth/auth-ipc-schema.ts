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
