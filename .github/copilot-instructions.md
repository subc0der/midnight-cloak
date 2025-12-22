# GitHub Copilot Instructions for MaskID

## Project Overview

MaskID is a zero-knowledge identity verification SDK for the Midnight blockchain (Cardano's privacy-focused partner chain). It enables users to prove attributes (age, credentials) without revealing underlying personal data.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | **Compact** (Midnight's ZK-native language) |
| SDK | TypeScript, Midnight.js |
| React Components | React 18+, TypeScript |
| Wallet Integration | CIP-30 (Lace, NuFi, Vespr) |
| Network | Midnight Testnet → Mainnet |

## Known Patterns - Do Not Flag

### 1. Mock Wallet Implementation
The SDK includes a mock wallet system for demo/testing purposes. This is intentional:
```typescript
useMockWallet(birthYear: number)  // Sets up mock wallet with birth year for testing
```
This is NOT a security issue - it's a developer experience feature for local testing.

### 2. Compact Language Files (*.compact)
Files ending in `.compact` are Midnight's ZK smart contract language. They have unique syntax:
- `ledger {}` - Public on-chain state
- `witness {}` - Private user-controlled state
- `export circuit` - Public functions generating ZK proofs
- `Uint<16>`, `Bytes<32>` - Sized types

Do not flag Compact syntax as errors.

### 3. Placeholder Contract Addresses
```typescript
const CONTRACT_ADDRESSES = {
  ageVerifier: '0x...',  // Placeholder until testnet deployment
}
```
These are intentionally placeholder values. Testnet deployment is blocked pending tDUST availability.

### 4. Window.cardano Type Extensions
The codebase extends the Window interface for CIP-30 wallet integration:
```typescript
declare global {
  interface Window {
    cardano?: { ... }
  }
}
```
This is the standard pattern for Cardano wallet detection.

### 5. Error Code Constants
We use numeric error codes intentionally for type-safe error handling:
```typescript
export const ErrorCodes = {
  WALLET_NOT_CONNECTED: 1001,
  VERIFICATION_FAILED: 2001,
  // ...
}
```

### 6. Build Artifacts in .gitignore
The `.gitignore` excludes `packages/*/src/**/*.js` etc. because TypeScript compiles in-place during development. This is intentional.

## Current Development Status

- **Phase 2 (Current):** Core SDK MVP - building local, waiting for testnet
- **Blocked:** tDUST faucet unavailable, Midnight Preview network pending
- **Tests:** All passing locally
- **Demo:** Works in mock mode

## Code Review Focus Areas

When reviewing, please focus on:
1. TypeScript type safety
2. React hook patterns and component design
3. Error handling completeness
4. Security considerations for wallet interactions
5. API design consistency

## Do NOT Flag

- Unused exports in index.ts files (they're public API surface)
- `any` types in Midnight.js integration code (SDK types are incomplete)
- Mock implementations (intentional for dev experience)
- Placeholder values for contract addresses
- Console.log statements in demo app (intentional for debugging)
- TODO comments (tracked in project roadmap)

## Package Structure

```
packages/
├── core/       # @maskid/core - Main SDK
├── react/      # @maskid/react - React components
├── contracts/  # Compact smart contracts
apps/
├── demo/       # Demo application
```

## Testing

```bash
pnpm --filter @maskid/core test   # Run core tests (8 tests)
pnpm --filter @maskid/core build  # Build core package
```

All tests should pass before merge.
