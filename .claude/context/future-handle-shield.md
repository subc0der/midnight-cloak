# $Handle Shield - Portfolio Blackout Feature

> **Status**: Planned for Phase 4
> **Created**: December 2025
> **Priority**: Post-MVP (requires Cardano ↔ Midnight bridge)
> **Origin**: User feedback from $handle lookup app development

---

## Problem Statement

Cardano's $handle system creates a **privacy paradox**:
- Great for UX (human-readable addresses like `$subcoder`)
- Terrible for privacy (anyone can see entire portfolio via $handle lookup)

**Real-world impacts:**
- Whales can be targeted/tracked
- Traders reveal strategies through holdings
- Regular users have no financial privacy
- NFT collectors expose their full collections

---

## Concept: "$Handle Shield"

Allow users to "blackout" their portfolios from $handle lookups while retaining the ability to prove holdings via ZK proofs when needed.

```
┌─────────────────────────────────────────────────────┐
│  $subcoder (Public Cardano L1)                      │
│  ├── 50 ADA (visible - "public wallet")            │
│  └── 2 NFTs (visible - chosen to display)          │
│                                                     │
│  $subcoder.midnight (Shielded on Midnight)          │
│  ├── ??? ADA (hidden from lookups)                  │
│  ├── ??? Tokens (hidden from lookups)               │
│  └── Can PROVE: "I hold >10k ADA" via ZK proof      │
└─────────────────────────────────────────────────────┘
```

---

## User Flow

### Shielding Assets
1. User connects Lace wallet (holds $handle NFT)
2. User selects assets to shield
3. Assets bridge from Cardano → Midnight shielded pool
4. $handle lookups now only show remaining public assets

### Proving Shielded Holdings
1. DeFi app requests proof: "Do you hold >1000 ADA?"
2. User generates ZK proof from shielded balance
3. App receives boolean result, never sees actual balance

### Selective Disclosure
- "Show my NFTs, hide my token balances"
- "Show I hold SUNDAE, hide the amount"
- "Prove I'm a whale without showing exactly how much"

---

## Technical Architecture

### Components Required

| Component | Description | Dependency |
|-----------|-------------|------------|
| Cardano ↔ Midnight Bridge | Move assets between chains | Midnight team |
| $Handle Claim Circuit | Prove ownership of $handle NFT | MaskID |
| Shielded Balance Tracker | Track balances in Midnight | MaskID |
| Proof Generation | ZK proofs of holdings | MaskID (exists) |
| Visibility Settings UI | User controls what's public | MaskID Wallet |

### Compact Contract: handle-shield.compact

```compact
include "std";

ledger {
  // Map $handle hash to shielded address
  handleToShield: Map<Bytes32, ShieldedAddress>;

  // Visibility preferences per handle
  visibilitySettings: Map<Bytes32, VisibilityFlags>;
}

witness {
  // User's actual shielded balances
  shieldedAda: Unsigned;
  shieldedTokens: Map<PolicyId, Unsigned>;

  // Proof of $handle ownership
  handleOwnershipProof: HandleProof;
}

// Claim a $handle on Midnight
export circuit claimHandle(handleHash: Bytes32): Void {
  // Verify user owns the $handle NFT on Cardano
  assert(verifyHandleOwnership(witness.handleOwnershipProof, handleHash));

  // Register shielded address for this handle
  ledger.handleToShield[handleHash] = witness.shieldedAddress;
}

// Prove balance threshold without revealing amount
export circuit proveBalanceThreshold(minAda: Unsigned): Boolean {
  return witness.shieldedAda >= minAda;
}

// Prove token ownership without revealing amount
export circuit proveTokenOwnership(policyId: PolicyId): Boolean {
  return ledger.shieldedTokens[policyId] > 0;
}
```

### Integration with $Handle Lookup Apps

