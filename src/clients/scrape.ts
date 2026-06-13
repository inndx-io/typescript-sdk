import type { SessionOptions } from '@/billing/config'
import { SessionScope, type Sessions } from '@/billing/session'
import {
  type ScrapeRequest,
  ScrapeRequestSchema,
  type ScrapeResponse,
  ScrapeResponseSchema,
  type ScrapeUrlMarkdownParams,
} from '@/types/scrape'

export class ScrapeClient {
  constructor(private readonly sessions: Sessions) {}

  /** Opens a session for `scrape_url`. */
  scrapeUrl(opts?: SessionOptions) {
    return new SessionScope(
      this.sessions.open(opts),
      (
        http,
        body: ScrapeRequest,
        init?: RequestInit
      ): Promise<ScrapeResponse> =>
        http.post(
          http.buildUrl('/v1/scrape'),
          ScrapeResponseSchema,
          body,
          init,
          ScrapeRequestSchema
        )
    )
  }

  /** Opens a session for `scrape_url_markdown`. */
  scrapeUrlMarkdown(opts?: SessionOptions) {
    return new SessionScope(
      this.sessions.open(opts),
      (http, url: string, params?: ScrapeUrlMarkdownParams, init?: RequestInit) =>
        http
          .getRaw(http.buildUrl(`/v1/scrape/${url}`), {
            ...init,
            headers: {
              ...init?.headers,
              ...(params?.timeout_seconds ? { 'X-Scrape-Timeout-Seconds': params.timeout_seconds.toString() } : {}),
              ...(params?.proxy ? { 'X-Scrape-Proxy': JSON.stringify(params.proxy) } : {}),
              ...(params?.locale ? { 'X-Scrape-Locale': params.locale } : {}),
            }
          })
          .then(r => r.text())
    )
  }
}
