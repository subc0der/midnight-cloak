# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in Midnight Cloak, please report it responsibly.

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Email security concerns to the repository owner via GitHub
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- Acknowledgment within 48 hours
- Regular updates on the status
- Credit in the security advisory (if desired)

### Scope

This security policy applies to:
- `@midnight-cloak/core`
- `@midnight-cloak/react`
- `@midnight-cloak/wallet`
- `@midnight-cloak/contracts`
- `@midnight-cloak/wallet-extension`

### Out of Scope

- Vulnerabilities in dependencies (report to the dependency maintainer)
- Vulnerabilities in the Midnight Network itself (report to Midnight team)
- Social engineering attacks
- Physical security

## Security Best Practices for Contributors

1. **Never commit secrets** - API keys, private keys, passwords
2. **Use signed commits** - Required for all contributions
3. **Review dependencies** - Check for known vulnerabilities before adding
4. **Follow secure coding practices** - Input validation, output encoding
5. **Test security-sensitive code** - Especially wallet and proof generation

## Compact Contract Security

**IMPORTANT**: We do NOT write or modify Compact (.compact) code. These files require specialized ZK cryptography expertise. Any changes to Compact contracts must be:

1. Reviewed by qualified ZK engineers
2. Audited before production use
3. Approved by the repository owner

See `CLAUDE.md` for the full Compact Language Policy.
