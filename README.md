# CoReVo Smart Contract

A Solidity smart contract and dApp implementing the [CoReVo (Commit-Reveal Voting)](https://github.com/brenzi/corevo) protocol by [Alain Brenzikofer](https://github.com/brenzi), designed for deployment on [Revive](https://docs.polkadot.com/develop/smart-contracts/) (Kusama Hub / Polkadot Hub TestNet).

The original CoReVo is a Rust CLI/TUI that uses Substrate `System.Remark` extrinsics as a data store with all logic client-side. This project moves the protocol on-chain as a Solidity smart contract, enforcing deadlines and commitment immutability, while preserving the original's group-privacy guarantees.

## How it works

CoReVo enables confidential voting for small groups. Votes are hidden from outsiders even after the voting process completes.

**Protocol phases:**

1. **Key Announcement** — participants register X25519 encryption public keys on-chain
2. **Proposal Creation** — proposer defines a voting context, invites voters, and distributes an encrypted common salt to each voter
3. **Commit** — voters submit `keccak256(vote || oneTimeSalt || commonSalt)` on-chain. Voters may re-commit to change their vote before the commit deadline.
4. **Reveal** — voters publish only their `oneTimeSalt` on-chain

### Why deadlines?

The original CoReVo has no on-chain deadline enforcement — the reveal phase relies on social pressure. Since smart contracts can enforce time constraints, this implementation adds a **commit deadline** and a **reveal deadline**:

- **Commit deadline** — voters must submit their commitments before this time. After it passes, no new commitments are accepted and the reveal phase begins.
- **Reveal deadline (soft)** — serves as a target for when voters should reveal. Unlike the commit deadline, this is not strictly enforced — voters can still reveal after it passes, as long as the proposal has not been finalized. Anyone can call `finalizeProposal()` after the reveal deadline to close the vote. Voters who didn't reveal simply count as non-participants.

This removes the need for social coordination and prevents a voter from stalling the process by refusing to reveal.

### Private vs. public proposals

CoReVo supports two modes:

- **Private proposals** — the common salt is encrypted individually to each voter's X25519 public key using NaCl box (X25519 + XSalsa20-Poly1305). The encrypted ciphertexts are emitted as event data. Only group members can decrypt the common salt and verify votes off-chain. Outsiders see commitments and one-time salts but cannot reconstruct votes because the common salt never appears in plaintext on-chain.

- **Public proposals** — the common salt is passed in plaintext (unencrypted) for each voter. Anyone can read it from the event logs and verify every vote after the reveal phase. This is useful for transparent governance where public auditability is desired, while still preventing voters from seeing each other's votes during the commit phase.

## Known limitations

### Encryption key management

The dApp generates a random 32-byte encryption seed on first visit and stores it in the URL hash fragment (e.g. `#seed=a1b2c3...`). The X25519 key pair is derived from this seed. Since the fragment is never sent to a server, the seed stays entirely in the browser.

Users save their key by **bookmarking the URL**. The seed is also the source of truth for one-time salts — they are derived deterministically as `keccak256(seed || proposalId || walletAddress)`, so any device with the URL can commit and reveal without storing anything locally.


## Project structure

```
corevo_sc/
├── contracts/Corevo.sol          # Smart contract
├── test/Corevo.test.ts           # 31 tests
├── scripts/deploy.ts             # Deployment script
├── hardhat.config.ts             # Network config (Paseo + Kusama Hub)
├── .env                          # Private key (gitignored)
└── frontend/                     # dApp (IPFS-deployable)
    ├── src/
    │   ├── crypto.ts             # X25519 key derivation, NaCl encryption
    │   ├── store.ts              # localStorage contacts
    │   ├── abi.ts                # Contract ABI
    │   ├── wagmi.ts              # Chain config, contract addresses
    │   └── components/           # React UI components
    └── ...
```

## Prerequisites

- Node.js >= 18
- A wallet with EIP-6963 support (Talisman, MetaMask, SubWallet, Brave Wallet)
- PAS tokens for testnet (see below) or KSM for Kusama Hub

### Network details

| Network | Chain ID | RPC | Explorer | Currency |
|---|---|---|---|---|
| Polkadot Hub TestNet (Paseo) | 420420417 | `https://eth-rpc-testnet.polkadot.io/` | [Blockscout](https://blockscout-testnet.polkadot.io) | PAS |
| Kusama Hub | 420420418 | `https://eth-rpc-kusama.polkadot.io/` | [Blockscout](https://blockscout-kusama.polkadot.io) | KSM |

### Getting testnet tokens (PAS)

1. Go to the [Polkadot Faucet](https://faucet.polkadot.io/)
2. Select **Paseo** as the network and **Asset Hub** as the chain
3. Paste your Ethereum address
4. Complete the captcha and request tokens

### Funding an Ethereum account with KSM on Kusama Hub

Kusama Hub supports EVM accounts (H160 Ethereum addresses), but if you hold KSM in a Substrate wallet (e.g. Talisman, Nova), you cannot send directly to an Ethereum address from the standard transfer UI. You need to convert the Ethereum address to its Substrate (SS58) equivalent first.

1. **Get your Ethereum address** — from MetaMask, Talisman's Ethereum account, or wherever your EVM key is held (e.g. `0x1234...abcd`)
2. **Convert it to SS58** — use either method:
   - **Subscan**: search for your `0x` address on [Kusama Hub Subscan](https://assethub-kusama.subscan.io/), open the account page, and click the address conversion button to get the SS58 form
   - **Polkadot docs**: use the [account converter](https://docs.polkadot.com/smart-contracts/for-eth-devs/accounts/) on the Polkadot developer docs
3. **Send KSM to the SS58 address** — from Talisman, Polkadot.js Apps, or any Substrate wallet, send KSM to the converted SS58 address on Kusama Asset Hub
4. **Verify** — add Kusama Hub to your EVM wallet (Chain ID `420420418`, RPC `https://eth-rpc-kusama.polkadot.io/`) and check the balance

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

Add your deployer private key to `.env`:

```
PRIVATE_KEY=0x_your_hex_private_key_here
```

Deploy to Polkadot Hub TestNet (Paseo):

```bash
npm run deploy:paseo
```

Deploy to Kusama Hub (requires KSM):

```bash
npm run deploy:kusama
```

### 4. Configure the dApp

Create `frontend/.env` with the deployed contract addresses:

```
VITE_CONTRACT_ADDRESS_PASEO=0xYourPaseoAddress
VITE_CONTRACT_ADDRESS_KUSAMA=0xYourKusamaAddress
```

The dApp automatically uses the correct address based on the connected wallet's chain.

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
ipfs add -r --cid-version 1 -Q dist/
```

The `-Q` flag prints only the root CID. The `-r` flag adds recursively and `--cid-version 1` produces a modern base32 CID. The directory is pinned locally by default.

The build output is purely static — no server required. The `dist/` directory is gitignored; pin it to IPFS directly from your local build.

## Attribution

This project is a smart contract implementation of the CoReVo protocol created by [Alain Brenzikofer](https://github.com/brenzi). The original project is available at [github.com/brenzi/corevo](https://github.com/brenzi/corevo).

## License

MIT
