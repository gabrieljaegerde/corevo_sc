import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { keccak256, encodePacked, hexToBytes, bytesToHex } from "viem";

// ─── X25519 key derivation from wallet signature ─────────────────

const KEY_DERIVATION_MESSAGE =
  "CoReVo encryption key derivation.\n\nSigning this message derives your X25519 encryption key pair.\nNo funds are transferred.";

export interface EncryptionKeyPair {
  publicKey: Uint8Array; // 32 bytes
  secretKey: Uint8Array; // 32 bytes
}

/**
 * Derive a deterministic X25519 key pair by signing a fixed message.
 * The signature is hashed to produce the secret key material.
 */
export async function deriveKeyPair(
  signMessage: (args: { message: string }) => Promise<`0x${string}`>
): Promise<EncryptionKeyPair> {
  const sig = await signMessage({ message: KEY_DERIVATION_MESSAGE });
  // Hash the signature to get 32 bytes of key material
  const hash = keccak256(sig);
  const secretKey = hexToBytes(hash);
  const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
  return { publicKey: keyPair.publicKey, secretKey: keyPair.secretKey };
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
  // Prepend nonce
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
