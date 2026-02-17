import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { COREVO_ABI } from "../abi";
import { CONTRACT_ADDRESS, config } from "../wagmi";
import {
  computeCommitment,
  verifyVote,
  randomSalt,
  decryptSalt,
  bytes32ToPubKey,
  VOTE,
  VOTE_LABELS,
  type EncryptionKeyPair,
  type VoteValue,
} from "../crypto";
import { storeOneTimeSalt, getOneTimeSalt } from "../store";
import { bytesToHex, hexToBytes } from "viem";

const PHASE_LABELS = ["Commit", "Reveal", "Finished"] as const;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

function formatRemaining(deadlineSec: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(deadlineSec) - now;
  if (diff <= 0) return "ended";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

interface Props {
  proposalId: bigint;
  keyPair: EncryptionKeyPair | null;
  onBack: () => void;
}

export default function ProposalDetail({ proposalId, keyPair, onBack }: Props) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedVote, setSelectedVote] = useState<VoteValue>(VOTE.Aye);
  const [commonSaltInput, setCommonSaltInput] = useState("");
  const [tally, setTally] = useState<Record<string, number | null> | null>(
    null
  );
  const [decryptedCommonSalt, setDecryptedCommonSalt] = useState<string | null>(
    null
  );
  const [saltLoading, setSaltLoading] = useState(true);
  const [saltError, setSaltError] = useState(false);

  // ─── Contract reads ────────────────────────────────────────────

  const { data: proposal, refetch: refetchProposal } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "proposals",
    args: [proposalId],
  });

  const { data: voters } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "getVoters",
    args: [proposalId],
  });

  const { data: myCommitment, refetch: refetchCommitment } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "commitments",
    args: address ? [proposalId, address] : undefined,
  });

  const { data: myRevealedSalt, refetch: refetchReveal } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "revealedSalts",
    args: address ? [proposalId, address] : undefined,
  });

  const { data: amVoter } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "isVoter",
    args: address ? [proposalId, address] : undefined,
  });

  const { data: progress, refetch: refetchProgress } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "getRevealProgress",
    args: [proposalId],
  });

  // ─── Try to auto-decrypt commonSalt from invitation events ─────
  // Must be above the early return to respect React's rules of hooks.

  useEffect(() => {
    if (!keyPair || !address || !client || !proposal || decryptedCommonSalt) {
      if (!proposal) return; // still loading proposal
      setSaltLoading(false);
      return;
    }
    const [proposerAddr, , , proposalIsPublic] = proposal;
    setSaltLoading(true);
    setSaltError(false);
    (async () => {
      try {
        const logs = await client.getContractEvents({
          address: CONTRACT_ADDRESS,
          abi: COREVO_ABI,
          eventName: "VoterInvited",
          args: { proposalId, voter: address },
          fromBlock: 0n,
        });
        if (logs.length === 0) {
          setSaltLoading(false);
          return;
        }
        const encBytes = logs[0].args.encryptedSalt;
        if (!encBytes || encBytes === "0x") {
          setSaltLoading(false);
          return;
        }

        if (proposalIsPublic) {
          setDecryptedCommonSalt(encBytes as string);
          setCommonSaltInput(encBytes as string);
          setSaltLoading(false);
          return;
        }

        // Find proposer's on-chain encryption key
        const proposerKey = await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: COREVO_ABI,
          functionName: "encryptionKeys",
          args: [proposerAddr],
        });
        if (!proposerKey || proposerKey === ZERO_BYTES32) {
          setSaltLoading(false);
          return;
        }

        const senderPub = bytes32ToPubKey(proposerKey as `0x${string}`);
        const encrypted = hexToBytes(encBytes as `0x${string}`);
        const decrypted = decryptSalt(encrypted, senderPub, keyPair.secretKey);
        if (decrypted) {
          const hex = bytesToHex(decrypted);
          setDecryptedCommonSalt(hex);
          setCommonSaltInput(hex);
        }
      } catch {
        setSaltError(true);
      } finally {
        setSaltLoading(false);
      }
    })();
  }, [keyPair, address, client, proposalId, proposal, decryptedCommonSalt]);

  if (!proposal) {
    return (
      <section className="card">
        <button className="back" onClick={onBack}>Back</button>
        <p>Loading...</p>
      </section>
    );
  }

  const [
    proposer,
    context,
    phase,
    isPublic,
    commitDeadline,
    revealDeadline,
    voterCount,
    commitCount,
    revealCount,
  ] = proposal;

  const now = BigInt(Math.floor(Date.now() / 1000));

  // Compute effective phase from deadlines + on-chain phase.
  // The reveal deadline is soft — voters can still reveal after it.
  // We show "Reveal" until the proposal is finalized on-chain.
  let effectivePhase: number;
  if (now <= commitDeadline) {
    effectivePhase = 0; // Commit
  } else if (Number(phase) < 2) {
    effectivePhase = 1; // Reveal (soft deadline — open until finalized)
  } else {
    effectivePhase = 2; // Finished
  }

  const hasCommitted = myCommitment && myCommitment !== ZERO_BYTES32;
  const hasRevealed = myRevealedSalt && myRevealedSalt !== ZERO_BYTES32;
  const storedOts = address
    ? getOneTimeSalt(proposalId, address)
    : null;
  // Derive own vote: use on-chain revealedSalt if available, else localStorage
  const knownOts = hasRevealed
    ? (myRevealedSalt as string)
    : storedOts;
  const cs = commonSaltInput.trim();
  const myVote = (hasCommitted && knownOts && cs.length === 66)
    ? verifyVote(
        myCommitment as `0x${string}`,
        knownOts as `0x${string}`,
        cs as `0x${string}`
      )
    : null;

  const canCommit = effectivePhase === 0 && now <= commitDeadline && amVoter && !hasCommitted;
  const canReveal =
    !hasRevealed &&
    hasCommitted &&
    effectivePhase === 1 &&
    now > commitDeadline;
  const canFinalize = effectivePhase !== 2 && now > revealDeadline;

  // ─── Actions ───────────────────────────────────────────────────

  async function handleCommit() {
    if (!address) return;
    const cs = commonSaltInput.trim() as `0x${string}`;
    if (!cs || cs.length !== 66) {
      setError("Enter the common salt (0x... 66 chars).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ots = randomSalt();
      const commitment = computeCommitment(selectedVote, ots, cs);

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: COREVO_ABI,
        functionName: "commitVote",
        args: [proposalId, commitment],
      });
      await waitForTransactionReceipt(config, { hash });

      storeOneTimeSalt(proposalId, address, ots);
      await Promise.all([refetchProposal(), refetchCommitment(), refetchProgress()]);
    } catch (e: any) {
      setError(e.shortMessage || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReveal() {
    if (!address || !storedOts) return;
    setBusy(true);
    setError("");
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: COREVO_ABI,
        functionName: "revealSalt",
        args: [proposalId, storedOts as `0x${string}`],
      });
      await waitForTransactionReceipt(config, { hash });
      await Promise.all([refetchProposal(), refetchReveal(), refetchProgress()]);
    } catch (e: any) {
      setError(e.shortMessage || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    setBusy(true);
    setError("");
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: COREVO_ABI,
        functionName: "finalizeProposal",
        args: [proposalId],
      });
      await waitForTransactionReceipt(config, { hash });
      await refetchProposal();
    } catch (e: any) {
      setError(e.shortMessage || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (!client || !voters) return;
    const cs = commonSaltInput.trim() as `0x${string}`;
    if (!cs || cs.length !== 66) {
      setError("Enter the common salt to verify votes.");
      return;
    }
    setError("");
    try {
      const results: Record<string, number | null> = {};
      for (const voter of voters) {
        const commitment = await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: COREVO_ABI,
          functionName: "commitments",
          args: [proposalId, voter],
        });
        const salt = await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: COREVO_ABI,
          functionName: "revealedSalts",
          args: [proposalId, voter],
        });
        if (
          commitment === ZERO_BYTES32 ||
          salt === ZERO_BYTES32
        ) {
          results[voter] = null;
        } else {
          results[voter] = verifyVote(
            commitment as `0x${string}`,
            salt as `0x${string}`,
            cs
          );
        }
      }
      setTally(results);
    } catch (e: any) {
      setError(e.shortMessage || e.message);
    }
  }

  // ─── Tally summary ────────────────────────────────────────────

  let tallySummary: { aye: number; nay: number; abstain: number; unknown: number } | null =
    null;
  if (tally) {
    tallySummary = { aye: 0, nay: 0, abstain: 0, unknown: 0 };
    for (const v of Object.values(tally)) {
      if (v === VOTE.Aye) tallySummary.aye++;
      else if (v === VOTE.Nay) tallySummary.nay++;
      else if (v === VOTE.Abstain) tallySummary.abstain++;
      else tallySummary.unknown++;
    }
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <section className="card proposal-detail">
      <button className="back" onClick={onBack}>Back</button>

      <h3>Proposal #{proposalId.toString()}</h3>

      <table className="info-table">
        <tbody>
          <tr><td>Proposer</td><td className="mono">{proposer}</td></tr>
          <tr><td>Context</td><td>{context}</td></tr>
          <tr>
            <td>Phase</td>
            <td>
              <span className={`badge phase-${effectivePhase}`}>
                {PHASE_LABELS[effectivePhase]}
              </span>
              {isPublic && <span className="badge public">Public</span>}
            </td>
          </tr>
          <tr>
            <td>Commit deadline</td>
            <td>
              {formatRemaining(commitDeadline) === "ended"
                ? <span className="dim">ended</span>
                : <>{formatRemaining(commitDeadline)} remaining</>
              }
              {" "}<span className="dim">({new Date(Number(commitDeadline) * 1000).toLocaleString()})</span>
            </td>
          </tr>
          <tr>
            <td>Reveal deadline (soft)</td>
            <td>
              {formatRemaining(revealDeadline) === "ended"
                ? <span className="dim">ended — late reveals still accepted</span>
                : <>{formatRemaining(revealDeadline)} remaining</>
              }
              {" "}<span className="dim">({new Date(Number(revealDeadline) * 1000).toLocaleString()})</span>
            </td>
          </tr>
          <tr>
            <td>Progress</td>
            <td>
              {Number(commitCount)}/{Number(voterCount)} committed,{" "}
              {Number(revealCount)}/{Number(commitCount)} revealed
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Common salt input ─────────────────────────────────── */}
      {decryptedCommonSalt ? (
        <div className="salt-section">
          <p className="success dim">Common salt auto-loaded from invitation</p>
          <details className="seed-details">
            <summary>Show / edit common salt</summary>
            <input
              type="text"
              placeholder="0x..."
              value={commonSaltInput}
              onChange={(e) => setCommonSaltInput(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </details>
        </div>
      ) : saltLoading ? (
        <div className="salt-section">
          <p className="dim">Loading common salt from invitation...</p>
          <details className="seed-details">
            <summary>Enter manually instead</summary>
            <input
              type="text"
              placeholder="0x..."
              value={commonSaltInput}
              onChange={(e) => setCommonSaltInput(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </details>
        </div>
      ) : (
        <div className="salt-section">
          {saltError && (
            <p className="warn" style={{ marginBottom: 6 }}>
              Could not auto-load common salt from invitation.
            </p>
          )}
          <label>
            Common Salt
            <input
              type="text"
              placeholder="0x..."
              value={commonSaltInput}
              onChange={(e) => setCommonSaltInput(e.target.value)}
            />
          </label>
          <p className="dim">
            Paste the common salt shared by the proposal creator.
          </p>
        </div>
      )}

      {/* ── Commit ────────────────────────────────────────────── */}
      {canCommit && (
        <div className="action-section">
          <h4>Cast Your Vote</h4>
          <div className="vote-buttons">
            {([VOTE.Aye, VOTE.Nay, VOTE.Abstain] as VoteValue[]).map((v) => (
              <button
                key={v}
                className={selectedVote === v ? "selected" : ""}
                onClick={() => setSelectedVote(v)}
              >
                {VOTE_LABELS[v]}
              </button>
            ))}
          </div>
          <button className="primary" onClick={handleCommit} disabled={busy}>
            {busy ? "Submitting..." : "Commit Vote"}
          </button>
        </div>
      )}

      {hasCommitted && (
        <p className="success">
          You have committed your vote.
          {myVote !== null && <> Your vote: <strong>{VOTE_LABELS[myVote]}</strong></>}
        </p>
      )}

      {/* ── Reveal ────────────────────────────────────────────── */}
      {canReveal && storedOts && (
        <div className="action-section">
          <h4>Reveal Your Salt</h4>
          <p className="dim">
            Your one-time salt: <code>{storedOts}</code>
          </p>
          <button className="primary" onClick={handleReveal} disabled={busy}>
            {busy ? "Submitting..." : "Reveal Salt"}
          </button>
        </div>
      )}

      {canReveal && !storedOts && (
        <p className="warn">
          One-time salt not found in browser storage. If you committed from
          another device, you cannot reveal from here.
        </p>
      )}

      {hasRevealed && (
        <p className="success">You have revealed your salt.</p>
      )}

      {/* ── Finalize ──────────────────────────────────────────── */}
      {canFinalize && (
        <div className="action-section">
          <button onClick={handleFinalize} disabled={busy}>
            {busy ? "Finalizing..." : "Finalize Proposal"}
          </button>
        </div>
      )}

      {/* ── Verify & Tally ────────────────────────────────────── */}
      <div className="action-section">
        <h4>Verify & Tally (off-chain)</h4>
        <button onClick={handleVerify} disabled={!commonSaltInput}>
          Verify All Votes
        </button>

        {tallySummary && (
          <div className="tally">
            <div className="tally-row aye">Aye: {tallySummary.aye}</div>
            <div className="tally-row nay">Nay: {tallySummary.nay}</div>
            <div className="tally-row abstain">Abstain: {tallySummary.abstain}</div>
            {tallySummary.unknown > 0 && (
              <div className="tally-row unknown">
                Not revealed / unverifiable: {tallySummary.unknown}
              </div>
            )}
          </div>
        )}

        {tally && voters && (
          <table className="info-table vote-table">
            <thead>
              <tr>
                <th>Voter</th>
                <th>Vote</th>
              </tr>
            </thead>
            <tbody>
              {voters.map((v) => (
                <tr key={v}>
                  <td className="mono">{v.slice(0, 8)}...{v.slice(-4)}</td>
                  <td>
                    {tally[v] !== null && tally[v] !== undefined
                      ? VOTE_LABELS[tally[v]!]
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </section>
  );
}
