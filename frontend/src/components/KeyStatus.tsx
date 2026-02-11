import { useAccount, useReadContract, useWriteContract, useSignMessage } from "wagmi";
import { COREVO_ABI } from "../abi";
import { CONTRACT_ADDRESS } from "../wagmi";
import { deriveKeyPair, pubKeyToBytes32, type EncryptionKeyPair } from "../crypto";
import { useState } from "react";

interface Props {
  keyPair: EncryptionKeyPair | null;
  onKeyPairDerived: (kp: EncryptionKeyPair) => void;
}

export default function KeyStatus({ keyPair, onKeyPairDerived }: Props) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data: onChainKey } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "encryptionKeys",
    args: address ? [address] : undefined,
  });

  const hasOnChainKey =
    onChainKey && onChainKey !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  const localPubHex = keyPair ? pubKeyToBytes32(keyPair.publicKey) : null;
  const keysMatch = hasOnChainKey && localPubHex === onChainKey;

  async function handleDerive() {
    setBusy(true);
    setError("");
    try {
      const kp = await deriveKeyPair(signMessageAsync);
      onKeyPairDerived(kp);
    } catch (e: any) {
      setError(e.message || "Signature rejected");
    } finally {
      setBusy(false);
    }
  }

  async function handleAnnounce() {
    if (!keyPair) return;
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
      setError(e.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card key-status">
      <h3>Encryption Key</h3>

      {!keyPair && (
        <button onClick={handleDerive} disabled={busy}>
          {busy ? "Sign in wallet..." : "Derive Key Pair"}
        </button>
      )}

      {keyPair && !keysMatch && (
        <>
          <p className="dim">Key derived. Announce it on-chain so others can encrypt to you.</p>
          <button onClick={handleAnnounce} disabled={busy}>
            {busy ? "Confirming..." : "Announce Key On-Chain"}
          </button>
        </>
      )}

      {keysMatch && <p className="success">Key registered on-chain</p>}

      {keyPair && !keysMatch && hasOnChainKey && (
        <p className="warn">
          On-chain key differs from derived key. Re-announcing will update it.
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
