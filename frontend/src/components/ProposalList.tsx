import { useReadContract } from "wagmi";
import { COREVO_ABI } from "../abi";
import { CONTRACT_ADDRESS } from "../wagmi";

const PHASE_LABELS = ["Commit", "Reveal", "Finished"] as const;

interface Props {
  onSelect: (id: bigint) => void;
}

export default function ProposalList({ onSelect }: Props) {
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

  // Render a list of proposal summaries (most recent first)
  const ids = Array.from({ length: proposalCount }, (_, i) => BigInt(proposalCount - 1 - i));

  return (
    <section className="card">
      <h3>Proposals ({proposalCount})</h3>
      <ul className="proposal-list">
        {ids.map((id) => (
          <ProposalRow key={id.toString()} id={id} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}

function ProposalRow({ id, onSelect }: { id: bigint; onSelect: (id: bigint) => void }) {
  const { data } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: COREVO_ABI,
    functionName: "proposals",
    args: [id],
  });

  if (!data) return <li className="loading">Loading #{id.toString()}...</li>;

  const [proposer, , phase, , commitDeadline, revealDeadline, voterCount, commitCount, revealCount] = data;
  const now = BigInt(Math.floor(Date.now() / 1000));

  // Compute effective phase purely from deadlines (same as ProposalDetail).
  // The contract auto-finishes when all committers reveal, but we show
  // "Reveal" as long as the reveal deadline hasn't passed yet.
  let effectivePhase: number;
  if (now <= commitDeadline) {
    effectivePhase = 0;
  } else if (now <= revealDeadline) {
    effectivePhase = 1;
  } else {
    effectivePhase = 2;
  }

  return (
    <li onClick={() => onSelect(id)}>
      <span className="proposal-id">#{id.toString()}</span>
      <span className={`badge phase-${effectivePhase}`}>{PHASE_LABELS[effectivePhase]}</span>
      <span className="dim">
        {Number(commitCount)}/{Number(voterCount)} committed,{" "}
        {Number(revealCount)}/{Number(commitCount)} revealed
      </span>
      <span className="dim proposer">by {proposer.slice(0, 8)}...</span>
    </li>
  );
}
