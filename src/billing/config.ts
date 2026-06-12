import type { Account, Client } from 'viem'

export interface BillingConfig {
  /** Optional custom fetch implementation. */
  fetch?: typeof globalThis.fetch

  /**
   * Wallet private key in hexadecimal format. One signer only: supply exactly one of
   * `walletKey`, `account`, or `getConnectorClient`.
   */
  walletKey?: `0x${string}`
  /** A prebuilt viem account (passkey/WebCrypto/custom signer). One signer only. */
  account?: Account
  /**
   * Wagmi-style connector accessor for browser signing, shaped like a partially applied
   * `getConnectorClient(wagmiConfig)`. Doubles as the network client, overriding
   * `getClient`/`client`/`rpcUrl(s)`. One signer only.
   */
  getConnectorClient?: (parameters: {
    chainId?: number | undefined
  }) => Promise<Client> | Client

  /** Optional list of origins that are allowed to accept payments. */
  acceptPaymentOrigins?: string[]

  /** Default escrow cap for sessions, in human units (e.g. "10"). Overridable per-session via `SessionOptions`. */
  maxDeposit?: string

  /** Advanced only: escrow contract override. Must match the server's challenge; normally challenge-derived. */
  escrowContract?: `0x${string}`

  /** Chain id the client targets. Required for `reclaimSession` without a server; sessions otherwise infer it from the challenge. */
  chainId?: number

  /** RPC endpoint applied to every known chain. Use `rpcUrls` for per-chain control. */
  rpcUrl?: string
  /** Per-chain-id RPC endpoints. */
  rpcUrls?: Record<number, string>
  /** Fee-payer relay URL; wraps the RPC transport so a third party covers gas. */
  feePayerUrl?: string

  /** Advanced: full control over the viem client per chain id. Overrides `rpcUrl(s)`/`feePayerUrl`. */
  getClient?: (parameters: {
    chainId?: number | undefined
  }) => Client | Promise<Client>
  /** Advanced: a prebuilt viem client used for every chain id. */
  client?: Client
}

export interface SessionOptions {
  /** Escrow cap for this session, in human units (e.g. "10"). Overrides `BillingConfig.maxDeposit`. */
  maxDeposit?: string
  /** Escrow contract for this session. Overrides `BillingConfig.escrowContract`. */
  escrowContract?: `0x${string}`
}
