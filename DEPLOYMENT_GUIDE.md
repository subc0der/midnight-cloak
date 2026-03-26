# Contract Deployment Guide

Guide for deploying Midnight Cloak contracts to the Midnight network.

## Current Deployments

Contracts are already deployed to **preprod**:

| Contract | Address |
|----------|---------|
| Age Verifier | `11ad42b6f40f17a24bfd0d9a2410c11cfe83041459592800ff77773dee22c639` |
| Credential Registry | `9c11690461447fc0ad72ad90ac2fda7574aebe294a7a0d2c3e7c8369f947609d` |

These addresses are configured in `packages/contracts/src/addresses.ts`.

## Prerequisites

### 1. Proof Server

Start the Midnight proof server:

```bash
docker-compose up -d proof-server
```

Verify it's running:

```bash
curl http://localhost:6300/health
```

### 2. Testnet Funds

Get tDUST from the [Midnight Faucet](https://faucet.midnight.network).

### 3. Compiled Contracts

Contracts should already be compiled. If you need to recompile:

```bash
cd packages/contracts
npm run compile        # Full compile with ZK circuits
npm run compile:skip-zk  # Fast compile (TypeScript only)
```

## Deploying with CLI

### Start the CLI

```bash
cd packages/deploy-cli
npm run preprod
```

### Wallet Setup

Choose one:
- **[1] Create new wallet** - Generates a new seed (save it!)
- **[2] Restore from seed** - Enter existing 64-char hex seed

### Deploy Contracts

From the main menu:
- **[1]** Deploy Age Verifier contract
- **[2]** Deploy Credential Registry contract

The CLI handles:
1. Configuring network providers
2. Generating deployment transaction
3. Waiting for confirmation
4. Saving address to `deployment-result.json`

### Verify Deployment

Join the deployed contract to check it works:
- **[3]** Join existing Age Verifier
- **[5]** Call verifyAge circuit

## After Deployment

### 1. Update SDK Addresses

Edit `packages/contracts/src/addresses.ts`:

```typescript
export const CONTRACT_ADDRESSES: ContractAddresses = {
  preprod: {
    ageVerifier: 'YOUR_NEW_AGE_VERIFIER_ADDRESS',
    credentialRegistry: 'YOUR_NEW_CREDENTIAL_REGISTRY_ADDRESS',
  },
  mainnet: {
    ageVerifier: '',  // Not deployed yet
    credentialRegistry: '',
  },
};
```

### 2. Rebuild Packages

```bash
npm run build:all
```

### 3. Test

```bash
# Run tests
npm run test:all

# Start demo app
cd apps/demo
npm run dev
```

## Network Configuration

### Preprod (Current)

| Service | URL |
|---------|-----|
| Proof Server | `http://localhost:6300` |
| Indexer | `https://indexer.preprod.midnight.network` |
| Indexer WS | `wss://indexer.preprod.midnight.network` |
| RPC Node | `wss://rpc.preprod.midnight.network` |

### Mainnet (Future)

Mainnet deployment requires:
1. Real DUST tokens (not tDUST)
2. Mainnet network endpoints
3. Contract security audit (recommended)

Update `packages/deploy-cli/src/config.ts` for mainnet configuration.

## Troubleshooting

### "Proof server unavailable"

```bash
docker-compose logs proof-server
docker-compose restart proof-server
```

### "Insufficient DUST balance"

Get tDUST from [faucet.midnight.network](https://faucet.midnight.network).

### "Network error" / "403 Forbidden"

- Check VPN is disabled (can interfere with RPC)
- Verify internet connection
- Check Midnight network status

### "Contract compilation failed"

Ensure you're using the correct Compact compiler version. See `packages/contracts/README.md`.

## File Reference

| File | Purpose |
|------|---------|
| `packages/deploy-cli/src/preprod.ts` | Entry point for preprod deployment |
| `packages/deploy-cli/src/cli.ts` | Interactive CLI implementation |
| `packages/deploy-cli/src/api.ts` | Contract deployment functions |
| `packages/deploy-cli/src/config.ts` | Network configuration |
| `packages/contracts/src/addresses.ts` | Deployed contract addresses |
| `deployment-result.json` | Output from CLI (auto-generated) |

## Related

- [Deploy CLI README](packages/deploy-cli/README.md)
- [Contracts README](packages/contracts/README.md)
- [SDK Core README](packages/core/README.md)
