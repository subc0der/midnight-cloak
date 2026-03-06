# @midnight-cloak/contracts

Contract types and addresses for [Midnight Cloak](https://github.com/midnight-cloak).

## Status

**This package is a placeholder.** Real Compact contracts are pending development.

Current functionality:
- Contract address constants (empty until deployed)
- TypeScript type definitions
- Network configuration helpers

## Installation

```bash
npm install @midnight-cloak/contracts
# or
pnpm add @midnight-cloak/contracts
```

## Usage

```typescript
import {
  CONTRACT_ADDRESSES,
  getContractAddresses,
  areContractsDeployed,
  VerificationStatus,
  CredentialStatus,
} from '@midnight-cloak/contracts';

// Check if contracts are deployed
if (areContractsDeployed('preprod')) {
  const addresses = getContractAddresses('preprod');
  console.log('Age Verifier:', addresses.ageVerifier);
}

// Status enums for UI
console.log(VerificationStatus.VERIFIED);  // 'VERIFIED'
console.log(CredentialStatus.ACTIVE);      // 'ACTIVE'
```

## Contract Addresses

Addresses will be populated after deployment to Midnight networks:

| Network | Contract | Address |
|---------|----------|---------|
| Preprod | Credential Registry | *pending* |
| Preprod | Age Verifier | *pending* |
| Mainnet | Credential Registry | *pending* |
| Mainnet | Age Verifier | *pending* |

## Planned Contracts

### Age Verifier

Verifies user age without revealing birthdate.

```compact
// Planned Compact contract
export circuit verifyAge(
  birthYear: Uint<16>,
  minAge: Uint<8>,
  currentYear: Uint<16>
): Boolean {
  return (currentYear - birthYear) >= minAge;
}
```

### Credential Registry

Stores credential commitments on-chain.

```compact
// Planned Compact contract
export ledger credentials: Map<Field, CredentialCommitment>;

export circuit registerCredential(
  commitment: Field,
  issuer: Field
): [] {
  credentials.insert(commitment, { issuer, timestamp: now() });
}
```

## Development

Contracts are written in Compact (Midnight's ZK language) and compiled using the Midnight toolchain.

### Compile Contracts (WSL on Windows)

```bash
wsl -e bash -c "source ~/.local/bin/env && compact compile src/age-verifier.compact src/managed/age-verifier"
```

### Generated Files

After compilation:
```
src/managed/age-verifier/
├── contract/     # TypeScript API
├── keys/         # Proving/verifying keys
└── zkir/         # ZK intermediate representation
```

## Types

```typescript
import type { Network } from '@midnight-cloak/contracts';

type Network = 'testnet' | 'mainnet';

enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  DENIED = 'DENIED',
}

enum CredentialStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}
```

## Roadmap

1. **Phase 2** (Current) - Type definitions and placeholders
2. **Phase 3** - Age verifier contract deployment
3. **Phase 4** - Token balance and NFT contracts
4. **Phase 5** - Mainnet deployment

## License

MIT
