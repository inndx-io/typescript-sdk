import { z } from 'zod'

const ValidationErrorFieldDetailSchema = z.object({
  code: z.string(),
  message: z.string().nullable().optional(),
  params: z.unknown().optional(),
})

const ValidationErrorFieldSchema = z.object({
  field: z.string(),
  errors: z.array(ValidationErrorFieldDetailSchema),
})

const ValidationErrorBodySchema = z.object({
  code: z.number(),
  fields: z.array(ValidationErrorFieldSchema),
})

const GenericErrorBodySchema = z.object({
  code: z.number(),
  message: z.string(),
})

// Validation variant is tried first since presence of `fields` uniquely identifies it
export const ErrorResponseSchema = z.union([
  ValidationErrorBodySchema,
  GenericErrorBodySchema,
])

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
export type ValidationErrorBody = z.infer<typeof ValidationErrorBodySchema>
export type GenericErrorBody = z.infer<typeof GenericErrorBodySchema>
export type ValidationErrorField = z.infer<typeof ValidationErrorFieldSchema>
export type ValidationErrorFieldDetail = z.infer<
  typeof ValidationErrorFieldDetailSchema
>
