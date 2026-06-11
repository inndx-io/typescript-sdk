import type { BaseHttpClient } from '@/http/client'
import type { SessionManager } from '@/http/transports'

/**
 * A caller-owned payment channel and its lifecycle. The channel opens lazily on
 * the first request and is NOT settled until `close()` (or scope exit under
 * `await using`). One scope owns exactly one channel.
 *
 * This is the transport-layer primitive: it exposes the session-backed `http`
 * over which higher layers build their resource clients, but knows nothing about
 * them itself. Subclass it to add a resource surface (see `InndxSessionScope`).
 */
export class SessionScope {
  constructor(
    private readonly manager: SessionManager,
    protected readonly http: BaseHttpClient,
    /** Escrow contract this session's channel is opened against, when known from config. */
    readonly escrowContract?: `0x${string}`
  ) {}

  get channelId() {
    return this.manager.channelId
  }

  get cumulative() {
    return this.manager.cumulative
  }

  get opened() {
    return this.manager.opened
  }

  open(options?: { deposit?: bigint }) {
    return this.manager.open(options)
  }

  /** Settles the channel on-chain and returns the receipt, or undefined if nothing was opened. */
  close(): ReturnType<SessionManager['close']> {
    return this.manager.close()
  }

  async [Symbol.asyncDispose]() {
    await this.close()
  }
}
