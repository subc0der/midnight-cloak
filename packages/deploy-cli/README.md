# @midnight-cloak/deploy-cli

Interactive CLI for deploying Midnight Cloak contracts to the Midnight network.

## Features

- Deploy Age Verifier and Credential Registry contracts
- Join existing contracts by address
- Call contract circuits (verifyAge, registerCredential, checkCommitment)
- Create new wallets or restore from seed
- Check DUST balance
- Real ZK proof generation

## Prerequisites

1. **Docker** - For the Midnight proof server
2. **Node.js 18+** - Runtime
3. **Testnet tDUST** - Get from [Midnight Faucet](https://faucet.midnight.network)

## Quick Start

```bash
# From project root
cd packages/deploy-cli

# Start the CLI (connects to preprod)
npm run preprod
```

## Usage

### Starting the CLI

```bash
npm run preprod
```

You'll see:

```
╔══════════════════════════════════════════════════════════════╗
║              Midnight Cloak Deployment CLI                   ║
║              Zero-knowledge identity verification            ║
╚══════════════════════════════════════════════════════════════╝
```

### Wallet Setup

First, choose how to set up your wallet:

```
──────────────────────────────────────────────────────────────
  Wallet Setup
──────────────────────────────────────────────────────────────
  [1] Create a new wallet
  [2] Restore wallet from seed
  [3] Exit
```

- **Option 1**: Creates a new wallet and displays the seed (save this securely)
- **Option 2**: Enter an existing 64-character hex seed

### Contract Operations

After wallet setup, you'll see the main menu:

```
──────────────────────────────────────────────────────────────
  Contract Operations               DUST: 1,000,000
──────────────────────────────────────────────────────────────
  [1] Deploy Age Verifier contract
  [2] Deploy Credential Registry contract
  [3] Join existing Age Verifier
  [4] Join existing Credential Registry
  [5] Call verifyAge circuit
  [6] Call registerCredential circuit
  [7] Call checkCommitment circuit
  [8] Check DUST balance
  [9] Exit
```

### Deploy a Contract

Select option 1 or 2 to deploy. The CLI will:

1. Configure providers (proof server, indexer, node)
2. Generate and submit the deployment transaction
3. Wait for confirmation
4. Save the contract address to `deployment-result.json`

Example output:

```
  ✓ Age Verifier deployed at: 11ad42b6f40f17a24bfd0d9a2410c11cfe83041459592800ff77773dee22c639
  Saved to deployment-result.json
```

### Call a Circuit

To verify age (option 5):

1. Enter the contract address
2. Enter the minimum age to verify
3. The CLI generates a ZK proof and submits the transaction

Example:

```
Enter Age Verifier contract address: 11ad42b6f40f17a24bfd0d9a2410c11cfe83041459592800ff77773dee22c639
Enter minimum age to verify (e.g., 18): 18

  ✓ Verification Result: PASSED
    User is >= 18 years old
    Tx Hash: abc123...
```

## Output Files

### deployment-result.json

After deployment, contract addresses are saved:

```json
{
  "ageVerifier": {
    "address": "11ad42b6f40f17a24bfd0d9a2410c11cfe83041459592800ff77773dee22c639",
    "deployedAt": "2026-03-26T12:00:00.000Z",
    "network": "preprod"
  },
  "credentialRegistry": {
    "address": "9c11690461447fc0ad72ad90ac2fda7574aebe294a7a0d2c3e7c8369f947609d",
    "deployedAt": "2026-03-26T12:05:00.000Z",
    "network": "preprod"
  }
}
```

## Configuration

The CLI connects to Midnight preprod by default. Configuration is in `src/config.ts`:

- **Proof Server**: `http://localhost:6300`
- **Indexer**: `https://indexer.preprod.midnight.network`
- **Node**: `wss://rpc.preprod.midnight.network`

## Proof Server

The proof server must be running for ZK proof generation:

```bash
# From project root
docker-compose up -d proof-server
```

Verify it's running:

```bash
curl http://localhost:6300/health
```

## Updating SDK Addresses

After deploying new contracts, update the SDK:

1. Copy addresses from `deployment-result.json`
2. Update `packages/contracts/src/addresses.ts`
3. Rebuild packages: `npm run build:all`

## Troubleshooting

### "DUST balance insufficient"

Get testnet tDUST from the [Midnight Faucet](https://faucet.midnight.network).

### "Proof server unavailable"

Ensure Docker is running and the proof server is up:

```bash
docker-compose up -d proof-server
docker-compose logs proof-server
```

### "Network error"

Check your internet connection and VPN settings. The preprod RPC endpoints require direct access.

### "Invalid seed length"

Seeds must be exactly 64 hexadecimal characters.

## Related

- [Contracts Package](../contracts/README.md)
- [Deployment Guide](../../DEPLOYMENT_GUIDE.md)
- [SDK Core](../core/README.md)
