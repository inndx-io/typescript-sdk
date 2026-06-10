import { z } from 'zod'

import { Base64Bytes } from '@/types/common/base64'

const ScrapeFormatMarkdownSchema = z.object({
  kind: z.literal('markdown'),
  skip_tags: z.array(z.string()).optional(),
})

const ScrapeFormatHtmlSchema = z.object({
  kind: z.literal('html'),
})

export const ScrapeFormatSchema = z.discriminatedUnion('kind', [
  ScrapeFormatMarkdownSchema,
  ScrapeFormatHtmlSchema,
])

export const ScrapeProxySchema = z.enum(['isp'])

export const ScrapeRequestSchema = z.object({
  /** The target URL to scrape */
  url: z.url(),
  /** The formats to scrape the content in */
  formats: z.array(ScrapeFormatSchema).optional(),
  /** Optional proxy settings for the scrape operation */
  proxy: ScrapeProxySchema.nullable().optional(),
  /** Optional timeout for the scrape operation (in seconds) */
  timeout_seconds: z.number().int().nonnegative().nullable().optional(),
})

const ScrapeResponseMarkdownSchema = z.object({
  kind: z.literal('markdown'),
  content: z.string(),
})

const ScrapeResponseHtmlSchema = z.object({
  kind: z.literal('html'),
  content: z.string(),
})

const ScrapeResponseJsonSchema = z.object({
  kind: z.literal('json'),
  data: z.unknown(),
})

const ScrapeResponseBinarySchema = z.object({
  kind: z.literal('binary'),
  content: Base64Bytes,
  content_type: z.string(),
})

export const ScrapeResponseResultSchema = z.discriminatedUnion('kind', [
  ScrapeResponseMarkdownSchema,
  ScrapeResponseHtmlSchema,
  ScrapeResponseJsonSchema,
  ScrapeResponseBinarySchema,
])

export const ScrapeResponseSchema = z.object({
  /** The URL that was scraped */
  url: z.url(),
  /** The results of the scrape operation in the requested formats */
  results: z.array(ScrapeResponseResultSchema),
})

export type ScrapeFormat = z.infer<typeof ScrapeFormatSchema>
export type ScrapeProxy = z.infer<typeof ScrapeProxySchema>
export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>
export type ScrapeResponseResult = z.infer<typeof ScrapeResponseResultSchema>
export type ScrapeResponse = z.infer<typeof ScrapeResponseSchema>
