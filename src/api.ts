import { privateKeyToAccount } from 'viem/accounts'

import { ScrapeClient } from '@/clients/scrape'
import { BaseHttpClient, type ClientConfig } from '@/http/client'
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
    this.http = new BaseHttpClient(config, buildChargeFetch(config, this.account))
  }

  ping(init?: RequestInit): Promise<PingResponse> {
    return this.http.get(this.http.buildUrl('/'), PingResponseSchema, init)
  }

  /** Opens a session scope for session-billed endpoints. Remember to `close()` it (or use `await using`). */
  session(opts?: { maxDeposit?: string }): InndxSessionScope {
    const manager = buildSessionManager(this.config, this.account, opts)

    return new InndxSessionScope(
      manager,
      new BaseHttpClient(this.config, manager.fetch.bind(manager))
    )
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
