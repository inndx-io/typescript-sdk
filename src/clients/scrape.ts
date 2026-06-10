import type { BaseHttpClient } from '@/http/client'
import {
  type ScrapeRequest,
  type ScrapeResponse,
  ScrapeRequestSchema,
  ScrapeResponseSchema,
} from '@/types/scrape'


export class ScrapeClient {
  constructor(private readonly http: BaseHttpClient) {}

  async scrapeUrl(body: ScrapeRequest, init?: RequestInit): Promise<ScrapeResponse> {
    return this.http
      .post(
        this.http.buildUrl('/v1/scrape'),
        ScrapeResponseSchema,
        body,
        init,
        ScrapeRequestSchema
      )
  }

  async scrapeUrlMarkdown(url: string, init?: RequestInit): Promise<string> {
    return this.http
      .getRaw(this.http.buildUrl(`/v1/scrape/${url}`), init)
      .then((response) => response.text())
  }
}
