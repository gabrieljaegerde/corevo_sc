import { useState } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { COREVO_ABI } from "../abi";
import { getContractAddress } from "../wagmi";
import AddressLabel from "./AddressLabel";

const PHASE_LABELS = ["Commit", "Reveal", "Finished"] as const;

interface Props {
  onSelect: (id: bigint) => void;
}

export default function ProposalList({ onSelect }: Props) {
  const [myOnly, setMyOnly] = useState(true);
  const chainId = useChainId();
  const CONTRACT_ADDRESS = getContractAddress(chainId);

  const { data: count } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "proposalCount",
  });

  const proposalCount = count ? Number(count) : 0;

  if (proposalCount === 0) {
    return (
      <section className="card">
        <h3>Proposals</h3>
        <p className="dim">No proposals yet.</p>
      </section>
    );
  }

  const ids = Array.from({ length: proposalCount }, (_, i) => BigInt(proposalCount - 1 - i));

  return (
    <section className="card">
      <div className="proposals-header">
        <h3>Proposals ({proposalCount})</h3>
        <label className="checkbox-label filter-toggle">
          <input
            type="checkbox"
            checked={myOnly}
            onChange={(e) => setMyOnly(e.target.checked)}
          />
          My proposals only
        </label>
      </div>
      <ul className="proposal-list">
        {ids.map((id) => (
          <ProposalRow key={id.toString()} id={id} onSelect={onSelect} myOnly={myOnly} />
        ))}
      </ul>
    </section>
  );
}

function ProposalRow({
  id,
  onSelect,
  myOnly,
}: {
  id: bigint;
  onSelect: (id: bigint) => void;
  myOnly: boolean;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const CONTRACT_ADDRESS = getContractAddress(chainId);

  const { data } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "proposals",
    args: [id],
  });

  const { data: amVoter } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "isVoter",
    args: address ? [id, address] : undefined,
  });

  if (!data) return <li className="loading"><span className="spinner" />Loading #{id.toString()}...</li>;

  const [proposer, , phase, , commitDeadline, , voterCount, commitCount, revealCount] = data;
  const now = BigInt(Math.floor(Date.now() / 1000));

  let effectivePhase: number;
  if (now <= commitDeadline) {
    effectivePhase = 0;
  } else if (Number(phase) < 2) {
    effectivePhase = 1;
  } else {
    effectivePhase = 2;
  }

  // Filter: show only proposals where user is proposer or voter
  if (myOnly && address) {
    const isProposer = proposer.toLowerCase() === address.toLowerCase();
    if (!isProposer && !amVoter) return null;
  }

  return (
    <li onClick={() => onSelect(id)}>
      <span className="proposal-id">#{id.toString()}</span>
      <span className={`badge phase-${effectivePhase}`}>{PHASE_LABELS[effectivePhase]}</span>
      <span className="dim">
        {Number(commitCount)}/{Number(voterCount)} committed,{" "}
        {Number(revealCount)}/{Number(commitCount)} revealed
      </span>
      <span className="dim proposer">by <AddressLabel address={proposer} /></span>
    </li>
  );
}
