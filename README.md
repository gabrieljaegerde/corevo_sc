# CoReVo Smart Contract

A Solidity smart contract and dApp implementing the [CoReVo (Commit-Reveal Voting)](https://github.com/brenzi/corevo) protocol by [Alain Brenzikofer](https://github.com/brenzi), designed for deployment on [Revive](https://docs.polkadot.com/develop/smart-contracts/) (Kusama Hub / Paseo testnet).

The original CoReVo is a Rust CLI/TUI that uses Substrate `System.Remark` extrinsics as a data store with all logic client-side. This project moves the protocol on-chain as a Solidity smart contract, enforcing deadlines and commitment immutability, while preserving the original's group-privacy guarantees.

## How it works

CoReVo enables confidential voting for small groups. Votes are hidden from outsiders even after the voting process completes.

**Protocol phases:**

1. **Key Announcement** — participants register X25519 encryption public keys on-chain
2. **Proposal Creation** — proposer defines a voting context, invites voters, and distributes an encrypted common salt to each voter
3. **Commit** — voters submit `keccak256(vote || oneTimeSalt || commonSalt)` on-chain
4. **Reveal** — voters publish only their `oneTimeSalt` on-chain

### Private vs. public proposals

CoReVo supports two modes:

- **Private proposals** — the common salt is encrypted individually to each voter's X25519 public key using NaCl box (X25519 + XSalsa20-Poly1305). The encrypted ciphertexts are emitted as event data. Only group members can decrypt the common salt and verify votes off-chain. Outsiders see commitments and one-time salts but cannot reconstruct votes because the common salt never appears in plaintext on-chain.

- **Public proposals** — the common salt is passed in plaintext (unencrypted) for each voter. Anyone can read it from the event logs and verify every vote after the reveal phase. This is useful for transparent governance where public auditability is desired, while still preventing voters from seeing each other's votes during the commit phase.

## Project structure

```
corevo_sc/
├── contracts/Corevo.sol          # Smart contract
├── test/Corevo.test.ts           # 30 tests
├── ignition/modules/Corevo.ts    # Deployment module
├── hardhat.config.ts             # Paseo + Kusama network config
├── .env                          # Private key (gitignored)
└── frontend/                     # dApp (IPFS-deployable)
    ├── src/
    │   ├── crypto.ts             # X25519 key derivation, NaCl encryption
    │   ├── components/           # React UI components
    │   └── ...
    └── dist/                     # Static build output
```

## Prerequisites

- Node.js >= 18
- MetaMask (or any injected wallet) configured for Paseo testnet or Kusama Hub
- PAS tokens from the [Polkadot faucet](https://faucet.polkadot.io/) (for testnet)

### Network details

| Network | Chain ID | RPC | Currency |
|---|---|---|---|
| Paseo testnet | 420420417 | `https://eth-rpc-testnet.polkadot.io/` | PAS |
| Kusama Hub | 420420418 | `https://eth-rpc-kusama.polkadot.io/` | KSM |

## Setup

### 1. Install dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Run smart contract tests

```bash
npm test
```

### 3. Deploy the contract

Add your private key to `.env`:

```
PRIVATE_KEY=your_hex_private_key_here
```

Deploy to Paseo testnet:

```bash
npm run deploy:paseo
```

Or to Kusama Hub (requires KSM):

```bash
npm run deploy:kusama
```

### 4. Configure the dApp

Create `frontend/.env` with the deployed contract address:

```
VITE_CONTRACT_ADDRESS=0xYourDeployedAddress
```

### 5. Run the dApp locally

```bash
cd frontend
npx vite
```

Open http://localhost:5173 in your browser.

### 6. Build for IPFS

```bash
cd frontend
npm run build
```

Upload the `dist/` folder to IPFS. The build output is purely static files with no server dependencies.

## Attribution

This project is a smart contract implementation of the CoReVo protocol created by [Alain Brenzikofer](https://github.com/brenzi). The original project is available at [github.com/brenzi/corevo](https://github.com/brenzi/corevo).

## License

MIT
