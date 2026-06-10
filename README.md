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
pnpm add github:inndx-io/typescript-sdk#v0.1.0
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
| `walletPrivateKey` | yes | Wallet private key in `0x...` hex form. Used to sign payments. |
| `maxDeposit` | for sessions | Default escrow cap per session, in human units (for example `"10"`). Overridable per `client.session({ maxDeposit })`. |
| `headers` | no | Headers added to every request. |
| `fetch` | no | Custom `fetch` implementation. |
| `acceptPaymentOrigins` | no | Origins allowed to receive payments. Defaults to inndx origins. |
| `rpcUrl` | no | RPC endpoint applied to every chain. |
| `rpcUrls` | no | Per chain id RPC endpoints. |
| `feePayerUrl` | no | Fee-payer relay URL so a third party covers gas. |
| `getClient` | no | Advanced. Full control over the viem client per chain id. |
| `client` | no | Advanced. A prebuilt viem client used for every chain id. |
| `escrowContract` | no | Advanced. Escrow contract override. Normally derived from the server challenge. |

## Sessions

A session is a payment channel. You open it once, make as many requests as you want against it without waiting on a chain transaction each time, then close it to settle on-chain. Session-billed resources (such as scraping) live on the session scope.

Use `withSession` to run work in a scope that always settles, even if your code throws:

```ts
const markdown = await client.withSession({ maxDeposit: '5' }, async (session) => {
  const page = await session.scrape.scrapeUrlMarkdown(
    'https://www.conventionalcommits.org/en/v1.0.0/',
  )

  console.log('spent so far:', session.cumulative)
  return page
})
```

Or manage the scope yourself with `await using`, which closes the channel when the scope exits:

```ts
await using session = client.session({ maxDeposit: '5' })

const page = await session.scrape.scrapeUrlMarkdown('https://example.com')
const receipt = await session.close()

if (receipt) {
  console.log('channel:', receipt.channelId)
  console.log('settlement tx:', receipt.txHash)
}
```

If you do not use `withSession` or `await using`, call `session.close()` yourself when you are done. A scope owns exactly one channel, and the channel opens lazily on the first request.

The session scope exposes:

- `scrape` — the scrape client (see below).
- `channelId` — the channel id once opened, otherwise `undefined`.
- `cumulative` — the cumulative amount spent so far.
- `opened` — whether the channel has been opened.
- `open(options?)` — open the channel eagerly. Normally unnecessary, since the first request opens it.
- `close()` — settle the channel on-chain and return the receipt, or `undefined` if nothing was opened.

## Scrape

The scrape client is available on a session scope as `session.scrape`.

Get a page as markdown:

```ts
const markdown = await session.scrape.scrapeUrlMarkdown('https://example.com')
```

Pass request options through (for example a header):

```ts
const markdown = await session.scrape.scrapeUrlMarkdown('https://example.com', {
  headers: { 'X-Scrape-Proxy': 'isp' },
})
```

For structured input and control over formats and other options, use `scrapeUrl`:

```ts
const result = await session.scrape.scrapeUrl({
  url: 'https://example.com',
  formats: [{ kind: 'markdown' }],
  proxy: 'isp',
  timeout_seconds: 30,
})

for (const item of result.results) {
  if (item.kind === 'markdown') console.log(item.content)
}
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
