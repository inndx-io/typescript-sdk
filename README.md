# inndx TypeScript SDK

A TypeScript client for the inndx API. It handles request signing and crypto payments for you: ordinary endpoints are billed per request, and session endpoints open a payment channel you can spend against repeatedly before settling on-chain.

The SDK is ESM only and ships its types. It targets Node 20 or newer (it uses `Symbol.asyncDispose` for `await using`).

## Installation

This package is not published to the npm registry. Depend on it directly from git. pnpm is recommended, since it runs the package's `prepare` build step on install, so you get the compiled `dist/` automatically.

Add it from the default branch:

```bash
pnpm add github:inndx-io/typescript-sdk
```

Pin a specific tag or commit (recommended for reproducible installs):

```bash
pnpm add github:inndx-io/typescript-sdk#v0.1.2
pnpm add github:inndx-io/typescript-sdk#<commit-sha>
```

Or declare it in `package.json` and run `pnpm install`:

```json
{
  "dependencies": {
    "@inndx-io/sdk": "github:inndx-io/typescript-sdk#main"
  }
}
```

## Quick start

```ts
import { InndxClient } from '@inndx-io/sdk'

const client = new InndxClient({
  baseUrl: 'https://api.inndx.io',
  walletKey: process.env.WALLET_PRIVATE_KEY as `0x${string}`,
})

const pong = await client.ping()
console.log(pong)
```

`client.ping()` is a free reachability check and is not billed. Paid top-level calls are billed per request: the SDK answers the server's payment challenge automatically using your wallet, with no channel to manage.

## Configuration

`new InndxClient(config)` accepts:

