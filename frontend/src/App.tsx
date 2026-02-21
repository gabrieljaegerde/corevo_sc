import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import ConnectWallet from "./components/ConnectWallet";
import KeyStatus from "./components/KeyStatus";
import CreateProposal from "./components/CreateProposal";
import ProposalList from "./components/ProposalList";
import ProposalDetail from "./components/ProposalDetail";
import { ensureKeyPair } from "./crypto";
import Contacts from "./components/Contacts";

type Tab = "proposals" | "create" | "contacts";

export default function App() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("proposals");
  const [selectedProposal, setSelectedProposal] = useState<bigint | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [contactsVersion, setContactsVersion] = useState(0);

  // Derive key pair from URL seed (generates one if missing)
  const keyPair = useMemo(() => ensureKeyPair(), []);

  function handleCopyUrl() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }

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
            <button
              className={tab === "contacts" ? "active" : ""}
              onClick={() => setTab("contacts")}
            >
              Contacts
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
              <ProposalList key={contactsVersion} onSelect={setSelectedProposal} />
            )}
            {tab === "proposals" && selectedProposal !== null && (
              <ProposalDetail
                key={contactsVersion}
                proposalId={selectedProposal}
                keyPair={keyPair}
                onBack={() => setSelectedProposal(null)}
              />
            )}
            {tab === "contacts" && (
              <Contacts onUpdate={() => setContactsVersion((v) => v + 1)} />
            )}
          </main>
        </>
      )}

      {!isConnected && (
        <div className="onboarding">
          <h2>Private group voting on Kusama</h2>
          <p className="onboarding-intro">
            CoReVo uses commit-reveal cryptography so votes stay hidden until
            everyone has voted. Only your group can see the results.
          </p>

          <div className="security-notice">
            <h4>Your encryption key lives in this URL</h4>
            <ul>
              <li>Bookmark this page now — this is the only way to recover your key</li>
              <li>Never share the full URL — it contains your secret</li>
            </ul>
            <button className="url-copy" onClick={handleCopyUrl}>
              {urlCopied ? "Copied!" : "Copy URL to clipboard"}
            </button>
          </div>

          <div className="steps">
            <div className="step done">
              <span className="step-number">1</span>
              <div>
                <strong>Save your URL</strong>
                <p>Your encryption key was generated and embedded in the URL above.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">2</span>
              <div>
                <strong>Connect your wallet</strong>
                <p>Use the connect button in the header to link your account.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">3</span>
              <div>
                <strong>Announce your key on-chain</strong>
                <p>Publish your public encryption key so others can encrypt votes for you.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">4</span>
              <div>
                <strong>Vote</strong>
                <p>Create or participate in proposals with your group.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
