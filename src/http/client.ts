import qs from 'qs'
import type { Client } from 'viem'
import { type ZodType, z } from 'zod'

import { ApiError } from '@/http/errors'
import { ErrorResponseSchema } from '@/types/common/errors'

/**
 * A fetch-shaped function. Both the mppx charge wrapper and a session manager's
 * `.fetch` satisfy this, so the same client machinery drives either transport.
 */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export interface ClientConfig {
  baseUrl: string

  /** Optional headers to include with every request. */
  headers?: Record<string, string>
  /** Optional custom fetch implementation. */
  fetch?: typeof globalThis.fetch

  /** Wallet private key in hexadecimal format. */
  walletKey: `0x${string}`
  /** Optional list of origins that are allowed to accept payments. */
  acceptPaymentOrigins?: string[]

  /** Default escrow cap for sessions, in human units (e.g. "10"). Overridable per `client.session({ maxDeposit })`. */
  maxDeposit?: string

  /** RPC endpoint applied to every known chain. Use `rpcUrls` for per-chain control. */
  rpcUrl?: string
  /** Per-chain-id RPC endpoints. */
  rpcUrls?: Record<number, string>
  /** Fee-payer relay URL; wraps the RPC transport so a third party covers gas. */
  feePayerUrl?: string

  /** Advanced: full control over the viem client per chain id. Overrides `rpcUrl(s)`/`feePayerUrl`. */
  getClient?: (parameters: { chainId?: number | undefined }) => Client | Promise<Client>
  /** Advanced: a prebuilt viem client used for every chain id. */
  client?: Client

  /** Advanced only: escrow contract override. Must match the server's challenge; normally challenge-derived. */
  escrowContract?: `0x${string}`
}

export class BaseHttpClient {
  constructor(
    private readonly config: ClientConfig,
    private readonly doFetch: FetchLike
  ) {}

  /**
   * Builds a full URL from a path and optional query params.
   * Arrays are serialized as `key[]=val`, objects as `key[subkey]=val`.
   */
  buildUrl(path: string, params?: unknown): string {
    const base = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`

    const normalizedPath = path.startsWith('/') ? path.slice(1) : path
    const query =
      params != null && typeof params === 'object'
        ? qs.stringify(params, {
            arrayFormat: 'brackets',
            encodeValuesOnly: true,
          })
        : ''

    return query
      ? `${base}${normalizedPath}?${query}`
      : `${base}${normalizedPath}`
  }

  /** Lowest-level method. Returns the raw Response with no parsing or error handling. */
  async request(
    method: string,
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    return this.doFetch(path, {
      ...init,
      method,
      headers: BaseHttpClient.mergeHeaders(this.config.headers, init?.headers),
    })
  }

  /**
   * Sends a request and parses the response through a Zod schema, throwing
   * ApiError on non-2xx.
   *
   * When `requestSchema` is provided, the body is run through `z.encode` before
   * being serialized so any codecs in the schema (such as base64 byte fields)
   * are encoded to their wire form. The response is always run through
   * `schema.parse`, which decodes those same codecs back to their app form.
   */
  async fetch<T>(
    method: string,
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    init?: RequestInit,
    requestSchema?: ZodType
  ): Promise<T> {
    const response = await this.request(
      method,
      path,
      body !== undefined
        ? BaseHttpClient.withJsonBody(
            requestSchema !== undefined ? z.encode(requestSchema, body) : body,
            init
          )
        : init
    )

    if (!response.ok) {
      throw new ApiError(
        response.status,
        await BaseHttpClient.parseErrorBody(response),
        response
      )
    }

    return schema.parse(await response.json())
  }

  get<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
    return this.fetch('GET', path, schema, undefined, init)
  }

  post<T>(
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    init?: RequestInit,
    requestSchema?: ZodType
  ): Promise<T> {
    return this.fetch('POST', path, schema, body, init, requestSchema)
  }

  put<T>(
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    init?: RequestInit,
    requestSchema?: ZodType
  ): Promise<T> {
    return this.fetch('PUT', path, schema, body, init, requestSchema)
  }

  patch<T>(
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    init?: RequestInit,
    requestSchema?: ZodType
  ): Promise<T> {
    return this.fetch('PATCH', path, schema, body, init, requestSchema)
  }

  async deleteVoid(path: string, init?: RequestInit): Promise<void> {
    const response = await this.request('DELETE', path, init)

    if (!response.ok) {
      throw new ApiError(
        response.status,
        await BaseHttpClient.parseErrorBody(response),
        response
      )
    }
  }

  async fetchRaw(
    method: string,
    path: string,
    body?: unknown,
    init?: RequestInit
  ): Promise<Response> {
    const response = await this.request(
      method,
      path,
      body !== undefined ? BaseHttpClient.withJsonBody(body, init) : init
    )
    if (!response.ok) {
      throw new ApiError(
        response.status,
        await BaseHttpClient.parseErrorBody(response),
        response
      )
    }
    return response
  }

  getRaw(path: string, init?: RequestInit): Promise<Response> {
    return this.fetchRaw('GET', path, undefined, init)
  }

  postRaw(path: string, body?: unknown, init?: RequestInit): Promise<Response> {
    return this.fetchRaw('POST', path, body, init)
  }

  putRaw(path: string, body?: unknown, init?: RequestInit): Promise<Response> {
    return this.fetchRaw('PUT', path, body, init)
  }

  deleteRaw(path: string, init?: RequestInit): Promise<Response> {
    return this.fetchRaw('DELETE', path, undefined, init)
  }

  private static withJsonBody(body: unknown, init?: RequestInit): RequestInit {
    return {
      ...init,
      body: JSON.stringify(body),
      headers: BaseHttpClient.mergeHeaders(
        { 'Content-Type': 'application/json' },
        init?.headers
      ),
    }
  }

  private static mergeHeaders(
    ...sources: (HeadersInit | Record<string, string> | undefined)[]
  ): Headers {
    const merged = new Headers()

    for (const source of sources) {
      if (!source) continue
      for (const [key, value] of new Headers(source as HeadersInit)) {
        merged.set(key, value)
      }
    }

    return merged
  }

  private static async parseErrorBody(response: Response) {
    try {
      const parsed = ErrorResponseSchema.safeParse(await response.json())
      return parsed.success
        ? parsed.data
        : { code: response.status, message: response.statusText }
    } catch {
      return { code: response.status, message: response.statusText }
    }
  }
}
