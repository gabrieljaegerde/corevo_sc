import { http, createConfig } from "wagmi";
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
  multiInjectedProviderDiscovery: true, // EIP-6963: wallets announce themselves, no manual detection
  chains: [paseoTestnet, kusamaHub],
  connectors: [],
  transports: {
    [paseoTestnet.id]: http(),
    [kusamaHub.id]: http(),
  },
});

const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [paseoTestnet.id]: import.meta.env.VITE_CONTRACT_ADDRESS_PASEO as `0x${string}`,
  [kusamaHub.id]:    import.meta.env.VITE_CONTRACT_ADDRESS_KUSAMA as `0x${string}`,
};

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function getContractAddress(chainId: number | undefined): `0x${string}` {
  return (chainId ? CONTRACT_ADDRESSES[chainId] : undefined) ?? ZERO;
}
