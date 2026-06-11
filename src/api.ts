import { privateKeyToAccount } from 'viem/accounts'

import { ScrapeClient } from '@/clients/scrape'
import { BaseHttpClient, type ClientConfig } from '@/http/client'
import { createReclaimScope, type ReclaimScope } from '@/http/reclaim'
import { SessionScope } from '@/http/session'
import { buildChargeFetch, buildSessionManager } from '@/http/transports'
import { type PingResponse, PingResponseSchema } from '@/types/common/ping'

/** A session scope carrying inndx's session-billed resource clients. */
export class InndxSessionScope extends SessionScope {
  readonly scrape = new ScrapeClient(this.http)
}

export class InndxClient {
  private readonly account
  private readonly http: BaseHttpClient

  constructor(private readonly config: ClientConfig) {
    this.account = privateKeyToAccount(config.walletKey)
    this.http = new BaseHttpClient(
      config,
      buildChargeFetch(config, this.account)
    )
  }

  ping(init?: RequestInit): Promise<PingResponse> {
    return this.http.get(this.http.buildUrl('/'), PingResponseSchema, init)
  }

  /** Opens a session scope for session-billed endpoints. Remember to `close()` it (or use `await using`). */
  session(opts?: { maxDeposit?: string }): InndxSessionScope {
    const manager = buildSessionManager(this.config, this.account, opts)

    return new InndxSessionScope(
      manager,
      new BaseHttpClient(this.config, manager.fetch.bind(manager)),
      this.config.escrowContract
    )
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
    return createReclaimScope(this.config, this.account, params)
  }

  /** Runs `callback` within a session scope, settling the channel even if `callback` throws. */
  async withSession<T>(
    opts: { maxDeposit?: string } | undefined,
    callback: (scope: InndxSessionScope) => Promise<T>
  ): Promise<T> {
    const scope = this.session(opts)

    try {
      return await callback(scope)
    } finally {
      await scope.close()
    }
  }
}
