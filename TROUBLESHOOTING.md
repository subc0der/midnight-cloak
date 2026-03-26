# Troubleshooting Guide

Common issues and solutions when using Midnight Cloak.

## Extension Issues

### Extension not detected

**Symptoms:** `window.midnightCloak` is undefined

**Solutions:**
1. Verify extension is installed in `chrome://extensions`
2. Check extension is enabled (toggle on)
3. Refresh the page
4. Check if page was loaded before extension initialized - reload

### "Verification timed out"

**Symptoms:** Request hangs for 5 minutes then fails

**Causes:**
- User didn't respond to popup
- Extension popup didn't open

**Solutions:**
1. Click the Midnight Cloak icon to open popup manually
2. Check for pending requests in the popup
3. Ensure browser isn't blocking popups

### "No matching credential"

**Symptoms:** User has credentials but verification fails

**Causes:**
- Credential type doesn't match request
- Credential is expired
- Credential doesn't satisfy policy (e.g., age too young)

**Solutions:**
1. Check credential type matches exactly
2. Verify credential hasn't expired
3. For age: ensure birthDate makes user old enough

## Wallet Issues

### "Wallet not found"

**Symptoms:** SDK can't detect Lace wallet

**Solutions:**
1. Install Lace from [lace.io](https://lace.io)
2. Refresh page after installation
3. Check Lace is enabled in extensions

### "Wallet not connected"

**Symptoms:** Wallet installed but not connected to dApp

**Solutions:**
1. Click "Connect Wallet" in your dApp
2. Approve connection in Lace popup
3. Check Lace is unlocked

### "Network mismatch"

**Symptoms:** SDK reports wrong network

**Solutions:**
1. Open Lace wallet
2. Click network selector (top right)
3. Switch to correct network (preprod or mainnet)
4. Refresh dApp

## Proof Issues

### "Proof generation failed"

**Symptoms:** Verification starts but proof fails

**Causes:**
- Proof server not running
- Circuit assets not loaded
- SDK browser limitation (real proofs)

**Solutions:**
1. Check proof server: `curl http://localhost:6300/health`
2. Restart proof server: `docker-compose restart proof-server`
3. Use mock proofs in development (`allowMockProofs: true`)

### "Proof server unavailable"

**Symptoms:** Can't connect to proof server

**Solutions:**
```bash
# Check if running
docker-compose ps

# Start if stopped
docker-compose up -d proof-server

# Check logs
docker-compose logs proof-server
```

## Network Issues

### "Network error" / Connection failures

**Symptoms:** API calls fail, can't reach Midnight network

**Causes:**
- VPN interference
- Firewall blocking
- Midnight network down

**Solutions:**
1. Disable VPN
2. Check firewall allows WebSocket connections
3. Check [Midnight Discord](https://discord.gg/midnight) for network status

### "403 Forbidden" on RPC

**Symptoms:** WebSocket connections rejected

**Solutions:**
1. Disable VPN (most common cause)
2. Try different network (home vs office)
3. Wait and retry (temporary network issues)

## Development Issues

### "Cannot find module '@midnight-cloak/core'"

**Solutions:**
```bash
# Install dependencies
npm install

# Build packages
npm run build:all
```

### "WASM not supported"

**Symptoms:** Argon2id or proof generation fails

**Causes:**
- Browser doesn't support WASM
- CSP blocking WASM

**Solutions:**
1. Use modern browser (Chrome 116+, Firefox 102+)
2. Check Content-Security-Policy allows `wasm-unsafe-eval`

### Tests failing

```bash
# Clear cache and reinstall
rm -rf node_modules
npm install

# Rebuild
npm run build:all

# Run tests
npm run test:all
```

## Extension Development

### Hot reload not working

**Solutions:**
1. Save file to trigger rebuild
2. Go to `chrome://extensions`
3. Click refresh icon on Midnight Cloak extension
4. Reload the test page

### "Service worker inactive"

Chrome MV3 service workers sleep after 30 seconds.

**Solutions:**
- This is normal behavior
- Request queue persists state across restarts
- No action needed unless seeing actual errors

## Getting Help

1. Check this guide first
2. Search [GitHub Issues](https://github.com/anthropics/midnight-cloak/issues)
3. Ask in [Midnight Discord](https://discord.gg/midnight)
4. Open a new issue with:
   - Browser/extension version
   - Error message (full text)
   - Steps to reproduce
