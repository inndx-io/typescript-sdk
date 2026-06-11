import {
  type Account,
  type Client,
  createClient,
  encodeFunctionData,
  type Hex,
  http,
} from 'viem'
import {
  prepareTransactionRequest,
  readContract,
  sendRawTransactionSync,
  signTransaction,
} from 'viem/actions'
import { withFeePayer } from 'viem/tempo'
import { tempo as tempoChain } from 'viem/tempo/chains'

import type { ClientConfig } from '@/http/client'

/**
 * The inndx gateway's escrow is mppx's `TempoStreamChannel`, whose mutating
 * functions are keyed by channel id alone and authorized by `msg.sender ==
 * payer`. These fragments are vendored here so the SDK does not depend on an
 * mppx internal import path.
 */
const escrowReclaimAbi = [
  {
    type: 'function',
    name: 'CLOSE_GRACE_PERIOD',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getChannel',
    inputs: [{ name: 'channelId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'finalized', type: 'bool' },
          { name: 'closeRequestedAt', type: 'uint64' },
          { name: 'payer', type: 'address' },
          { name: 'payee', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'authorizedSigner', type: 'address' },
          { name: 'deposit', type: 'uint128' },
          { name: 'settled', type: 'uint128' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'requestClose',
    inputs: [{ name: 'channelId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'channelId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const CHAIN_IDS = { mainnet: 4217, testnet: 42431 } as const

/** Default payment-channel escrow per chain id. */
const DEFAULT_ESCROW: Record<number, Hex> = {
  [CHAIN_IDS.mainnet]: '0x33b901018174DDabE4841042ab76ba85D4e24f25',
  [CHAIN_IDS.testnet]: '0xe1c4d3dce17bc111181ddf716f75bae49e61a336',
}

/** Default currency (used as the fee token for the reclaim transactions) per chain id. */
const DEFAULT_CURRENCY: Record<number, Hex> = {
  [CHAIN_IDS.mainnet]: '0x20C000000000000000000000b9537d11c60E8b50',
  [CHAIN_IDS.testnet]: '0x20c0000000000000000000000000000000000000',
}

/** Default RPC endpoint per chain id. */
const DEFAULT_RPC: Record<number, string> = {
  [CHAIN_IDS.mainnet]: 'https://rpc.tempo.xyz',
  [CHAIN_IDS.testnet]: 'https://rpc.moderato.tempo.xyz',
}

/** On-chain state of a channel, plus derived reclaim readiness. */
export type ReclaimChannelState = {
  /** Whether the channel has been finalized (closed/withdrawn) on chain. */
  finalized: boolean
  /** Whether a forced close has been requested (the grace timer has started). */
  closeRequested: boolean
  /** Unix seconds when close was requested, or 0 if it has not been. */
  closeRequestedAt: number
  /** Unix seconds when `withdraw` becomes callable, or undefined if not requested. */
  readyAt: number | undefined
  /** Whether `withdraw` is expected to succeed now (best-effort, the contract is the real gate). */
  ready: boolean
  /** Total funded amount. */
  deposit: bigint
  /** Amount already settled to the payee. */
  settled: bigint
  /** Amount refundable to the payer once finalized (`deposit - settled`). */
  refundable: bigint
  /** The channel's payer (must equal the configured wallet to reclaim). */
  payer: Hex
  /** The channel's payee. */
  payee: Hex
}

export interface ReclaimScope {
  readonly channelId: Hex
  readonly escrowContract: Hex
  /** Reads the current on-chain channel state. */
  getState(): Promise<ReclaimChannelState>
  /** Starts the forced-close grace timer. No-op (returns undefined) if already requested or finalized. */
  requestClose(): Promise<Hex | undefined>
  /**
   * Finalizes the channel and refunds the payer. No-op (returns undefined) if already finalized.
   * Throws {@link ChannelNotReadyError} if the grace window has not elapsed, or a plain Error
   * if close was never requested.
   */
  withdraw(): Promise<Hex | undefined>
}

/** Thrown by `withdraw()` when the forced-close grace window has not yet elapsed. */
export class ChannelNotReadyError extends Error {
  readonly channelId: Hex
  /** Unix seconds when `withdraw` is expected to become callable. */
  readonly readyAt: number

  constructor(channelId: Hex, readyAt: number) {
    super(
      `Channel ${channelId} is not ready to withdraw yet. The close grace period elapses at ${new Date(
        readyAt * 1000
      ).toISOString()}.`
    )
    this.name = 'ChannelNotReadyError'
    this.channelId = channelId
    this.readyAt = readyAt
  }
}

function resolveChainId(config: ClientConfig, override?: number): number {
  return override ?? config.chainId ?? CHAIN_IDS.mainnet
}

function resolveEscrow(config: ClientConfig, chainId: number, override?: Hex): Hex {
  const escrow = override ?? config.escrowContract ?? DEFAULT_ESCROW[chainId]
  if (!escrow)
    throw new Error(
      `No escrow contract for chain ${chainId}. Set \`escrowContract\` on the client config or pass it to reclaimSession().`
    )
  return escrow
}

/**
 * Builds a viem client for the reclaim calls. Unlike `buildGetClient`, this always
 * returns a client (falling back to the default RPC for the chain), since reclaim must
 * work without a server challenge. The account is passed per-action, mirroring mppx.
 */
function resolveClient(config: ClientConfig, chainId: number): Client {
  if (config.getClient) {
    const client = config.getClient({ chainId })

    if (client instanceof Promise)
      throw new Error('reclaimSession requires a synchronous `getClient`.')

    return client
  }

  if (config.client) return config.client

  const transport = http(config.rpcUrls?.[chainId] ?? config.rpcUrl ?? DEFAULT_RPC[chainId])

  return createClient({
    chain: { ...tempoChain, id: chainId },
    transport: config.feePayerUrl ? withFeePayer(transport, http(config.feePayerUrl)) : transport,
  })
}

export function createReclaimScope(
  config: ClientConfig,
  account: Account,
  params: { channelId: Hex; escrowContract?: Hex; chainId?: number }
): ReclaimScope {
  const chainId = resolveChainId(config, params.chainId)
  const escrowContract = resolveEscrow(config, chainId, params.escrowContract)
  const channelId = params.channelId
  const client = resolveClient(config, chainId)
  const feeToken = DEFAULT_CURRENCY[chainId]

  let cachedGrace: bigint | undefined

  async function readGrace(): Promise<bigint> {
    if (cachedGrace === undefined) {
      cachedGrace = await readContract(client, {
        address: escrowContract,
        abi: escrowReclaimAbi,
        functionName: 'CLOSE_GRACE_PERIOD',
      })
    }

    return cachedGrace
  }

  async function readChannel() {
    return readContract(client, {
      address: escrowContract,
      abi: escrowReclaimAbi,
      functionName: 'getChannel',
      args: [channelId],
    })
  }

  async function send(functionName: 'requestClose' | 'withdraw'): Promise<Hex> {
    const prepared = await prepareTransactionRequest(client, {
      account,
      calls: [
        {
          to: escrowContract,
          data: encodeFunctionData({ abi: escrowReclaimAbi, functionName, args: [channelId] }),
        },
      ],
      ...(feeToken ? { feeToken } : {}),
    } as never)

    const serialized = await signTransaction(client, { ...prepared, account } as never)

    const receipt = await sendRawTransactionSync(client, {
      serializedTransaction: serialized as never,
    })

    if (receipt.status !== 'success')
      throw new Error(`${functionName} transaction reverted: ${receipt.transactionHash}`)

    return receipt.transactionHash
  }

  async function toState(): Promise<ReclaimChannelState> {
    const channel = await readChannel()

    const closeRequestedAt = Number(channel.closeRequestedAt)
    const closeRequested = closeRequestedAt !== 0
    const readyAt = closeRequested ? closeRequestedAt + Number(await readGrace()) : undefined

    return {
      finalized: channel.finalized,
      closeRequested,
      closeRequestedAt,
      readyAt,
      ready:
        readyAt !== undefined && Math.floor(Date.now() / 1000) >= readyAt && !channel.finalized,
      deposit: channel.deposit,
      settled: channel.settled,
      refundable: channel.deposit - channel.settled,
      payer: channel.payer,
      payee: channel.payee,
    }
  }

  return {
    channelId,
    escrowContract,

    getState: toState,

    async requestClose() {
      const state = await toState()
      if (state.finalized || state.closeRequested) return undefined
      return send('requestClose')
    },

    async withdraw() {
      const state = await toState()
      if (state.finalized) return undefined
      if (!state.closeRequested)
        throw new Error(
          `Channel ${channelId} has no pending close. Call requestClose() first, then withdraw() after the grace period.`
        )
      if (!state.ready) throw new ChannelNotReadyError(channelId, state.readyAt!)
      return send('withdraw')
    },
  }
}
