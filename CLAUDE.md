# CLAUDE.md - MaskID Project Context

> **Purpose**: This file provides context for Claude CLI sessions when developing the MaskID project. Place this file in your project root.

---

## Project Overview

**MaskID** is a zero-knowledge identity verification infrastructure for Midnight (Cardano's privacy-focused partner chain). It enables users to prove attributes (age, token holdings, residency) without revealing underlying personal data.

### Core Products
1. **Developer SDK** (`@maskid/*`) — TypeScript SDK for dApp developers to integrate identity verification
2. **Credential Wallet** — Consumer-facing Chrome extension/web app for managing verifiable credentials

### Value Proposition
- "Prove who you are without showing who you are"
- Zero data liability for developers (they receive proofs, not personal data)
- First-mover advantage on Midnight's identity layer

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | **Compact** (Midnight's ZK-native language) |
| SDK | **TypeScript**, Midnight.js 1.0.0 |
| Wallet | **React + Vite**, Chrome Extension APIs |
| Wallet Integration | Lace, NuFi, Vespr via DApp Connector API v2.0 |
| Proof Server | Midnight Docker images |
| Network | Midnight Testnet-02 → Mainnet |
| Tokens | DUST (tx fees), NIGHT (governance) |

---

## Project Structure

```
maskid/
├── packages/
│   ├── contracts/           # Compact smart contracts
│   │   ├── src/
│   │   │   ├── credential-registry.compact
│   │   │   ├── verification-engine.compact
│   │   │   ├── policy-evaluator.compact
│   │   │   └── issuer-registry.compact
│   │   └── tests/
│   ├── core/                # @privatelogin/core
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── verifier.ts
│   │   │   ├── policy-builder.ts
│   │   │   └── types.ts
│   │   └── tests/
│   ├── react/               # @privatelogin/react
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── VerifyButton.tsx
│   │   │   │   └── CredentialGate.tsx
│   │   │   └── hooks/
│   │   │       └── useVerification.ts
│   │   └── tests/
│   ├── wallet/              # @privatelogin/wallet
│   │   └── src/
│   └── wallet-extension/    # Chrome extension
│       ├── src/
│       │   ├── popup/
│       │   ├── background/
│       │   └── content/
│       └── manifest.json
├── apps/
│   ├── demo/                # Demo dApp for testing
│   ├── docs/                # Documentation site
│   └── dashboard/           # Developer dashboard (future)
├── docs/                    # Project documentation
├── CLAUDE.md                # This file
└── package.json
```

---

## Development Commands

```bash
# Environment Setup (first time)
npm install                          # Install dependencies
docker-compose up -d                 # Start Midnight proof server

# Compact Contracts
cd packages/contracts
npx compactc src/credential-registry.compact  # Compile contract
npm run test                         # Run contract tests
npm run deploy:testnet               # Deploy to Testnet-02

# SDK Development
cd packages/core
npm run build                        # Build TypeScript
npm run test                         # Run tests
npm run test:watch                   # Watch mode

# Wallet Extension
cd packages/wallet-extension
npm run dev                          # Development build with hot reload
npm run build                        # Production build
# Load unpacked extension from dist/ in Chrome

# Demo App
cd apps/demo
npm run dev                          # Start Vite dev server

# Full Project
npm run build:all                    # Build all packages
npm run test:all                     # Run all tests
npm run lint                         # Lint all packages
```

---

## Compact Language Quick Reference

Compact is Midnight's domain-specific language for ZK smart contracts. Key concepts:

```compact
// Include standard library
include "std";

// Define public state (visible on-chain)
ledger {
    credentialCount: Counter;
    isRevoked: Map<CredentialId, Boolean>;
}

// Define private state (user-controlled, never revealed)
witness {
    birthDate: Date;
    credentialSecret: Field;
}

// Public circuit (callable, generates ZK proof)
export circuit verifyAge(minAge: Unsigned): Boolean {
    // Access private witness data
    const age = currentDate() - witness.birthDate;
    
    // Return result (only this is revealed, not birthDate)
    return age >= minAge;
}

// Increment public counter
export circuit issueCredential(): Void {
    ledger.credentialCount.increment(1);
}
```

### Key Patterns
- `ledger {}` — Public state, visible on Midnight
- `witness {}` — Private state, user-controlled
- `export circuit` — Public function generating ZK proof
- Use `disclose()` for explicit selective disclosure

---

## SDK API Design (Target)

```typescript
// Initialize client
import { MaskIDClient } from '@maskid/core';

const client = new MaskIDClient({
  network: 'testnet',
  apiKey: 'your-api-key'  // For metered billing
});

// Simple age verification
const result = await client.verify({
  type: 'AGE',
  policy: { minAge: 18 }
});

if (result.verified) {
  // User is 18+, grant access
}

// Complex policy with PolicyBuilder
import { PolicyBuilder } from '@maskid/core';

const policy = new PolicyBuilder()
  .requireAge(21)
  .and()
  .requireTokenBalance('ADA', 1000)
  .build();

const result = await client.verify({ policy });

// React component usage
import { VerifyButton, CredentialGate } from '@maskid/react';

// Simple button
<VerifyButton 
  type="AGE" 
  minAge={18} 
  onVerified={() => setAccess(true)} 
/>

// Gate content behind verification
<CredentialGate require={{ type: 'AGE', minAge: 21 }}>
  <RestrictedContent />
</CredentialGate>
```

---

## Credential Schema

```typescript
interface Credential {
  id: string;                    // UUID
  type: CredentialType;          // AGE, TOKEN_BALANCE, NFT_OWNERSHIP, etc.
  issuer: Address;               // Midnight address of issuer
  subject: Address;              // User's Midnight address
  claims: Record<string, any>;   // { birthDate: '1990-01-15' }
  issuedAt: number;              // Unix timestamp
  expiresAt: number | null;      // Optional expiration
  signature: Uint8Array;         // Issuer's signature
}

type CredentialType = 
  | 'AGE'
  | 'TOKEN_BALANCE'
  | 'NFT_OWNERSHIP'
  | 'RESIDENCY'
  | 'ACCREDITED'
  | 'CREDENTIAL';
```

---

## Project Roadmap

### Phase 1: Foundation (Complete)
- [x] Environment setup
- [x] Midnight tutorial completion (counter, bulletin board)
- [x] Project architecture design
- [x] Documentation framework

### Phase 2: Core SDK MVP (Current)
- [x] Design credential schema for age verification
- [x] Build Compact contracts (age-verifier, credential-registry)
- [x] ZK circuit compilation via WSL Compact CLI
- [x] Create TypeScript SDK (@maskid/core)
- [x] Build React components (@maskid/react)
- [x] Create demo dApp with mock wallet flow
- [ ] Deploy contracts to testnet (blocked: waiting for tDUST/Preview network)
- [ ] End-to-end verification with real wallet
- [ ] Developer documentation

### Phase 3: Wallet Extension + Credentials
- [ ] Chrome extension scaffold
- [ ] Credential storage and management
- [ ] Multi-wallet support (Lace, NuFi, Vespr)
- [ ] Credential issuance flow
- [ ] MaskAuth integration (optional - see `.claude/context/future-maskauth.md`)

### Phase 4: $Handle Shield ("Portfolio Blackout")
- [ ] Cardano ↔ Midnight bridge integration
- [ ] $handle claim circuit (prove NFT ownership)
- [ ] Asset shielding UI in wallet
- [ ] ZK proofs for hidden holdings
- [ ] Android app integration (existing $handle lookup app)
- [ ] Selective disclosure settings

> **Note**: Phase 4 depends on Midnight bridge availability.
> See `.claude/context/future-handle-shield.md` for full spec.

### Phase 5: Production & Growth
- [ ] Mainnet deployment
- [ ] Developer dashboard
- [ ] Additional verification types (TOKEN_BALANCE, NFT_OWNERSHIP, RESIDENCY)
- [ ] Partner integrations

---

## Key Files to Reference

When working on specific areas, reference these files:

| Task | Files |
|------|-------|
| Contract logic | `packages/contracts/src/*.compact` |
| SDK core | `packages/core/src/client.ts`, `verifier.ts` |
| React components | `packages/react/src/components/*.tsx` |
| Type definitions | `packages/core/src/types.ts` |
| Wallet logic | `packages/wallet/src/credential-manager.ts` |
| Extension popup | `packages/wallet-extension/src/popup/` |

---

## Testing Strategy

```bash
# Unit tests for SDK
npm run test:unit

# Integration tests (requires proof server)
docker-compose up -d
npm run test:integration

# E2E tests (requires testnet)
npm run test:e2e

# Contract tests
cd packages/contracts && npm run test
```

### Test Coverage Targets
- SDK Core: >90% coverage
- React Components: >80% coverage
- Contracts: 100% critical paths

---

## Common Tasks

### Adding a New Verification Type

1. Define type in `packages/core/src/types.ts`
2. Add Compact circuit in `packages/contracts/src/verification-engine.compact`
3. Add SDK support in `packages/core/src/verifier.ts`
4. Add React component variant if needed
5. Update documentation
6. Add tests for all layers

### Deploying Contract Updates

```bash
cd packages/contracts
npm run compile
npm run deploy:testnet
# Update contract addresses in packages/contracts/src/addresses.ts
npm run build:all  # Rebuild SDK with new addresses
```

### Testing Wallet Flows

1. Build extension: `cd packages/wallet-extension && npm run build`
2. Load in Chrome: Extensions → Load unpacked → select `dist/`
3. Connect to testnet, get tDUST from faucet
4. Run demo app: `cd apps/demo && npm run dev`
5. Test verification flow end-to-end

---

## Resources

### Midnight Documentation
- Developer Tutorial: https://docs.midnight.network/develop/tutorial
- Compact Language: https://docs.midnight.network/develop/tutorial/high-level-arch
- Midnight.js API: Check release notes in docs
- Releases: https://releases.midnight.network/

### Project Documentation
- Master Project Document: `docs/01-Master-Project-Document.docx`
- Technical Architecture: `docs/02-Technical-Architecture.docx`
- API Specification: `docs/03-API-Specification.md`
- Development Guide: `docs/04-Development-Guide.md`

### Community
- Midnight Discord: Join for dev support
- IAMX (competitor/reference): Study their approach

---

## Coding Standards

### TypeScript
- Use strict mode
- Prefer `const` over `let`
- Use explicit return types on public functions
- Document public APIs with JSDoc

### Compact
- Follow Midnight examples style
- Comment complex ZK logic
- Keep circuits focused (single responsibility)

### React
- Functional components only
- Use TypeScript generics for component props
- Tailwind for styling
- Test with React Testing Library

### Git
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
- Branch naming: `feature/description`, `fix/description`
- PR required for main branch

---

## Environment Variables

```bash
# .env.local (never commit)
MIDNIGHT_NETWORK=testnet
MIDNIGHT_API_KEY=your-api-key
PROOF_SERVER_URL=http://localhost:6300
MASKID_API_KEY=dev-key

# For wallet extension
REACT_APP_MIDNIGHT_NETWORK=testnet
```

---

## Troubleshooting

### Proof server not responding
```bash
docker-compose logs proof-server
docker-compose restart proof-server
```

### Contract compilation errors
- Check Compact syntax against latest examples
- Ensure `include "std";` at top
- Verify field types match Midnight primitives

### Wallet connection issues
- Clear extension storage
- Check Lace wallet is on correct network
- Verify DApp Connector API version

---

## Notes for Claude CLI

When I ask for help with this project:

1. **Compact contracts**: Reference Midnight's Compact language—it's similar to TypeScript but has ZK-specific constructs (`ledger`, `witness`, `circuit`)

2. **SDK design**: Prioritize developer experience. The API should feel like Stripe or Firebase—simple surface, powerful underneath

3. **Privacy-first**: Always consider what information is being disclosed. Default to minimal disclosure

4. **Phased approach**: We're in Phase 2 (MVP). Don't over-engineer—get core flows working first

5. **Solo dev context**: Solutions should be maintainable by one person. Prefer simplicity over cleverness

6. **Testing**: Every feature needs tests. Help me write them alongside implementation

7. **Branding**: The project is called **MaskID**, packages use `@maskid/*` namespace

---

*Last updated: December 2025*
