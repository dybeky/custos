import { z } from 'zod'

/** Validates the auth:login renderer payload at the IPC boundary. */
export const AuthLoginPayloadSchema = z.object({
  provider: z.enum(['google', 'github', 'device'])
}).strict()

/**
 * Validates the auth:upload-avatar payload. `bytes` is the cropped image as an
 * ArrayBuffer (structured-cloned across IPC); the renderer never holds the bearer
 * token, so main performs the upload. `mime` is restricted to what the web
 * endpoint accepts.
 */
export const AuthUploadAvatarPayloadSchema = z.object({
  bytes: z.instanceof(ArrayBuffer),
  mime: z.enum(['image/webp', 'image/png', 'image/jpeg'])
}).strict()
