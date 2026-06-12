import type { BillingConfig, SessionOptions } from '@/billing/config'
import type { ResolvedSigner } from '@/billing/signer'
import { buildSessionManager, type SessionManager } from '@/billing/transports'
import { BaseHttpClient, type ClientConfig } from '@/http/client'

/** The session core: one channel's manager, its session-scoped http client, and the escrow it targets. */
export class Session {
  constructor(
    readonly manager: SessionManager,
    readonly http: BaseHttpClient,
    readonly escrowContract?: `0x${string}`
  ) {}
}

/** A payment channel bound to exactly one endpoint. `call` is the only request method, fully typed per operation. */
export class SessionScope<TArgs extends unknown[], TRes> {
  constructor(
    private readonly core: Session,
    private readonly send: (
      http: BaseHttpClient,
      ...args: TArgs
    ) => Promise<TRes>
  ) {}

  get channelId() {
    return this.core.manager.channelId
  }

  get cumulative() {
    return this.core.manager.cumulative
  }

  get opened() {
    return this.core.manager.opened
  }

  get escrowContract() {
    return this.core.escrowContract
  }

  open(options?: { deposit?: bigint }) {
    return this.core.manager.open(options)
  }

  /** Settles the channel on-chain and returns the receipt, or undefined if nothing was opened. */
  close(): ReturnType<SessionManager['close']> {
    return this.core.manager.close()
  }

  /** Runs `cb`, then settles regardless of outcome. The callback's error takes priority. */
  async scope<T>(cb: (self: this) => Promise<T>): Promise<T> {
    try {
      return await cb(this)
    } finally {
      await this.close()
    }
  }

  async [Symbol.asyncDispose]() {
    await this.close()
  }

  call(...args: TArgs): Promise<TRes> {
    return this.send(this.core.http, ...args)
  }
}

/** Opens session cores. Needs both http config (for `BaseHttpClient`) and billing config (for the session manager). */
export class Sessions {
  constructor(
    private readonly config: ClientConfig & BillingConfig,
    private readonly signer: ResolvedSigner
  ) {}

  open(opts?: SessionOptions): Session {
    const manager = buildSessionManager(this.config, this.signer, opts)

    return new Session(
      manager,
      new BaseHttpClient(this.config, manager.fetch.bind(manager)),
      opts?.escrowContract ?? this.config.escrowContract
    )
  }
}
