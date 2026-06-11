import type { Account, Client } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import type { ClientConfig } from '@/http/client'

/** A connector accessor that yields an account-bearing client (wagmi's `getConnectorClient`). */
export type ConnectorClientFn = (parameters: {
  chainId?: number | undefined
}) => Promise<Client> | Client

/**
 * The signer resolved from a `ClientConfig`, in one of two shapes: a static account (from a
 * private key or a prebuilt viem account) that signs locally, or a connector that yields an
 * account-bearing client whose wallet signs.
 */
export type ResolvedSigner =
  | { kind: 'account'; account: Account }
  | { kind: 'connector'; getClient: ConnectorClientFn }

/**
 * Resolves the single signer a client was configured with. Exactly one of `walletKey`,
 * `account`, or `getConnectorClient` must be supplied; anything else throws.
 */
export function resolveSigner(config: ClientConfig): ResolvedSigner {
  const provided = [
    config.walletKey !== undefined,
    config.account !== undefined,
    config.getConnectorClient !== undefined,
  ].filter(Boolean).length

  if (provided > 1)
    throw new Error(
      'Provide exactly one signer: `walletKey`, `account`, or `getConnectorClient` (more than one was set).'
    )

  if (config.walletKey !== undefined)
    return { kind: 'account', account: privateKeyToAccount(config.walletKey) }

  if (config.account !== undefined)
    return { kind: 'account', account: config.account }

  if (config.getConnectorClient !== undefined)
    return { kind: 'connector', getClient: config.getConnectorClient }

  throw new Error(
    'No signer provided. Set exactly one of `walletKey`, `account`, or `getConnectorClient`.'
  )
}
