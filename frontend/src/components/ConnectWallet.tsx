import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { paseoTestnet, kusamaHub } from "../wagmi";

export default function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [available, setAvailable] = useState<Connector[] | null>(null);

  useEffect(() => {
    async function resolve() {
      const seen = new Set<unknown>();
      const result: Connector[] = [];
      for (const connector of connectors) {
        try {
          const provider = await connector.getProvider();
          if (provider && !seen.has(provider)) {
            seen.add(provider);
            result.push(connector);
          }
        } catch {}
      }
      setAvailable(result);
    }
    resolve();
  }, [connectors]);

  if (!isConnected) {
    return (
      <div className="connect-wallet">
        {available === null ? (
          <span className="dim"><span className="spinner" />Detecting wallets...</span>
        ) : available.length === 0 ? (
          <span className="dim">No wallet detected</span>
        ) : (
          available.map((connector) => (
            <button
              key={connector.uid}
              className="connector-btn"
              onClick={() => connect({ connector, chainId: paseoTestnet.id })}
            >
              {connector.icon && (
                <img src={connector.icon} alt="" className="connector-icon" />
              )}
              {connector.name}
            </button>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="connect-wallet">
      <span className="address" title={address}>
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
      <select
        value={chain?.id}
        onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
      >
        <option value={paseoTestnet.id}>Paseo Testnet</option>
        <option value={kusamaHub.id}>Kusama Hub</option>
      </select>
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
