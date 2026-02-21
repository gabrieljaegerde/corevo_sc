import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { COREVO_ABI } from "../abi";
import { getContractAddress, config } from "../wagmi";
import { pubKeyToBytes32, seedToHex, getSeedFromUrl, type EncryptionKeyPair } from "../crypto";
import { useState } from "react";

interface Props {
  keyPair: EncryptionKeyPair;
}

export default function KeyStatus({ keyPair }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const CONTRACT_ADDRESS = getContractAddress(chainId);
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data: onChainKey, refetch } = useReadContract({
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
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: COREVO_ABI,
        functionName: "announceKey",
        args: [pubKeyToBytes32(keyPair.publicKey)],
      });
      await waitForTransactionReceipt(config, { hash });
      await refetch();
    } catch (e: any) {
      setError(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  if (keysMatch) {
    return (
      <section className="card key-status key-status-ok">
        <h3 className="success">Key registered on-chain</h3>
        <p className="dim">
          You're all set. Your encryption key is active and published.
        </p>
        {seedHex && (
          <details className="seed-details">
            <summary>Backup: show secret seed</summary>
            <code className="seed-value">{seedHex}</code>
            <p className="dim" style={{ marginTop: 4 }}>
              This seed is in your URL fragment. Keep your bookmark safe.
            </p>
          </details>
        )}
      </section>
    );
  }

  return (
    <section className="card key-status">
      <h3>Encryption Key Setup</h3>

      <div className="key-steps">
        <div className="key-step done">
          <span className="key-step-num">1</span>
          <span>Encryption key generated from your URL seed</span>
        </div>
        <div className="key-step done">
          <span className="key-step-num">2</span>
          <span>Wallet connected</span>
        </div>
        <div className="key-step">
          <span className="key-step-num">3</span>
          <span>
            Announce your public key on-chain so others can encrypt votes for you
          </span>
        </div>
      </div>

      <p className="dim" style={{ margin: "10px 0" }}>
        Never share your full URL — it contains your secret encryption seed.
      </p>

      {seedHex && (
        <details className="seed-details">
          <summary>Show secret seed</summary>
          <code className="seed-value">{seedHex}</code>
        </details>
      )}

      {!keysMatch && hasOnChainKey && (
        <p className="warn" style={{ marginTop: 8 }}>
          On-chain key differs from your current seed. Announcing will update it.
        </p>
      )}

      <button className="primary" onClick={handleAnnounce} disabled={busy} style={{ marginTop: 10 }}>
        {busy
          ? <><span className="spinner" />Confirming...</>
          : hasOnChainKey
            ? "Update Key On-Chain"
            : "Announce Key On-Chain"}
      </button>

      {error && <p className="error">{error}</p>}
    </section>
  );
}
