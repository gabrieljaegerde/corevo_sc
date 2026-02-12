import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { keccak256, encodePacked, hexToBytes, bytesToHex } from "viem";

// ─── X25519 key derivation from seed ─────────────────────────────

export interface EncryptionKeyPair {
  publicKey: Uint8Array; // 32 bytes
  secretKey: Uint8Array; // 32 bytes
}

/**
 * Derive an X25519 key pair from a 32-byte seed.
 */
export function keyPairFromSeed(seed: Uint8Array): EncryptionKeyPair {
  const kp = nacl.box.keyPair.fromSecretKey(seed);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/**
 * Generate a fresh random 32-byte seed.
 */
export function generateSeed(): Uint8Array {
  return nacl.randomBytes(32);
}

/**
 * Encode a seed as a hex string (no 0x prefix) for URL fragment use.
 */
export function seedToHex(seed: Uint8Array): string {
  return bytesToHex(seed).slice(2); // strip 0x
}

/**
 * Decode a hex string (with or without 0x prefix) back to a seed.
 * Returns null if invalid.
 */
export function seedFromHex(hex: string): Uint8Array | null {
  const clean = hex.startsWith("0x") ? hex : `0x${hex}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(clean)) return null;
  return hexToBytes(clean as `0x${string}`);
}

// ─── URL fragment helpers ────────────────────────────────────────

const FRAGMENT_KEY = "seed";

/**
 * Read the encryption seed from the URL hash fragment.
 * Expected format: #seed=<64 hex chars>
 */
export function getSeedFromUrl(): Uint8Array | null {
  const hash = window.location.hash.slice(1); // strip #
  const params = new URLSearchParams(hash);
  const raw = params.get(FRAGMENT_KEY);
  if (!raw) return null;
  return seedFromHex(raw);
}

/**
 * Write the encryption seed into the URL hash fragment (no page reload).
 */
export function setSeedInUrl(seed: Uint8Array): void {
  const hex = seedToHex(seed);
  window.history.replaceState(null, "", `#${FRAGMENT_KEY}=${hex}`);
}

/**
 * Ensure a seed exists in the URL. If not, generate one.
 * Returns the key pair derived from the seed.
 */
export function ensureKeyPair(): EncryptionKeyPair {
  let seed = getSeedFromUrl();
  if (!seed) {
    seed = generateSeed();
    setSeedInUrl(seed);
  }
  return keyPairFromSeed(seed);
}

// ─── NaCl box encryption (X25519 + XSalsa20-Poly1305) ────────────

/**
 * Encrypt a common salt to a recipient's X25519 public key.
 * Returns: nonce (24 bytes) || ciphertext
 */
export function encryptSalt(
  commonSalt: Uint8Array,
  recipientPubKey: Uint8Array,
  senderSecretKey: Uint8Array
): Uint8Array {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(commonSalt, nonce, recipientPubKey, senderSecretKey);
  if (!encrypted) throw new Error("Encryption failed");
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}

/**
 * Decrypt an encrypted common salt.
 * Input: nonce (24 bytes) || ciphertext
 */
export function decryptSalt(
  encrypted: Uint8Array,
  senderPubKey: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array | null {
  const nonce = encrypted.slice(0, nacl.box.nonceLength);
  const ciphertext = encrypted.slice(nacl.box.nonceLength);
  return nacl.box.open(ciphertext, nonce, senderPubKey, recipientSecretKey);
}

// ─── Vote commitment ─────────────────────────────────────────────

export const VOTE = { Aye: 1, Nay: 2, Abstain: 3 } as const;
export type VoteValue = (typeof VOTE)[keyof typeof VOTE];
export const VOTE_LABELS: Record<number, string> = {
  1: "Aye",
  2: "Nay",
  3: "Abstain",
};

/**
 * Compute the commitment hash exactly as the contract does:
 * keccak256(abi.encodePacked(uint8(vote), oneTimeSalt, commonSalt))
 */
export function computeCommitment(
  vote: VoteValue,
  oneTimeSalt: `0x${string}`,
  commonSalt: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodePacked(["uint8", "bytes32", "bytes32"], [vote, oneTimeSalt, commonSalt])
  );
}

/**
 * Verify a vote off-chain: try all 3 options against a commitment.
 * Returns the vote value if found, null otherwise.
 */
export function verifyVote(
  commitment: `0x${string}`,
  oneTimeSalt: `0x${string}`,
  commonSalt: `0x${string}`
): VoteValue | null {
  for (const v of [VOTE.Aye, VOTE.Nay, VOTE.Abstain]) {
    if (computeCommitment(v, oneTimeSalt, commonSalt) === commitment) {
      return v;
    }
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────

export function randomSalt(): `0x${string}` {
  return bytesToHex(nacl.randomBytes(32));
}

export function pubKeyToBytes32(pubKey: Uint8Array): `0x${string}` {
  return bytesToHex(pubKey);
}

export function bytes32ToPubKey(hex: `0x${string}`): Uint8Array {
  return hexToBytes(hex);
}

export { encodeBase64, decodeBase64 };
