# Security Architecture

> This document explains the security design decisions in Midnight Cloak.

---

## Overview

Midnight Cloak is a zero-knowledge identity verification SDK. Security and privacy are foundational to the project. This document details our cryptographic choices and architecture decisions.

---

## Cryptographic Choices

### Encryption: AES-256-GCM

We use AES-256-GCM (Advanced Encryption Standard with Galois/Counter Mode) for encrypting stored credentials.

**Why AES-256-GCM:**

- **Authenticated encryption**: Provides both confidentiality and integrity. Tampered ciphertext fails to decrypt.
- **Industry standard**: Used by Google, Apple, Signal, and TLS 1.3.
- **Hardware acceleration**: Modern CPUs include AES-NI instructions for high performance.
- **Native browser support**: Available in Web Crypto API without external dependencies.
- **Key size**: 256-bit keys provide strong long-term security.

**Alternatives considered:**

| Algorithm | Decision | Reason |
|-----------|----------|--------|
| AES-CBC + HMAC | Rejected | More complex, prone to implementation errors |
| ChaCha20-Poly1305 | Rejected | Not available in Web Crypto API natively |
| AES-128-GCM | Rejected | 256-bit provides better long-term margin |

---

### Key Derivation: Argon2id

We use Argon2id for deriving encryption keys from user passwords.

**Why Argon2id:**

- **Memory-hard**: Requires significant RAM per attempt, making GPU/ASIC attacks expensive.
- **Winner of Password Hashing Competition (2015)**: Peer-reviewed and vetted by cryptographers.
- **Industry adoption**: Used by 1Password, Bitwarden, and other security-focused applications.
- **Hybrid design**: Combines side-channel resistance (Argon2i) with GPU resistance (Argon2d).

**Our parameters:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Memory | 64 MB | Significant cost per attempt while remaining browser-compatible |
| Iterations | 3 | Recommended minimum for Argon2id |
| Parallelism | 1 | Single-threaded for browser compatibility |

**Alternatives considered:**

| Algorithm | Decision | Reason |
|-----------|----------|--------|
| PBKDF2 | Rejected | Not memory-hard; vulnerable to GPU acceleration |
| bcrypt | Rejected | Fixed 4KB memory cost; less configurable |
| scrypt | Rejected | More complex parameter tuning; less browser support |

---

### Random Number Generation

We use the Web Crypto API's `crypto.getRandomValues()` for all random generation:

- Salt generation (16 bytes)
- IV/nonce generation (12 bytes per encryption)
- Any other cryptographic randomness

This provides cryptographically secure pseudo-random numbers (CSPRNG) from the browser's native implementation.

---

## Extension Security

### Manifest V3

The wallet extension uses Chrome's Manifest V3, the latest extension platform.

**Security benefits:**

- **Service workers**: No persistent background page; reduced attack surface.
- **Content script isolation**: Better separation between extension and page contexts.
- **Declarative permissions**: More granular permission model.
- **Required for new extensions**: Future-proof architecture.

### Minimal Permissions

We request only the permissions we need:

| Permission | Purpose |
|------------|---------|
| `storage` | Store encrypted credentials locally |
| `activeTab` | Interact with current tab for verification requests |

We deliberately avoid broad permissions like `<all_urls>` host permissions where possible.

### Storage Isolation

We use `chrome.storage.local` instead of `localStorage`:

- **Extension-isolated**: Only the extension can access this storage.
- **XSS resistant**: Page scripts cannot read extension storage.
- **No sync**: Credentials are not synced to cloud services.

---

## Key Management

### Password-Derived Keys

- Encryption keys are derived from user passwords using Argon2id.
- Derived keys exist only in memory during an active session.
- Keys are never persisted to storage.

### Password Requirements

The wallet extension enforces strong password requirements:
- Minimum 12 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)
- At least one special character (!@#$%^&* etc.)

### Auto-Lock

- Sessions automatically lock after a configurable inactivity period.
- On lock, encryption keys are cleared from memory.
- Re-authentication required to access credentials.

### What We Don't Store

- User passwords (only used for key derivation, then discarded)
- Wallet private keys (users connect external wallets like Lace)
- Unencrypted credentials

---

## Zero-Knowledge Design

### Credential Privacy

Midnight Cloak enables users to prove attributes without revealing underlying data:

- **Age verification**: Prove "over 18" without revealing birthdate.
- **Credential ownership**: Prove you hold a credential without exposing its contents.
- **Selective disclosure**: Share only what's required for verification.

### On-Chain Privacy

Smart contracts are written in Compact, Midnight's ZK-native language:

- Private state remains confidential on-chain.
- Zero-knowledge proofs verify claims without revealing inputs.
- Only proof validity is published, not underlying data.

---

## Secure Development Practices

### Dependency Management

- Dependencies are pinned to specific versions.
- Regular security audits via `pnpm audit`.
- Minimal dependency footprint to reduce attack surface.

### Code Review

- All changes require pull request review.
- Security-sensitive changes receive additional scrutiny.
- Automated CI checks run on all submissions.

### Compact Contract Policy

Due to the complexity of zero-knowledge circuits:

- Compact contracts follow official Midnight patterns.
- Modifications require ZK expertise.
- Production contracts should be professionally audited.

---

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue.
2. Use [GitHub Security Advisories](https://github.com/subc0der/midnight-cloak/security/advisories/new) to report privately.
3. Allow reasonable time for a fix before public disclosure.

We appreciate security researchers who help keep Midnight Cloak secure.

---

## References

- [NIST SP 800-38D: AES-GCM Specification](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [RFC 9106: Argon2 Memory-Hard Function](https://www.rfc-editor.org/rfc/rfc9106.html)
- [Chrome Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Password Hashing Competition](https://www.password-hashing.net/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

---

*This document reflects security architecture as of March 2026. Security practices evolve; we update this document as our approach changes.*
