import { Fetch, tempo } from 'mppx/client'
import { type Account, type Client, createClient, http } from 'viem'
import { withFeePayer } from 'viem/tempo'
import { tempo as tempoChain } from 'viem/tempo/chains'

import type { ClientConfig, FetchLike } from '@/http/client'

/** The mppx session manager type, derived since it has no stable export path. */
export type SessionManager = ReturnType<typeof tempo.session>

const DEFAULT_ACCEPT_PAYMENT_ORIGINS = ['*.inndx.io']

const CHAIN_IDS = { mainnet: 4217, testnet: 42431 } as const

type GetClient = (parameters: {
  chainId?: number | undefined
}) => Client | Promise<Client>

/**
 * Resolves the SDK's network config into mppx's only network hook, `getClient`.
 * mppx hardcodes its RPC defaults, so a custom `rpcUrl`/`feePayerUrl` must be
 * turned into a viem client we build here. Returns undefined to let mppx use
 * its per-chain public defaults.
 */
function buildGetClient(config: ClientConfig): GetClient | undefined {
  if (config.getClient) return config.getClient

  const prebuilt = config.client
  if (prebuilt) return () => prebuilt

  const rpcUrls =
    config.rpcUrls ??
    (config.rpcUrl
      ? {
          [CHAIN_IDS.mainnet]: config.rpcUrl,
          [CHAIN_IDS.testnet]: config.rpcUrl,
        }
      : undefined)

  if (!rpcUrls && !config.feePayerUrl) return undefined

  return ({ chainId }) => {
    const transport = http(rpcUrls?.[chainId ?? CHAIN_IDS.mainnet])

    return createClient({
      chain: { ...tempoChain, id: chainId ?? tempoChain.id },
      transport: config.feePayerUrl
        ? withFeePayer(transport, http(config.feePayerUrl))
        : transport,
    })
  }
}

function networkOptions(config: ClientConfig) {
  const getClient = buildGetClient(config)

  return getClient ? { getClient } : {}
}

/**
 * The default transport for the whole client: wraps the user's fetch with charge
 * handling so every charge-billed endpoint settles per request with no ceremony.
 */
export function buildChargeFetch(
  config: ClientConfig,
  account: Account
): FetchLike {
  return Fetch.from({
    methods: [tempo.charge({ account, ...networkOptions(config) })],
    fetch: config.fetch ?? globalThis.fetch,
    acceptPaymentPolicy: {
      origins: config.acceptPaymentOrigins ?? DEFAULT_ACCEPT_PAYMENT_ORIGINS,
    },
  })
}

/**
 * Builds a single-channel session manager. Wraps the raw user fetch (not the
 * charge fetch) since session endpoints need session handling, not charge.
 */
export function buildSessionManager(
  config: ClientConfig,
  account: Account,
  sessionConfig: { maxDeposit?: string } = {}
): SessionManager {
  const maxDeposit = sessionConfig.maxDeposit ?? config.maxDeposit

  if (!maxDeposit)
    throw new Error(
      'A session requires `maxDeposit`. Set it on the client config or pass client.session({ maxDeposit }).'
    )

  return tempo.session({
    account,
    fetch: config.fetch ?? globalThis.fetch,
    maxDeposit,
    ...networkOptions(config),
    ...(config.escrowContract ? { escrowContract: config.escrowContract } : {}),
  })
}
