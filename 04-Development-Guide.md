# Midnight Cloak — Development Guide

> **Purpose**: Step-by-step implementation guide for building Midnight Cloak  
> **Audience**: Solo developer (you) working with Claude CLI  
> **Last Updated**: December 2025

---

## Table of Contents

1. [Phase 1: Foundation](#phase-1-foundation-weeks-1-4)
2. [Phase 2: Core SDK MVP](#phase-2-core-sdk-mvp-weeks-5-10)
3. [Phase 3: Credential Wallet](#phase-3-credential-wallet-weeks-11-16)
4. [Phase 4: Developer Experience](#phase-4-developer-experience-weeks-17-22)
5. [Phase 5: Mainnet Launch](#phase-5-mainnet-launch-weeks-23-30)
6. [Reference: Compact Patterns](#reference-compact-patterns)
7. [Reference: Testing Strategies](#reference-testing-strategies)
8. [Reference: Deployment Checklist](#reference-deployment-checklist)

---

## Phase 1: Foundation (Weeks 1-4)

### Week 1: Environment Setup

#### Day 1-2: Install Midnight Development Stack

```bash
# 1. Prerequisites
node --version  # Should be 18+
docker --version  # Required for proof server

# 2. Create project structure
mkdir midnight-cloak && cd midnight-cloak
npm init -y

# 3. Install Midnight tools
npm install -g @midnight-ntwrk/compact-compiler

# 4. Download VS Code extension
# From: https://releases.midnight.network/
# Install .vsix in VS Code: Extensions → ... → Install from VSIX

# 5. Set up proof server
docker pull midnightnetwork/proof-server
docker run -d -p 6300:6300 --name midnight-proof midnightnetwork/proof-server
```

#### Day 3-4: Wallet Setup

1. Install Lace Wallet (Midnight edition) Chrome extension
2. Create new wallet or import existing
3. Switch to Preprod
4. Get tDUST from faucet: https://faucet.midnight.network/

#### Day 5: Verify Setup

```bash
# Create test contract
mkdir test-setup && cd test-setup

cat > hello.compact << 'EOF'
include "std";

ledger {
    message: Cell<String>;
}

export circuit setMessage(msg: String): Void {
    ledger.message = msg;
}

export circuit getMessage(): String {
    return ledger.message;
}
EOF

# Compile
compactc hello.compact

# Should generate: hello.cjs, hello.d.ts, zkir/, compiler/
ls -la
```

### Week 2: Complete Tutorials

#### Counter Tutorial
Follow: https://docs.midnight.network/develop/tutorial/

Key learnings to capture:
- How `ledger` (public) vs `witness` (private) state works
- How circuits generate proofs
- How TypeScript interacts with compiled contracts
- Transaction flow on Midnight

```bash
# Clone example repo
git clone https://github.com/midnight-ntwrk/example-counter
cd example-counter
npm install
npm run build
npm run test
```

#### Bulletin Board Tutorial
More complex example with private data:

```bash
git clone https://github.com/midnight-ntwrk/example-bboard
cd example-bboard
npm install
npm run build
```

Study these files carefully:
- `contract/src/bboard.compact` — Private message handling
- `bboard-api/src/` — TypeScript API patterns
- How selective disclosure works

### Week 3: Study Existing Identity Projects

#### IAMX Research
IAMX is partnering with Midnight for identity. Study their approach:

1. Visit their documentation/blog posts
2. Understand their credential model
3. Identify differentiation opportunities:
   - Developer experience (they focus B2B, we focus DX)
   - Specific verification types
   - Pricing model

#### Key Questions to Answer
- [ ] How do they structure credentials?
- [ ] What verification types do they support?
- [ ] How do they handle issuer trust?
- [ ] What's their integration complexity?

### Week 4: Architecture & First Contract

#### Create Project Structure

```bash
# From midnight-cloak root
mkdir -p packages/{contracts,core,react,wallet,wallet-extension}
mkdir -p apps/{demo,docs}

# Initialize workspaces
cat > package.json << 'EOF'
{
  "name": "midnight-cloak",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build:all": "npm run build --workspaces",
    "test:all": "npm run test --workspaces",
    "lint": "eslint packages apps"
  }
}
EOF

npm install
```

#### First Identity Contract

```bash
cd packages/contracts
npm init -y

cat > src/credential-registry.compact << 'EOF'
include "std";

// Credential types we support
enum CredentialType {
    AGE,
    TOKEN_BALANCE,
    NFT_OWNERSHIP
}

// Public state: what's visible on-chain
ledger {
    // Counter of issued credentials
    credentialCount: Counter;
    
    // Revocation status (credential hash -> revoked)
    isRevoked: Map<Bytes32, Boolean>;
    
    // Issuer registry (address -> authorized)
    authorizedIssuers: Map<Address, Boolean>;
}

// Private state: user-controlled, never revealed
witness {
    // The actual credential data
    credentialData: Bytes;
    
    // User's secret key for this credential
    credentialSecret: Field;
}

// Register a new issuer (admin only for MVP)
export circuit registerIssuer(issuer: Address): Void {
    ledger.authorizedIssuers[issuer] = true;
}

// Issue a new credential (called by issuer)
export circuit issueCredential(credentialHash: Bytes32): Void {
    // In full version: verify caller is authorized issuer
    ledger.credentialCount.increment(1);
}

// Revoke a credential
export circuit revokeCredential(credentialHash: Bytes32): Void {
    ledger.isRevoked[credentialHash] = true;
}

// Check if credential is revoked (public query)
export circuit isCredentialRevoked(credentialHash: Bytes32): Boolean {
    return ledger.isRevoked[credentialHash];
}
EOF
```

#### Compile and Test

```bash
compactc src/credential-registry.compact

# Create basic test
cat > tests/credential-registry.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
// Import compiled contract bindings
import { CredentialRegistry } from '../src/credential-registry.cjs';

describe('CredentialRegistry', () => {
  it('should compile successfully', () => {
    expect(CredentialRegistry).toBeDefined();
  });
  
  // More tests as we develop
});
EOF

npm install -D vitest typescript
npx vitest run
```

### Phase 1 Deliverables Checklist

- [ ] Midnight dev environment installed and working
- [ ] Proof server running locally
- [ ] Lace wallet configured on Preprod
- [ ] Counter tutorial completed
- [ ] Bulletin board tutorial completed
- [ ] IAMX research documented
- [ ] Project structure created
- [ ] First contract (credential-registry) compiling
- [ ] Basic test setup working

---

## Phase 2: Core SDK MVP (Weeks 5-10)

### Week 5-6: Age Verification Contract

The MVP focuses on one verification type: AGE. This teaches core patterns.

#### verification-engine.compact

```bash
cat > packages/contracts/src/verification-engine.compact << 'EOF'
include "std";

// Verification request state
ledger {
    // Request ID -> verified status
    verificationResults: Map<Bytes32, Boolean>;
    
    // Request ID -> timestamp
    verificationTimestamps: Map<Bytes32, Unsigned>;
    
    // Total verifications (for metrics)
    totalVerifications: Counter;
}

// Private witness for age proof
witness {
    // User's birth date (never revealed)
    birthYear: Unsigned;
    birthMonth: Unsigned;
    birthDay: Unsigned;
}

// Current date helper (in production, use oracle)
// For MVP, pass as parameter
export circuit verifyAge(
    requestId: Bytes32,
    minAge: Unsigned,
    currentYear: Unsigned,
    currentMonth: Unsigned,
    currentDay: Unsigned
): Boolean {
    // Calculate age from witness data
    var age = currentYear - witness.birthYear;
    
    // Adjust if birthday hasn't occurred this year
    if (currentMonth < witness.birthMonth) {
        age = age - 1;
    } else if (currentMonth == witness.birthMonth && currentDay < witness.birthDay) {
        age = age - 1;
    }
    
    // Check if meets requirement
    const verified = age >= minAge;
    
    // Record result on public ledger
    ledger.verificationResults[requestId] = verified;
    ledger.verificationTimestamps[requestId] = currentYear * 10000 + currentMonth * 100 + currentDay;
    ledger.totalVerifications.increment(1);
    
    // Return result (this is what gets proven)
    return verified;
}

// Query verification result
export circuit getVerificationResult(requestId: Bytes32): Boolean {
    return ledger.verificationResults[requestId];
}
EOF
```

#### Compile and Generate TypeScript

```bash
cd packages/contracts
compactc src/verification-engine.compact

# Generated files:
# - verification-engine.cjs (JS bindings)
# - verification-engine.d.ts (TypeScript types)
# - zkir/ (ZK circuit data)
# - compiler/ (compilation artifacts)
```

### Week 6-7: TypeScript SDK Core

#### Setup Core Package

```bash
cd packages/core
npm init -y
npm install typescript @midnight-ntwrk/midnight-js
npm install -D vitest @types/node

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

#### Core Types (src/types.ts)

```typescript
// src/types.ts

export type Network = 'testnet' | 'mainnet';

export type VerificationType = 'AGE' | 'TOKEN_BALANCE' | 'NFT_OWNERSHIP';

export interface ClientConfig {
  network: Network;
  apiKey: string;
  proofServerUrl?: string;
  timeout?: number;
}

export interface AgePolicy {
  minAge: number;
}

export interface TokenBalancePolicy {
  token: string;
  minBalance: number;
}

export interface NFTOwnershipPolicy {
  collection: string;
  minCount?: number;
}

export type PolicyConfig = AgePolicy | TokenBalancePolicy | NFTOwnershipPolicy;

export interface VerificationRequest {
  type: VerificationType;
  policy: PolicyConfig;
  metadata?: Record<string, string>;
  timeout?: number;
}

export interface VerificationResult {
  verified: boolean;
  requestId: string;
  timestamp: number;
  proof: Proof | null;
  error: VerificationError | null;
}

export interface Proof {
  type: 'zk-snark';
  data: Uint8Array;
  publicInputs: unknown[];
}

export interface VerificationError {
  code: string;
  message: string;
  details?: unknown;
}

// Credential types
export interface Credential {
  id: string;
  type: CredentialType;
  issuer: string;
  subject: string;
  claims: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number | null;
  signature: Uint8Array;
}

export type CredentialType = VerificationType;
```

#### Client Implementation (src/client.ts)

```typescript
// src/client.ts

import { ClientConfig, VerificationRequest, VerificationResult, Network } from './types';
import { Verifier } from './verifier';

export class MidnightCloakClient {
  private config: Required<ClientConfig>;
  private verifier: Verifier;
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(config: ClientConfig) {
    this.config = {
      network: config.network,
      apiKey: config.apiKey,
      proofServerUrl: config.proofServerUrl || this.getDefaultProofServer(config.network),
      timeout: config.timeout || 30000,
    };
    
    this.verifier = new Verifier(this.config);
  }

  private getDefaultProofServer(network: Network): string {
    return network === 'testnet' 
      ? 'http://localhost:6300'  // Local dev
      : 'https://proof.privatelogin.xyz';  // Production (future)
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    this.emit('verification:requested', request);
    
    try {
      const result = await this.verifier.verify(request);
      
      if (result.verified) {
        this.emit('verification:approved', result);
      } else {
        this.emit('verification:denied', result);
      }
      
      return result;
    } catch (error) {
      this.emit('verification:error', error, request);
      throw error;
    }
  }

  async getVerificationStatus(requestId: string): Promise<VerificationStatus> {
    return this.verifier.getStatus(requestId);
  }

  async cancelVerification(requestId: string): Promise<void> {
    return this.verifier.cancel(requestId);
  }

  on(event: string, handler: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: string, handler: Function): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach(handler => handler(...args));
  }

  disconnect(): void {
    this.verifier.disconnect();
    this.eventListeners.clear();
  }
}

export type VerificationStatus = 'pending' | 'approved' | 'denied' | 'expired';
```

#### Verifier Implementation (src/verifier.ts)

```typescript
// src/verifier.ts

import { 
  ClientConfig, 
  VerificationRequest, 
  VerificationResult,
  AgePolicy 
} from './types';
import { generateRequestId, getCurrentDate } from './utils';

export class Verifier {
  private config: Required<ClientConfig>;
  private pendingRequests: Map<string, VerificationRequest> = new Map();

  constructor(config: Required<ClientConfig>) {
    this.config = config;
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const requestId = generateRequestId();
    this.pendingRequests.set(requestId, request);

    try {
      switch (request.type) {
        case 'AGE':
          return await this.verifyAge(requestId, request.policy as AgePolicy);
        case 'TOKEN_BALANCE':
          throw new Error('TOKEN_BALANCE not yet implemented');
        case 'NFT_OWNERSHIP':
          throw new Error('NFT_OWNERSHIP not yet implemented');
        default:
          throw new Error(`Unknown verification type: ${request.type}`);
      }
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  private async verifyAge(
    requestId: string, 
    policy: AgePolicy
  ): Promise<VerificationResult> {
    // 1. Connect to wallet and get user approval
    const walletApproval = await this.requestWalletApproval(requestId, 'AGE', policy);
    
    if (!walletApproval.approved) {
      return {
        verified: false,
        requestId,
        timestamp: Date.now(),
        proof: null,
        error: { code: 'E002', message: 'User denied verification' }
      };
    }

    // 2. Generate ZK proof via proof server
    const proof = await this.generateProof(requestId, 'AGE', policy, walletApproval.credential);

    // 3. Submit proof to contract and get result
    const contractResult = await this.submitToContract(requestId, proof);

    return {
      verified: contractResult.verified,
      requestId,
      timestamp: Date.now(),
      proof: contractResult.verified ? proof : null,
      error: contractResult.verified ? null : { 
        code: 'E005', 
        message: 'Credential does not meet requirements' 
      }
    };
  }

  private async requestWalletApproval(
    requestId: string,
    type: string,
    policy: unknown
  ): Promise<{ approved: boolean; credential?: unknown }> {
    // TODO: Implement DApp Connector API integration
    // For MVP: simulate approval
    console.log(`Requesting wallet approval for ${type} verification`);
    
    // This will be replaced with actual wallet interaction
    return { approved: true, credential: { birthYear: 1990, birthMonth: 6, birthDay: 15 } };
  }

  private async generateProof(
    requestId: string,
    type: string,
    policy: unknown,
    credential: unknown
  ): Promise<any> {
    // TODO: Integrate with Midnight proof server
    // For MVP: placeholder
    console.log(`Generating proof for ${type}`);
    
    return {
      type: 'zk-snark',
      data: new Uint8Array(32),
      publicInputs: [requestId, (policy as AgePolicy).minAge]
    };
  }

  private async submitToContract(
    requestId: string,
    proof: unknown
  ): Promise<{ verified: boolean }> {
    // TODO: Submit to Midnight contract
    // For MVP: placeholder
    console.log(`Submitting proof to contract`);
    
    return { verified: true };
  }

  async getStatus(requestId: string): Promise<'pending' | 'approved' | 'denied' | 'expired'> {
    if (this.pendingRequests.has(requestId)) {
      return 'pending';
    }
    // TODO: Query contract for result
    return 'expired';
  }

  async cancel(requestId: string): Promise<void> {
    this.pendingRequests.delete(requestId);
  }

  disconnect(): void {
    this.pendingRequests.clear();
  }
}
```

### Week 8: Minimal Credential Wallet

Create a simple test wallet for development:

```bash
cd packages/wallet
npm init -y
npm install typescript
```

#### Credential Manager (src/credential-manager.ts)

```typescript
// src/credential-manager.ts

import { Credential, CredentialType } from '@midnight-cloak/core';

export class CredentialManager {
  private credentials: Map<string, Credential> = new Map();
  private storageKey = 'midnight-cloak:credentials';

  constructor() {
    this.loadFromStorage();
  }

  async store(credential: Credential): Promise<void> {
    this.credentials.set(credential.id, credential);
    this.saveToStorage();
  }

  async get(id: string): Promise<Credential | undefined> {
    return this.credentials.get(id);
  }

  async getAll(): Promise<Credential[]> {
    return Array.from(this.credentials.values());
  }

  async getByType(type: CredentialType): Promise<Credential[]> {
    return Array.from(this.credentials.values())
      .filter(c => c.type === type);
  }

  async delete(id: string): Promise<void> {
    this.credentials.delete(id);
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const cred of parsed) {
          this.credentials.set(cred.id, cred);
        }
      }
    } catch (e) {
      console.error('Failed to load credentials:', e);
    }
  }

  private saveToStorage(): void {
    try {
      const toStore = Array.from(this.credentials.values());
      localStorage.setItem(this.storageKey, JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save credentials:', e);
    }
  }
}
```

### Week 9-10: Demo App & Integration Testing

#### Create Demo App

```bash
cd apps/demo
npm create vite@latest . -- --template react-ts
npm install @midnight-cloak/core @midnight-cloak/react
```

#### Simple Demo (src/App.tsx)

```tsx
// apps/demo/src/App.tsx

import { useState } from 'react';
import { MidnightCloakClient } from '@midnight-cloak/core';

const client = new MidnightCloakClient({
  network: 'testnet',
  apiKey: 'demo-key'
});

function App() {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setStatus('verifying');
    setError(null);

    try {
      const result = await client.verify({
        type: 'AGE',
        policy: { minAge: 18 }
      });

      if (result.verified) {
        setStatus('verified');
      } else {
        setStatus('denied');
        setError(result.error?.message || 'Verification failed');
      }
    } catch (e) {
      setStatus('denied');
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <div className="app">
      <h1>Midnight Cloak Demo</h1>
      
      <div className="status">
        Status: {status}
        {error && <p className="error">{error}</p>}
      </div>

      {status === 'idle' && (
        <button onClick={handleVerify}>
          Verify Age (18+)
        </button>
      )}

      {status === 'verifying' && (
        <p>Waiting for wallet approval...</p>
      )}

      {status === 'verified' && (
        <div className="success">
          <h2>✓ Verified!</h2>
          <p>You have proven you are 18+ without revealing your birthdate.</p>
        </div>
      )}

      {status === 'denied' && (
        <button onClick={handleVerify}>
          Try Again
        </button>
      )}
    </div>
  );
}

export default App;
```

### Phase 2 Deliverables Checklist

- [ ] verification-engine.compact contract complete
- [ ] Contract compiles and generates TypeScript bindings
- [ ] @midnight-cloak/core package with MidnightCloakClient
- [ ] Verifier class with age verification flow
- [ ] Basic CredentialManager in wallet package
- [ ] Demo app running on localhost
- [ ] End-to-end flow working (with mocked wallet)
- [ ] Unit tests for SDK core
- [ ] Documentation for SDK usage

---

## Phase 3: Credential Wallet (Weeks 11-16)

### Focus Areas

1. **Chrome Extension Structure** (Week 11-12)
2. **Wallet Connection & DApp Connector** (Week 13)
3. **Verification Request UI** (Week 14)
4. **Additional Verification Types** (Week 15-16)

### Chrome Extension Skeleton

```bash
cd packages/wallet-extension

cat > manifest.json << 'EOF'
{
  "manifest_version": 3,
  "name": "Midnight Cloak Wallet",
  "version": "0.1.0",
  "description": "Manage your privacy-preserving credentials",
  "permissions": ["storage", "activeTab"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }]
}
EOF
```

*Detailed implementation continues in weeks 11-16...*

---

## Phase 4: Developer Experience (Weeks 17-22)

### Focus Areas

1. **Developer Dashboard** (usage tracking, API keys)
2. **Interactive Documentation** (code playground)
3. **Custom Policy Builder UI**
4. **Beta Partner Integrations**

---

## Phase 5: Mainnet Launch (Weeks 23-30)

### Focus Areas

1. **Security Audit**
2. **Mainnet Deployment**
3. **Billing & Metering**
4. **Marketing & Outreach**

---

## Reference: Compact Patterns

### Pattern: Private Comparison

```compact
// Prove value >= threshold without revealing value
witness {
    secretValue: Unsigned;
}

export circuit proveGreaterThan(threshold: Unsigned): Boolean {
    return witness.secretValue >= threshold;
}
```

### Pattern: Membership Proof

```compact
// Prove membership in set without revealing which element
ledger {
    validMembers: Set<Bytes32>;
}

witness {
    memberSecret: Bytes32;
}

export circuit proveMembership(): Boolean {
    return ledger.validMembers.contains(hash(witness.memberSecret));
}
```

### Pattern: Range Proof

```compact
// Prove value is in range [min, max]
witness {
    value: Unsigned;
}

export circuit proveInRange(min: Unsigned, max: Unsigned): Boolean {
    return witness.value >= min && witness.value <= max;
}
```

---

## Reference: Testing Strategies

### Unit Testing (Vitest)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MidnightCloakClient } from '../src/client';

describe('MidnightCloakClient', () => {
  let client: MidnightCloakClient;

  beforeEach(() => {
    client = new MidnightCloakClient({
      network: 'testnet',
      apiKey: 'test-key'
    });
  });

  it('should initialize with correct config', () => {
    expect(client).toBeDefined();
  });

  it('should emit events on verification', async () => {
    const events: string[] = [];
    client.on('verification:requested', () => events.push('requested'));
    client.on('verification:approved', () => events.push('approved'));

    await client.verify({ type: 'AGE', policy: { minAge: 18 } });

    expect(events).toContain('requested');
  });
});
```

### Integration Testing

```typescript
// Test with real proof server
describe('Integration: Proof Generation', () => {
  it('should generate valid proof', async () => {
    // Requires Docker proof server running
    const proof = await generateProof(...);
    expect(proof.type).toBe('zk-snark');
    expect(proof.data.length).toBeGreaterThan(0);
  });
});
```

### E2E Testing

```typescript
// Test full flow on testnet
describe('E2E: Age Verification', () => {
  it('should complete full verification flow', async () => {
    // 1. Deploy contract to testnet
    // 2. Create verification request
    // 3. Simulate wallet approval
    // 4. Generate and submit proof
    // 5. Verify result on-chain
  });
});
```

---

## Reference: Deployment Checklist

### Pre-Mainnet

- [ ] All contracts audited
- [ ] SDK security review complete
- [ ] Penetration testing passed
- [ ] Load testing passed
- [ ] Documentation complete
- [ ] Support channels established

### Mainnet Deployment

- [ ] Contract deployment to mainnet
- [ ] SDK published to npm
- [ ] Documentation site live
- [ ] Monitoring & alerting configured
- [ ] Backup & recovery tested
- [ ] Legal review complete

### Post-Launch

- [ ] Monitor for issues
- [ ] Respond to user feedback
- [ ] Track adoption metrics
- [ ] Plan next features

---

*This is a living document. Update as the project evolves.*
