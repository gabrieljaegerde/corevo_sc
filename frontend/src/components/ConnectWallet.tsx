import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { paseoTestnet, kusamaHub } from "../wagmi";

export default function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="connect-wallet">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector, chainId: paseoTestnet.id })}
            className="connector-btn"
          >
            {connector.icon && (
              <img src={connector.icon} alt="" className="connector-icon" />
            )}
            {connector.name}
          </button>
        ))}
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
        <option value={paseoTestnet.id}>Polkadot Hub TestNet (Paseo)</option>
        <option value={kusamaHub.id}>Kusama Hub</option>
      </select>
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
