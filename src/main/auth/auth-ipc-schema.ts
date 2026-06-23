import { z } from 'zod'

/** Validates the auth:login renderer payload at the IPC boundary. */
export const AuthLoginPayloadSchema = z.object({
  provider: z.enum(['google', 'github', 'device'])
}).strict()
