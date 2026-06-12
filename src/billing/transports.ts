import { Fetch, tempo } from 'mppx/client'
import { type Client, createClient, http } from 'viem'
import { withRelay } from 'viem/tempo'
import { tempo as tempoChain } from 'viem/tempo/chains'

import type { BillingConfig, SessionOptions } from '@/billing/config'
import type { ResolvedSigner } from '@/billing/signer'
import type { FetchLike } from '@/http/client'

/** The mppx session manager type, derived since it has no stable export path. */
export type SessionManager = ReturnType<typeof tempo.session>

const DEFAULT_ACCEPT_PAYMENT_ORIGINS = ['*.inndx.io']

const CHAIN_IDS = { mainnet: 4217, testnet: 42431 } as const

type GetClient = (parameters: {
  chainId?: number | undefined
}) => Client | Promise<Client>

// mppx hardcodes its RPC defaults; custom rpcUrl/feePayerUrl must become a viem Client for its getClient hook.
function buildGetClient(config: BillingConfig): GetClient | undefined {
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
        ? withRelay(transport, http(config.feePayerUrl))
        : transport,
    })
  }
}

function networkOptions(config: BillingConfig) {
  const getClient = buildGetClient(config)

  return getClient ? { getClient } : {}
}

// A connector supplies its own client (mppx resolves the account from it), so it overrides the network config entirely.
function signerOptions(config: BillingConfig, signer: ResolvedSigner) {
  return signer.kind === 'account'
    ? { account: signer.account, ...networkOptions(config) }
    : { getClient: signer.getClient }
}

export function buildChargeFetch(
  config: BillingConfig,
  signer: ResolvedSigner
): FetchLike {
  return Fetch.from({
    methods: [tempo.charge(signerOptions(config, signer))],
    fetch: config.fetch ?? globalThis.fetch,
    acceptPaymentPolicy: {
      origins: config.acceptPaymentOrigins ?? DEFAULT_ACCEPT_PAYMENT_ORIGINS,
    },
  })
}

// Uses the raw fetch, not the charge fetch — session endpoints must go through the session transport.
export function buildSessionManager(
  config: BillingConfig,
  signer: ResolvedSigner,
  sessionConfig?: SessionOptions
): SessionManager {
  const maxDeposit = sessionConfig?.maxDeposit ?? config.maxDeposit
  const escrowContract = sessionConfig?.escrowContract ?? config.escrowContract

  if (!maxDeposit)
    throw new Error(
      'A session requires `maxDeposit`. Set it on the client config or pass it via SessionOptions.'
    )

  return tempo.session({
    fetch: config.fetch ?? globalThis.fetch,
    maxDeposit,
    ...signerOptions(config, signer),
    ...(escrowContract ? { escrowContract } : {}),
  })
}
