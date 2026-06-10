import { z } from 'zod'

export const PingResponseSchema = z.object({
  version: z.string(),
})

export type PingResponse = z.infer<typeof PingResponseSchema>