| Option | Required | Description |
| --- | --- | --- |
| `baseUrl` | yes | Base URL of the inndx API. |
| `walletKey` | a signer | Wallet private key in `0x...` hex form. Used to sign payments. Server side. |
| `account` | a signer | A prebuilt viem account (passkey/WebCrypto/custom signer). |
| `getConnectorClient` | a signer | Wagmi-style connector accessor for browser signing. See [Browser and wagmi](#browser-and-wagmi). |
| `maxDeposit` | for sessions | Default escrow cap per session, in human units (for example `"10"`). Overridable per session via `SessionOptions`. |
| `chainId` | for reclaim | Chain id the client targets. Needed by `reclaimSession` so it can work without the server. Sessions otherwise infer the chain from the server. |
| `headers` | no | Headers added to every request. |
| `fetch` | no | Custom `fetch` implementation. |
| `acceptPaymentOrigins` | no | Origins allowed to receive payments. Defaults to inndx origins. |
| `rpcUrl` | no | RPC endpoint applied to every chain. |
| `rpcUrls` | no | Per chain id RPC endpoints. |
| `feePayerUrl` | no | Fee-payer relay URL so a third party covers gas. |
| `getClient` | no | Advanced. Full control over the viem client per chain id. |
| `client` | no | Advanced. A prebuilt viem client used for every chain id. |
| `escrowContract` | no | Advanced. Escrow contract override. Normally derived from the server challenge. |

Supply exactly one signer: `walletKey`, `account`, or `getConnectorClient`. Passing more than one, or none, throws at construction.

## Browser and wagmi

In the browser you should never hold a private key. Instead, sign through a connected wallet using [wagmi](https://wagmi.sh). Pass its `getConnectorClient` action so the SDK resolves the signing account from the wallet:

```ts
import { InndxClient } from '@inndx-io/sdk'
import { getConnectorClient } from 'wagmi/actions'
import { wagmiConfig } from './wagmi'

const client = new InndxClient({
  baseUrl: 'https://api.inndx.io',
  getConnectorClient: (parameters) => getConnectorClient(wagmiConfig, parameters),
  maxDeposit: '10',
})
```

The connector client carries both the wallet account and the network transport, so `getConnectorClient` doubles as the network client and takes precedence over `getClient`/`client`/`rpcUrl(s)`. Charges, sessions, and reclaim all prompt the wallet to sign rather than signing locally. Reclaim prompts twice, once for `requestClose` and once later for `withdraw`.

## Sessions

A session is a payment channel scoped to a single operation. You open it by calling the operation method on a resource client, make as many requests as you want against it without waiting on a chain transaction each time, then close it to settle on-chain.

Each operation method (such as `scrapeUrl` or `scrapeUrlMarkdown`) is the session opener. It returns a `SessionScope` whose only request method is `call(...)`, typed to match that operation. This means a session opened for scraping can only make scrape requests, which is what the payment channel is scoped to on-chain.

Open a session, call it, close it explicitly:

```ts
const session = client.scrape.scrapeUrlMarkdown({ maxDeposit: '5' })

const page1 = await session.call('https://example.com')
const page2 = await session.call('https://example.com/about')

const receipt = await session.close()
```

Use `scope()` to run a block that always settles, even if your code throws:

```ts
const page = await client.scrape.scrapeUrlMarkdown({ maxDeposit: '5' }).scope(async (session) => {
  const result = await session.call('https://example.com')
  console.log('spent so far:', session.cumulative)
  return result
})
```

Use `await using` to settle automatically when the block exits:

```ts
await using session = client.scrape.scrapeUrlMarkdown({ maxDeposit: '5' })

const page = await session.call('https://example.com')
const receipt = await session.close()

if (receipt) {
  console.log('channel:', receipt.channelId)
  console.log('settlement tx:', receipt.txHash)
}
```

If you do not use `scope()` or `await using`, call `close()` yourself when you are done. A session owns exactly one channel, and the channel opens lazily on the first `call()`.

### Session options

Each operation method accepts an optional `SessionOptions` object:

| Option | Description |
| --- | --- |
| `maxDeposit` | Escrow cap for this session, in human units (for example `"10"`). Overrides the client-level `maxDeposit`. |
| `escrowContract` | Escrow contract for this session. Overrides the client-level `escrowContract`. |

### SessionScope properties and methods

| Member | Description |
| --- | --- |
| `call(...args)` | Makes a request through the session. Arguments and return type match the operation. |
| `close()` | Settles the channel on-chain and returns the receipt, or `undefined` if nothing was opened. |
| `scope(cb)` | Runs `cb(session)`, then settles regardless of outcome. Callback error takes priority. |
| `channelId` | The channel id once opened, otherwise `undefined`. |
| `cumulative` | The cumulative amount spent so far. |
| `opened` | Whether the channel has been opened. |
| `escrowContract` | The escrow contract this session targets, when set. |
| `open(options?)` | Opens the channel eagerly. Normally unnecessary since the first `call()` opens it. |

## Reclaiming a stranded channel

A session holds its channel state in memory. If your process exits before you call `close()`, the channel's escrow deposit is left on-chain with no in-memory handle to settle it. `reclaimSession` recovers those funds directly on-chain, without the server, using a forced close.

To use it, persist the channel id (available as `session.channelId` once the channel opens) somewhere durable. If you have not pinned `escrowContract` on the client config, persist `session.escrowContract` too. Also set `chainId` on the client so reclaim knows which network to talk to.

Forced close is a two-step sequence with a grace period (15 minutes) between the steps, required by the protocol to give the server a last chance to settle:

```ts
const reclaim = client.reclaimSession({ channelId })

// Step 1: start the close timer.
await reclaim.requestClose()

// Step 2: after the grace period, finalize and get the deposit back.
const state = await reclaim.getState()
if (state.ready) {
  await reclaim.withdraw()
}
```

The two steps do not need to run in the same process. `requestClose` records the timer on-chain, so a completely separate process started later can construct the same `reclaimSession({ channelId })`, check `getState()`, and call `withdraw()` once `state.ready` is true. Calling `withdraw()` before the grace period elapses throws `ChannelNotReadyError`, which carries a `readyAt` timestamp.

`getState()` returns the on-chain channel state, including `deposit`, `settled`, `refundable` (what you get back), `closeRequested`, `readyAt`, `ready`, and `finalized`.

Both `requestClose()` and `withdraw()` are idempotent: they return `undefined` instead of sending a duplicate transaction if the close was already requested or the channel is already finalized. The reclaim transactions are sent by your wallet (the payer), which pays gas unless you configured a `feePayerUrl`.

## Scrape

`client.scrape` exposes the scraping operations. Each method opens a session for that operation and returns a `SessionScope`.

Get a page as markdown:

```ts
const session = client.scrape.scrapeUrlMarkdown({ maxDeposit: '5' })
const markdown = await session.call('https://example.com')
await session.close()
```

Pass request options through (for example a header):

```ts
const markdown = await session.call('https://example.com', {
  headers: { 'X-Scrape-Proxy': 'isp' },
})
```

For structured input and control over formats and other options, use `scrapeUrl`:

```ts
const session = client.scrape.scrapeUrl({ maxDeposit: '5' })

const result = await session.call({
  url: 'https://example.com',
  formats: [{ kind: 'markdown' }],
  proxy: 'isp',
  timeout_seconds: 30,
})

for (const item of result.results) {
  if (item.kind === 'markdown') console.log(item.content)
}

await session.close()
```

`scrapeUrl` returns `{ url, results }`, where each result is one of `markdown`, `html`, `json`, or `binary` (binary content is decoded from base64 for you).

## Error handling

Non-2xx responses throw `ApiError`, which carries the status, the parsed error body, and the raw `Response`:

```ts
import { ApiError } from '@inndx-io/sdk'

try {
  await client.ping()
} catch (err) {
  if (err instanceof ApiError) {
    console.error(err.status, err.body)
  } else {
    throw err
  }
}
```

## Development

```bash
pnpm install
pnpm build       # compile to dist/ with tsdown
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check
```