```typescript
// In $handle lookup app (e.g., user's Android app)
interface HandleLookupResult {
  handle: string;
  publicAddress: string;
  publicAssets: Asset[];

  // New fields for shield integration
  hasShieldedAssets: boolean;
  shieldedProofEndpoint?: string; // Where to request proofs
}

async function lookupHandle(handle: string): Promise<HandleLookupResult> {
  const cardanoAssets = await getCardanoAssets(handle);
  const shieldStatus = await checkMidnightShield(handle);

  return {
    handle,
    publicAddress: cardanoAssets.address,
    publicAssets: cardanoAssets.assets,
    hasShieldedAssets: shieldStatus.isShielded,
    shieldedProofEndpoint: shieldStatus.proofEndpoint
  };
}
```

---

## How It Fits MaskID

| MaskID Core | $Handle Shield |
|-------------|----------------|
| Prove identity attributes | Prove asset holdings |
| Hide personal data | Hide portfolio data |
| Credential verification | Balance verification |
| `verifyAge()` | `proveBalanceThreshold()` |

**Shared infrastructure:**
- Same ZK proof generation
- Same wallet integration
- Same React components (with new props)
- Same contract deployment pipeline

---

## Business Value

### For Users
- Financial privacy without leaving Cardano ecosystem
- Selective disclosure (prove what you need, hide what you don't)
- Protection from tracking, targeting, and social engineering

### For MaskID
- Unique differentiator (no competitors doing this)
- Drives adoption of MaskID wallet
- Real user pain point with clear solution
- Potential premium feature for revenue

### For $Handle Ecosystem
- Makes $handles more attractive (privacy + convenience)
- Could partner with ADA Handle team
- Enhances overall Cardano privacy story

---

## Competitive Landscape

| Solution | Approach | Limitation |
|----------|----------|------------|
| New wallet address | Move assets to unknown address | Lose $handle convenience |
| Multiple $handles | Split holdings across handles | Complex, still public |
| Mixer services | Obscure transaction history | Regulatory concerns, no proof capability |
| **$Handle Shield** | ZK shielding with proof capability | Requires Midnight bridge |

---

## Dependencies & Timeline

### Blockers
1. **Cardano ↔ Midnight bridge** - Must exist and be stable
2. **Midnight mainnet/stable testnet** - Currently in flux
3. **MaskID core SDK** - Must be complete first

### Estimated Phase
```
Phase 2: MaskID Core MVP ← current
Phase 3: Wallet Extension + Credential Management
Phase 4: $Handle Shield ← this feature
  └── 4.1: Bridge integration research
  └── 4.2: $handle claim circuit
  └── 4.3: Shielding UI in wallet
  └── 4.4: Proof generation for holdings
  └── 4.5: Android app integration
```

---

## Open Questions

1. **Bridge mechanics**: How will the Cardano ↔ Midnight bridge work exactly?
2. **$Handle resolution**: Can we add Midnight lookup to existing $handle resolvers?
3. **ADA Handle partnership**: Should we approach them for integration?
4. **Fee model**: Who pays for shielding transactions?
5. **Unshielding flow**: How do users move assets back to public?

---

## Android App Integration

User's existing $handle lookup app could be enhanced:

```kotlin
// Show shield status in lookup results
data class HandleResult(
    val handle: String,
    val publicAssets: List<Asset>,
    val isPartiallyShielded: Boolean,
    val shieldBadge: ShieldStatus // NONE, PARTIAL, FULL
)

// UI indicator
@Composable
fun HandleCard(result: HandleResult) {
    Row {
        Text(result.handle)
        if (result.isPartiallyShielded) {
            ShieldIcon() // 🛡️ indicates some assets hidden
            Text("Some assets shielded")
        }
    }
}
```

---

## Next Steps (When Ready)

1. Monitor Midnight bridge development announcements
2. Research $handle NFT structure for ownership proofs
3. Design shielding UX mockups
4. Spec out visibility settings schema
5. Prototype claim circuit once bridge exists
6. Coordinate with ADA Handle team if interested

---

*This document will be revisited once the Cardano ↔ Midnight bridge is available.*
