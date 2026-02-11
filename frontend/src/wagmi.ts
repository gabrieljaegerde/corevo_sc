import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const paseoTestnet = defineChain({
  id: 420420417,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io/"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout-testnet.polkadot.io",
    },
  },
  testnet: true,
});

export const kusamaHub = defineChain({
  id: 420420418,
  name: "Kusama Hub",
  nativeCurrency: { name: "KSM", symbol: "KSM", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-kusama.polkadot.io/"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout-kusama.polkadot.io",
    },
  },
});

export const config = createConfig({
  chains: [paseoTestnet, kusamaHub],
  connectors: [injected()],
  transports: {
    [paseoTestnet.id]: http(),
    [kusamaHub.id]: http(),
  },
});

// Contract address — update after deployment
export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";
