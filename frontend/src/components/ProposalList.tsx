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
  const phaseLabel = PHASE_LABELS[phase] || "Unknown";

  let status: string = phaseLabel;
  if (phase === 0 && now > commitDeadline) status = "Commit ended";
  if (phase === 1 && now > revealDeadline) status = "Reveal ended";

  return (
    <li onClick={() => onSelect(id)}>
      <span className="proposal-id">#{id.toString()}</span>
      <span className={`badge phase-${phase}`}>{status}</span>
      <span className="dim">
        {Number(commitCount)}/{Number(voterCount)} committed,{" "}
        {Number(revealCount)}/{Number(commitCount)} revealed
      </span>
      <span className="dim proposer">by {proposer.slice(0, 8)}...</span>
    </li>
  );
}
