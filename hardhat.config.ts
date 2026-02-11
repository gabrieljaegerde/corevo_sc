import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? [process.env.PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },

  networks: {
    // Local Hardhat node (default)
    hardhat: {},

    // ── Paseo testnet (Polkadot Hub TestNet) ────────────────────────
    paseoTestnet: {
      url: process.env.PASEO_RPC_URL || "https://eth-rpc-testnet.polkadot.io/",
      chainId: 420420417,
      accounts: PRIVATE_KEY,
    },

    // ── Kusama Hub (canary — real value) ────────────────────────────
    kusamaHub: {
      url: process.env.KUSAMA_RPC_URL || "https://eth-rpc-kusama.polkadot.io/",
      chainId: 420420418,
      accounts: PRIVATE_KEY,
    },
  },
};

export default config;
