/**
 * Commit-reveal fairness (§13.2). Before a match the server generates a random
 * `seed`, publishes `commitment(seed)` = SHA-256(seed); after the match it
 * reveals `seed` so players can verify the shuffle/dice were not manipulated.
 *
 * Uses the Web Crypto global (`crypto.subtle` / `getRandomValues`), available in
 * Node 22 and browsers — no Node-only imports, so this stays platform-neutral.
 */

interface WebCryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: { digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> };
}

const webcrypto = (globalThis as unknown as { crypto: WebCryptoLike }).crypto;

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Cryptographically-random hex seed (default 16 bytes / 128 bits). */
export function generateSeed(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  webcrypto.getRandomValues(buf);
  return bytesToHex(buf);
}

/** SHA-256 commitment of a seed, as lowercase hex. */
export async function commitment(seed: string): Promise<string> {
  const data = new TextEncoder().encode(seed);
  const digest = await webcrypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

/** Verify a revealed seed against a previously published commitment. */
export async function verifySeed(seed: string, published: string): Promise<boolean> {
  return (await commitment(seed)) === published;
}
