import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { COREVO_ABI } from "../abi";
import { CONTRACT_ADDRESS } from "../wagmi";
import { pubKeyToBytes32, seedToHex, getSeedFromUrl, type EncryptionKeyPair } from "../crypto";
import { useState } from "react";

interface Props {
  keyPair: EncryptionKeyPair;
}

export default function KeyStatus({ keyPair }: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data: onChainKey } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "encryptionKeys",
    args: address ? [address] : undefined,
  });

  const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hasOnChainKey = onChainKey && onChainKey !== ZERO;
  const localPubHex = pubKeyToBytes32(keyPair.publicKey);
  const keysMatch = hasOnChainKey && localPubHex === onChainKey;

  const seed = getSeedFromUrl();
  const seedHex = seed ? seedToHex(seed) : null;

  async function handleAnnounce() {
    setBusy(true);
    setError("");
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: COREVO_ABI,
        functionName: "announceKey",
        args: [pubKeyToBytes32(keyPair.publicKey)],
      });
    } catch (e: any) {
      setError(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card key-status">
      <h3>Encryption Key</h3>

      <p className="dim">
        Your key is derived from the seed in the URL fragment.
        Bookmark this page to save it.
      </p>

      {seedHex && (
        <details className="seed-details">
          <summary>Show seed</summary>
          <code className="seed-value">{seedHex}</code>
        </details>
      )}

      {!keysMatch && (
        <button onClick={handleAnnounce} disabled={busy} style={{ marginTop: 8 }}>
          {busy
            ? "Confirming..."
            : hasOnChainKey
              ? "Update Key On-Chain"
              : "Announce Key On-Chain"}
        </button>
      )}

      {keysMatch && <p className="success">Key registered on-chain</p>}

      {!keysMatch && hasOnChainKey && (
        <p className="warn">
          On-chain key differs from your current seed. Announcing will update it.
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
