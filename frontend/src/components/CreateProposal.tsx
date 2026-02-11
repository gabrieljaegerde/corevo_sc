import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { keccak256, toHex, bytesToHex } from "viem";
import { COREVO_ABI } from "../abi";
import { CONTRACT_ADDRESS } from "../wagmi";
import {
  encryptSalt,
  bytes32ToPubKey,
  type EncryptionKeyPair,
} from "../crypto";
import nacl from "tweetnacl";

interface Props {
  keyPair: EncryptionKeyPair | null;
  onCreated: (id: bigint) => void;
}

export default function CreateProposal({ keyPair, onCreated }: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();

  const [context, setContext] = useState("");
  const [voterInput, setVoterInput] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [commitMinutes, setCommitMinutes] = useState(60);
  const [revealMinutes, setRevealMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [commonSaltHex, setCommonSaltHex] = useState<string | null>(null);

  const voters = voterInput
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s)) as `0x${string}`[];

  async function handleCreate() {
    if (!keyPair) {
      setError("Derive your encryption key first.");
      return;
    }
    if (!context.trim()) {
      setError("Enter a voting context.");
      return;
    }
    if (voters.length === 0) {
      setError("Add at least one valid voter address.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const contextHash = keccak256(toHex(context));
      const commonSalt = nacl.randomBytes(32);
      const commonSaltAsHex = bytesToHex(commonSalt);
      setCommonSaltHex(commonSaltAsHex);

      let encryptedSalts: `0x${string}`[];

      if (isPublic) {
        // Public proposal: pass commonSalt in plaintext for each voter
        encryptedSalts = voters.map(() => commonSaltAsHex);
      } else {
        // Private proposal: encrypt commonSalt to each voter's on-chain key
        const encSalts: `0x${string}`[] = [];
        for (const voter of voters) {
          const onChainKey = await readEncryptionKey(voter);
          if (
            !onChainKey ||
            onChainKey ===
              "0x0000000000000000000000000000000000000000000000000000000000000000"
          ) {
            throw new Error(
              `Voter ${voter.slice(0, 8)}... has no encryption key registered.`
            );
          }
          const recipientPub = bytes32ToPubKey(onChainKey as `0x${string}`);
          const encrypted = encryptSalt(
            commonSalt,
            recipientPub,
            keyPair.secretKey
          );
          encSalts.push(bytesToHex(encrypted));
        }
        encryptedSalts = encSalts;
      }

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: COREVO_ABI,
        functionName: "createProposal",
        args: [
          contextHash,
          voters,
          encryptedSalts,
          isPublic,
          BigInt(commitMinutes * 60),
          BigInt(revealMinutes * 60),
        ],
      });

      // The proposal ID is proposalCount - 1 at the time of creation.
      // For simplicity, read it after tx.
      // We'll just redirect to the proposal list.
      onCreated(0n); // Will be picked up from the list
    } catch (e: any) {
      setError(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  async function readEncryptionKey(voter: `0x${string}`): Promise<string | undefined> {
    if (!client) return undefined;
    return client.readContract({
      address: CONTRACT_ADDRESS,
      abi: COREVO_ABI,
      functionName: "encryptionKeys",
      args: [voter],
    }) as Promise<string>;
  }

  return (
    <section className="card">
      <h3>New Proposal</h3>

      <label>
        Voting Context
        <input
          type="text"
          placeholder="e.g. RFC-42: adopt cats in the office"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </label>

      <label>
        Voter Addresses (one per line or comma-separated)
        <textarea
          rows={4}
          placeholder={"0xAbc...\n0xDef..."}
          value={voterInput}
          onChange={(e) => setVoterInput(e.target.value)}
        />
      </label>
      <p className="dim">{voters.length} valid address{voters.length !== 1 ? "es" : ""}</p>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        Public proposal (common salt visible to everyone)
      </label>

      <div className="row">
        <label>
          Commit phase (min)
          <input
            type="number"
            min={1}
            value={commitMinutes}
            onChange={(e) => setCommitMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          Reveal phase (min)
          <input
            type="number"
            min={1}
            value={revealMinutes}
            onChange={(e) => setRevealMinutes(Number(e.target.value))}
          />
        </label>
      </div>

      <button onClick={handleCreate} disabled={busy || !keyPair}>
        {busy ? "Creating..." : "Create Proposal"}
      </button>

      {commonSaltHex && (
        <div className="salt-backup">
          <p className="warn">
            Save this common salt — you need it to verify votes later:
          </p>
          <code>{commonSaltHex}</code>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}
