import { z } from 'zod'

// btoa/atob operate on binary strings, so bytes are bridged through a binary
// string in fixed-size chunks. Spreading a whole Uint8Array into
// String.fromCharCode overflows the call stack on large payloads (response
// bodies), which is why the conversion is chunked.
const CHUNK_SIZE = 0x8000

export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE))
  }

  return btoa(binary)
}

export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/**
 * Bidirectional base64 <-> bytes codec.
 *
 * Decoding (response side) turns the base64 string on the wire into a
 * `Uint8Array`; encoding (request side) turns a `Uint8Array` back into base64.
 * The client runs request schemas through `z.encode` and response schemas
 * through `parse` (the decode direction), so this single codec handles both
 * directions wherever it appears in a schema.
 */
export const Base64Bytes = z.codec(z.base64(), z.instanceof(Uint8Array), {
  decode: decodeBase64,
  encode: encodeBase64,
})
