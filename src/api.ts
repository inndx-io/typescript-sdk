import type { BillingConfig } from '@/billing/config'
import { createReclaimScope, type ReclaimScope } from '@/billing/reclaim'
import { Sessions } from '@/billing/session'
import { resolveSigner } from '@/billing/signer'
import { buildChargeFetch } from '@/billing/transports'
import { ScrapeClient } from '@/clients/scrape'
import { BaseHttpClient, type ClientConfig } from '@/http/client'
import { type PingResponse, PingResponseSchema } from '@/types/common/ping'

export type InndxConfig = ClientConfig & BillingConfig

export class InndxClient {
  private readonly signer
  private readonly http: BaseHttpClient

  readonly scrape: ScrapeClient

  constructor(private readonly config: InndxConfig) {
    this.signer = resolveSigner(config)
    this.http = new BaseHttpClient(
      config,
      buildChargeFetch(config, this.signer)
    )

    this.scrape = new ScrapeClient(new Sessions(config, this.signer))
  }

  ping(init?: RequestInit): Promise<PingResponse> {
    return this.http.get(this.http.buildUrl('/'), PingResponseSchema, init)
  }

  /**
   * Reclaims a previously-opened channel by its id, independent of the server, using a
   * forced on-chain close. Use this to recover an escrow deposit that was stranded because
   * a session was never closed (for example after a process restart). Persist `channelId`
   * (and `escrowContract`, if not pinned on the client config) from the original session.
   *
   * Forced close is a two-step, grace-delayed sequence: call `requestClose()` to start the
   * timer, then `withdraw()` once `getState().ready` is true. The two steps may run in
   * separate processes since all state lives on chain.
   */
  reclaimSession(params: {
    channelId: `0x${string}`
    escrowContract?: `0x${string}`
    chainId?: number
  }): ReclaimScope {
    return createReclaimScope(this.config, this.signer, params)
  }
}
