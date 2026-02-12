import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import ConnectWallet from "./components/ConnectWallet";
import KeyStatus from "./components/KeyStatus";
import CreateProposal from "./components/CreateProposal";
import ProposalList from "./components/ProposalList";
import ProposalDetail from "./components/ProposalDetail";
import { ensureKeyPair } from "./crypto";

type Tab = "proposals" | "create";

export default function App() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("proposals");
  const [selectedProposal, setSelectedProposal] = useState<bigint | null>(null);

  // Derive key pair from URL seed (generates one if missing)
  const keyPair = useMemo(() => ensureKeyPair(), []);

  return (
    <div className="app">
      <header>
        <h1>CoReVo</h1>
        <p className="subtitle">Commit-Reveal Voting</p>
        <ConnectWallet />
      </header>

      {isConnected && (
        <>
          <KeyStatus keyPair={keyPair} />

          <nav>
            <button
              className={tab === "proposals" ? "active" : ""}
              onClick={() => { setTab("proposals"); setSelectedProposal(null); }}
            >
              Proposals
            </button>
            <button
              className={tab === "create" ? "active" : ""}
              onClick={() => setTab("create")}
            >
              New Proposal
            </button>
          </nav>

          <main>
            {tab === "create" && (
              <CreateProposal
                keyPair={keyPair}
                onCreated={() => {
                  setSelectedProposal(null);
                  setTab("proposals");
                }}
              />
            )}
            {tab === "proposals" && selectedProposal === null && (
              <ProposalList onSelect={setSelectedProposal} />
            )}
            {tab === "proposals" && selectedProposal !== null && (
              <ProposalDetail
                proposalId={selectedProposal}
                keyPair={keyPair}
                onBack={() => setSelectedProposal(null)}
              />
            )}
          </main>
        </>
      )}

      {!isConnected && (
        <div className="hero">
          <p>Connect your wallet to start voting.</p>
        </div>
      )}
    </div>
  );
}
