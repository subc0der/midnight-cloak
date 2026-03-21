# @midnight-cloak/contracts

Compact smart contracts for [Midnight Cloak](https://github.com/midnight-cloak) identity verification.

## Contracts

### Age Verifier (`age-verifier.compact`)

Proves a user meets a minimum age requirement without revealing their actual birthdate.

**Features:**
- Zero-knowledge age verification
- Round counter prevents transaction linking
- Pure helper circuits for client-side validation

**Circuits:**
| Circuit | Description |
|---------|-------------|
| `verifyAge(minAge)` | Returns true if user's age >= minAge |
| `computeAge(birthYear, currentYear)` | Pure: Calculate age from years |
| `meetsAgeThreshold(birthYear, currentYear, minAge)` | Pure: Check threshold |

### Credential Registry (`credential-registry.compact`)

Stores credential commitments on-chain for verification without revealing credential data.

**Features:**
- Commitment-based storage (no PII on-chain)
- Authorized issuer system
- Credential revocation support
- Multiple credential types

**Circuits:**
| Circuit | Description |
|---------|-------------|
| `registerCredential(...)` | Issue new credential (issuer only) |
| `verifyCredential(id, commitment)` | Verify credential is valid |
| `revokeCredential(id)` | Revoke credential (issuer only) |
| `addIssuer(pubKey)` | Authorize new issuer (owner only) |
| `removeIssuer(pubKey)` | Remove issuer (owner only) |
| `generateCommitment(data, blinder)` | Pure: Create commitment |
| `generateCredentialId(...)` | Pure: Generate credential ID |

## Installation

```bash
npm install @midnight-cloak/contracts
# or
pnpm add @midnight-cloak/contracts
```

## Compilation

Contracts must be compiled using the Compact toolchain before use.

### Prerequisites

- Compact toolchain 0.29.0+ (via WSL on Windows)
- Docker (for proof server)

### Compile Commands

```bash
# Windows (via WSL)
wsl -e bash -c "source ~/.local/bin/env && cd /mnt/c/path/to/midnight-cloak/packages/contracts && compact compile src/age-verifier.compact src/managed/age-verifier"

wsl -e bash -c "source ~/.local/bin/env && cd /mnt/c/path/to/midnight-cloak/packages/contracts && compact compile src/credential-registry.compact src/managed/credential-registry"

# Linux/macOS
compact compile src/age-verifier.compact src/managed/age-verifier
compact compile src/credential-registry.compact src/managed/credential-registry
```

### Generated Output

After compilation:
```
src/managed/
├── age-verifier/
│   ├── contract/     # TypeScript API
│   ├── keys/         # Proving/verifying keys
│   └── zkir/         # ZK intermediate representation
└── credential-registry/
    ├── contract/
    ├── keys/
    └── zkir/
```

## Usage

### TypeScript API (after compilation)

```typescript
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as AgeVerifier from './managed/age-verifier/contract/index.js';
import { witnesses, createAgeVerifierPrivateState } from '@midnight-cloak/contracts';

// Set up compiled contract
const compiledContract = CompiledContract.make('age-verifier', AgeVerifier.Contract)
  .pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets('./src/managed/age-verifier'),
  );

// Create private state with user's birth year
const privateState = createAgeVerifierPrivateState(1990);

// Deploy or join contract...
```

### Contract Addresses

```typescript
import { getContractAddresses, areContractsDeployed } from '@midnight-cloak/contracts';

if (areContractsDeployed('preprod')) {
  const addresses = getContractAddresses('preprod');
  console.log('Age Verifier:', addresses.ageVerifier);
}
```

### Network Configuration

```typescript
import { getNetworkConfig } from '@midnight-cloak/contracts';

const config = getNetworkConfig('preprod');
console.log('Indexer:', config.indexer);
console.log('Proof Server:', config.proofServer);
```

## Contract Addresses

| Network | Contract | Address |
|---------|----------|---------|
| Preprod | Age Verifier | `11ad42b6f40f17a24bfd0d9a2410c11cfe83041459592800ff77773dee22c639` |
| Preprod | Credential Registry | `9c11690461447fc0ad72ad90ac2fda7574aebe294a7a0d2c3e7c8369f947609d` |
| Mainnet | Age Verifier | *pending mainnet launch* |
| Mainnet | Credential Registry | *pending mainnet launch* |

## Types

```typescript
import {
  VerificationStatus,
  CredentialStatus,
  CredentialType,
  Network,
} from '@midnight-cloak/contracts';

// Verification flow status
VerificationStatus.PENDING   // 'PENDING'
VerificationStatus.VERIFIED  // 'VERIFIED'
VerificationStatus.DENIED    // 'DENIED'

// Credential status (mirrors Compact enum)
CredentialStatus.ACTIVE   // 0
CredentialStatus.REVOKED  // 1

// Credential types (mirrors Compact enum)
CredentialType.AGE           // 0
CredentialType.TOKEN_BALANCE // 1
CredentialType.NFT_OWNERSHIP // 2
CredentialType.RESIDENCY     // 3
CredentialType.ACCREDITED    // 4
CredentialType.CUSTOM        // 5
```

## Development

### Project Structure

```
src/
├── age-verifier.compact           # Age verification contract
├── age-verifier-witnesses.ts      # TypeScript witnesses
├── credential-registry.compact    # Credential registry contract
├── credential-registry-witnesses.ts
├── index.ts                       # Package exports
└── managed/                       # Compiler output (gitignored)
```

### Testing

After compilation, run contract tests:

```bash
npm test
```

## Security Notes

1. **Private data stays private** - Birth years and credential data never appear on-chain
2. **Round counters** - Prevent linking transactions to the same user
3. **Commitment scheme** - Only hashes stored on-chain, not actual values
4. **Issuer authorization** - Only approved issuers can register credentials

## License

MIT
