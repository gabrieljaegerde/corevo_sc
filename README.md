# CoReVo Smart Contract

A Solidity smart contract and dApp implementing the [CoReVo (Commit-Reveal Voting)](https://github.com/brenzi/corevo) protocol by [Alain Brenzikofer](https://github.com/brenzi), designed for deployment on [Revive](https://docs.polkadot.com/develop/smart-contracts/) (Kusama Hub / Polkadot Hub TestNet).

The original CoReVo is a Rust CLI/TUI that uses Substrate `System.Remark` extrinsics as a data store with all logic client-side. This project moves the protocol on-chain as a Solidity smart contract, enforcing deadlines and commitment immutability, while preserving the original's group-privacy guarantees.

## How it works

CoReVo enables confidential voting for small groups. Votes are hidden from outsiders even after the voting process completes.

**Protocol phases:**

1. **Key Announcement** — participants register X25519 encryption public keys on-chain
2. **Proposal Creation** — proposer defines a voting context, invites voters, and distributes an encrypted common salt to each voter
3. **Commit** — voters submit `keccak256(vote || oneTimeSalt || commonSalt)` on-chain
4. **Reveal** — voters publish only their `oneTimeSalt` on-chain

### Why deadlines?

The original CoReVo has no on-chain deadline enforcement — the reveal phase relies on social pressure. Since smart contracts can enforce time constraints, this implementation adds a **commit deadline** and a **reveal deadline**:

- **Commit deadline** — voters must submit their commitments before this time. After it passes, no new commitments are accepted and the reveal phase begins.
- **Reveal deadline** — voters must reveal their one-time salt before this time. After it passes, anyone can call `finalizeProposal()` to close the vote. Voters who didn't reveal in time simply count as non-participants.

This removes the need for social coordination and prevents a voter from stalling the process by refusing to reveal.

### Private vs. public proposals

CoReVo supports two modes:

- **Private proposals** — the common salt is encrypted individually to each voter's X25519 public key using NaCl box (X25519 + XSalsa20-Poly1305). The encrypted ciphertexts are emitted as event data. Only group members can decrypt the common salt and verify votes off-chain. Outsiders see commitments and one-time salts but cannot reconstruct votes because the common salt never appears in plaintext on-chain.

- **Public proposals** — the common salt is passed in plaintext (unencrypted) for each voter. Anyone can read it from the event logs and verify every vote after the reveal phase. This is useful for transparent governance where public auditability is desired, while still preventing voters from seeing each other's votes during the commit phase.

## Known limitations

### Encryption key management

The dApp generates a random 32-byte encryption seed on first visit and stores it in the URL hash fragment (e.g. `#seed=a1b2c3...`). The X25519 key pair is derived from this seed. Since the fragment is never sent to a server, the seed stays entirely in the browser.

Users save their key by **bookmarking the URL**. Browser bookmark sync provides cross-device portability. On IPFS there is no server to leak it to.

This is a standalone encryption key, separate from the wallet — the wallet is only used for signing transactions. See [issue #1](https://github.com/gabrieljaegerde/corevo_sc/issues/1) for discussion on the ideal long-term approach: forking a wallet extension to derive X25519 keys natively from the mnemonic and exposing NaCl encrypt/decrypt APIs, so the secret key never leaves the extension.

## Project structure

```
corevo_sc/
├── contracts/Corevo.sol          # Smart contract
├── test/Corevo.test.ts           # 30 tests
├── ignition/modules/Corevo.ts    # Deployment module
├── hardhat.config.ts             # Testnet + Kusama network config
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
- MetaMask (or any injected wallet)
- PAS tokens for testnet (see below) or KSM for Kusama Hub

### Network details

| Network | Chain ID | RPC | Explorer | Currency |
|---|---|---|---|---|
| Polkadot Hub TestNet (Paseo) | 420420417 | `https://eth-rpc-testnet.polkadot.io/` | [Blockscout](https://blockscout-testnet.polkadot.io) | PAS |
| Kusama Hub | 420420418 | `https://eth-rpc-kusama.polkadot.io/` | [Blockscout](https://blockscout-kusama.polkadot.io) | KSM |

### Getting testnet tokens (PAS)

1. Go to the [Polkadot Faucet](https://faucet.polkadot.io/)
2. Select **Paseo** as the network and **Asset Hub** as the chain
3. Paste your Ethereum (MetaMask) address
4. Complete the captcha and request tokens
5. Add the Polkadot Hub TestNet to MetaMask using the network details above (Chain ID `420420417`, RPC `https://eth-rpc-testnet.polkadot.io/`)

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

Deploy to Polkadot Hub TestNet (Paseo):

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
