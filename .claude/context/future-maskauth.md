# CloakAuth - Future Feature Idea

> **Status**: Parked for later development
> **Created**: December 2025
> **Priority**: Post-MVP (Phase 3+)

---

## Concept

A ZK-enhanced TOTP authenticator app that improves on Google Authenticator with configurable parameters and Web3 integration.

## Differentiators

| Feature | Google Authenticator | CloakAuth |
|---------|---------------------|----------|
| Time step | Fixed 30s | **10-30s configurable slider** |
| Digits | Fixed 6 | 6-8 configurable |
| Algorithm | SHA-1 only | SHA-1/256/512 options |
| Backup | Google account linked | ZK-encrypted local + optional IPFS |
| Export | Limited | Open JSON + QR codes |
| Organization | Flat list | Folders + tags + search |
| Web3 | None | Prove 2FA status on-chain via ZK |
| Recovery | Device-bound | Optional ZK recovery proof |

## Technical Foundation

### RFC 6238 Parameters
Standard TOTP supports these configurable values (ignored by Google Auth):
- `T0`: Unix time to start counting (default: 0)
- `X`: Time step interval (default: 30s, **we allow 10-30s**)
- Digits: Output length (default: 6)
- Algorithm: HMAC function (SHA-1/256/512)

### ZK Integration Points
1. **Backup encryption**: Credentials encrypted with ZK-provable key
2. **On-chain proof**: "I have 2FA enabled" without revealing codes
3. **Recovery**: Prove identity to recover without exposing secrets
4. **Cross-device sync**: IPFS + ZK for trustless sync

## Existing Projects to Study

| Project | Link | Notes |
|---------|------|-------|
| zkAuth | https://ethglobal.com/showcase/zkauth-zgdq7 | On-chain 2FA, ERC-4337 |
| zkOTP | https://github.com/socathie/zkOTP | Merkle tree of future TOTPs |
| Aegis | https://getaegis.app/ | Best open-source Android TOTP |
| 2FAS | https://2fas.com/ | Clean UX reference |
| Ente Auth | https://ente.io/auth/ | Cross-platform, encrypted |

## Architecture Options

### Option A: Feature in Midnight Cloak Wallet
- Add as a tab/section in the credential wallet
- Shared encryption and backup infrastructure
- Lower development overhead
- Natural cross-promotion

### Option B: Standalone CloakAuth App
- Separate branding and marketing
- Different audience (broader than Web3)
- Can iterate independently
- Potential separate revenue stream

**Recommendation**: Start as wallet feature, spin out if traction warrants.

## Business Model Ideas

- **Free tier**: Basic TOTP, 10 accounts
- **Premium** ($2-4/mo): Unlimited accounts, cloud backup, folders
- **Web3 features**: Free (drives Midnight Cloak adoption)

## Security Considerations

- Front-running attacks on on-chain OTP submission
- Time synchronization across devices
- Backup encryption key management
- QR code scanning security

## Implementation Notes

```typescript
// Core TOTP with configurable params
interface TOTPConfig {
  secret: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 7 | 8;
  period: number; // 10-30 seconds
  issuer?: string;
  account?: string;
}

// Generate code
function generateTOTP(config: TOTPConfig, timestamp?: number): string {
  const time = timestamp ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(time / config.period);
  // HMAC-based OTP generation per RFC 6238
  return hotp(config.secret, counter, config.algorithm, config.digits);
}
```

## Next Steps (When Ready)

1. Review Aegis source code for Android patterns
2. Design encrypted backup schema
3. Prototype configurable time step UI
4. Research ZK circuits for OTP proof
5. Define MVP feature set

---

*This document will be revisited after Midnight Cloak SDK MVP is complete.*
