import { useState, useEffect } from "react";
import { useAccount, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { bytesToHex } from "viem";
import { COREVO_ABI } from "../abi";
import { CONTRACT_ADDRESS, config } from "../wagmi";
import {
  encryptSalt,
  bytes32ToPubKey,
  type EncryptionKeyPair,
} from "../crypto";
import nacl from "tweetnacl";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

interface Props {
  keyPair: EncryptionKeyPair | null;
  onCreated: () => void;
}

export default function CreateProposal({ keyPair, onCreated }: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();

  const [context, setContext] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [commitD, setCommitD] = useState(0);
  const [commitH, setCommitH] = useState(1);
  const [commitM, setCommitM] = useState(0);
  const [revealD, setRevealD] = useState(0);
  const [revealH, setRevealH] = useState(1);
  const [revealM, setRevealM] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Known addresses with announced keys
  const [knownAddresses, setKnownAddresses] = useState<`0x${string}`[]>([]);
  // Selected voters (checkboxes)
  const [selectedVoters, setSelectedVoters] = useState<Set<string>>(new Set());
  // Additional manually entered addresses
  const [extraInput, setExtraInput] = useState("");

  // Read current user's on-chain key directly (reliable fallback)
  const { data: myOnChainKey } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "encryptionKeys",
    args: address ? [address] : undefined,
  });

  // Fetch all KeyAnnounced events to build the known address list
  useEffect(() => {
    if (!client) return;
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: CONTRACT_ADDRESS,
          abi: COREVO_ABI,
          eventName: "KeyAnnounced",
          fromBlock: 0n,
        });
        // Deduplicate — keep latest per address
        const seen = new Set<string>();
        const addrs: `0x${string}`[] = [];
        for (let i = logs.length - 1; i >= 0; i--) {
          const addr = logs[i].args.account as `0x${string}`;
          const lower = addr.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            addrs.push(addr);
          }
        }
        setKnownAddresses(addrs);
      } catch {
        // Event fetching may fail on some RPCs
      }
    })();
  }, [client]);

  // Ensure current user appears in knownAddresses if they have an on-chain key
  useEffect(() => {
    if (!address || !myOnChainKey || myOnChainKey === ZERO) return;
    setKnownAddresses((prev) => {
      if (prev.some((a) => a.toLowerCase() === address.toLowerCase())) return prev;
      return [address, ...prev];
    });
  }, [address, myOnChainKey]);

  // Pre-select the creator's address
  useEffect(() => {
    if (address) {
      setSelectedVoters((prev) => {
        const next = new Set(prev);
        next.add(address.toLowerCase());
        return next;
      });
    }
  }, [address]);

  // Parse extra manually entered addresses
  const extraAddresses = extraInput
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^0x[0-9a-fA-F]{40}$/i.test(s)) as `0x${string}`[];

  // Combined voter list: selected known + extra manual
  const allVoters: `0x${string}`[] = (() => {
    const seen = new Set<string>();
    const result: `0x${string}`[] = [];
    for (const addr of knownAddresses) {
      if (selectedVoters.has(addr.toLowerCase())) {
        seen.add(addr.toLowerCase());
        result.push(addr);
      }
    }
    for (const addr of extraAddresses) {
      if (!seen.has(addr.toLowerCase())) {
        seen.add(addr.toLowerCase());
        result.push(addr);
      }
    }
    return result;
  })();

  function toggleVoter(addr: string) {
    setSelectedVoters((prev) => {
      const next = new Set(prev);
      const key = addr.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleCreate() {
    if (!keyPair) {
      setError("Announce your encryption key first.");
      return;
    }
    if (!context.trim()) {
      setError("Enter a voting context.");
      return;
    }
    if (allVoters.length === 0) {
      setError("Select at least one voter.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const commonSalt = nacl.randomBytes(32);
      const commonSaltAsHex = bytesToHex(commonSalt);

      let encryptedSalts: `0x${string}`[];

      if (isPublic) {
        encryptedSalts = allVoters.map(() => commonSaltAsHex);
      } else {
        const encSalts: `0x${string}`[] = [];
        for (const voter of allVoters) {
          const onChainKey = await readEncryptionKey(voter);
          if (!onChainKey || onChainKey === ZERO) {
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
          context,
          allVoters,
          encryptedSalts,
          isPublic,
          BigInt((commitD * 86400) + (commitH * 3600) + (commitM * 60)),
          BigInt((revealD * 86400) + (revealH * 3600) + (revealM * 60)),
        ],
      });
      await waitForTransactionReceipt(config, { hash });

      onCreated();
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

  const isMe = (addr: string) =>
    address && addr.toLowerCase() === address.toLowerCase();

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

      {/* ── Known addresses with on-chain keys ─────────────── */}
      <label>Voters</label>
      {knownAddresses.length > 0 ? (
        <ul className="voter-select">
          {knownAddresses.map((addr) => (
            <li key={addr} className="voter-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedVoters.has(addr.toLowerCase())}
                  onChange={() => toggleVoter(addr)}
                />
                <span className="mono">
                  {addr.slice(0, 8)}...{addr.slice(-4)}
                </span>
                {isMe(addr) && <span className="badge phase-0">you</span>}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim">No addresses with announced keys found.</p>
      )}

      <label>
        Additional addresses
        <textarea
          rows={2}
          placeholder={"0xAbc...\n0xDef..."}
          value={extraInput}
          onChange={(e) => setExtraInput(e.target.value)}
        />
      </label>

      <p className="dim">
        {allVoters.length} voter{allVoters.length !== 1 ? "s" : ""} selected
      </p>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        Public proposal (common salt visible to everyone)
      </label>

      <label>Commit phase duration</label>
      <div className="row">
        <label>Days<input type="number" min={0} value={commitD} onChange={(e) => setCommitD(Number(e.target.value))} /></label>
        <label>Hours<input type="number" min={0} max={23} value={commitH} onChange={(e) => setCommitH(Number(e.target.value))} /></label>
        <label>Min<input type="number" min={0} max={59} value={commitM} onChange={(e) => setCommitM(Number(e.target.value))} /></label>
      </div>

      <label>Reveal phase duration</label>
      <div className="row">
        <label>Days<input type="number" min={0} value={revealD} onChange={(e) => setRevealD(Number(e.target.value))} /></label>
        <label>Hours<input type="number" min={0} max={23} value={revealH} onChange={(e) => setRevealH(Number(e.target.value))} /></label>
        <label>Min<input type="number" min={0} max={59} value={revealM} onChange={(e) => setRevealM(Number(e.target.value))} /></label>
      </div>

      <button onClick={handleCreate} disabled={busy || !keyPair}>
        {busy ? "Creating..." : "Create Proposal"}
      </button>

      {error && <p className="error">{error}</p>}
    </section>
  );
}
