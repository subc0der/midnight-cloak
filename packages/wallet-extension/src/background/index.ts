/**
 * Background service worker for Midnight Cloak extension
 *
 * Handles:
 * - Vault initialization and encryption
 * - Credential storage and retrieval
 * - Auto-lock timer
 * - Communication with content scripts
 */

import { EncryptedStorage } from '../shared/storage/encrypted-storage';
import { RequestQueue, type PersistedVerificationRequest, type PersistedCredentialOffer } from '../shared/storage/request-queue';
import { IssuerTrustStore, type TrustedIssuer, type IssuerTrustAssessment } from '../shared/storage/issuer-trust';
import { getProofGenerator, type ServiceUris } from './proof-generator';

/**
 * ⚠️ PRODUCTION SECURITY FLAG ⚠️
 *
 * ALLOW_MOCK_PROOFS = true  → Allows fake proofs (DEVELOPMENT ONLY)
 * ALLOW_MOCK_PROOFS = false → Requires real ZK proofs (PRODUCTION)
 *
 * Mock proofs bypass all ZK security guarantees. Users will think
 * they're protected when they're not. NEVER deploy to production
 * with this set to true.
 *
 * Checklist before production:
 * 1. Build with VITE_ALLOW_MOCK_PROOFS=false or leave unset
 * 2. Verify SDK loads without errors (check service worker console)
 * 3. Test verification flow - should fail gracefully if SDK unavailable
 * 4. Confirm proof results have isMock: false
 *
 * Environment variable override:
 * - VITE_ALLOW_MOCK_PROOFS=true  → Enable mock proofs (dev builds)
 * - VITE_ALLOW_MOCK_PROOFS=false → Disable mock proofs (prod builds)
 * - Unset                        → Defaults to false (safe default)
 *
 * See: .claude/context/package-status.md → PRODUCTION CHECKLIST
 */
const ALLOW_MOCK_PROOFS =
  typeof import.meta.env !== 'undefined' && import.meta.env.VITE_ALLOW_MOCK_PROOFS === 'true';

const AUTO_LOCK_ALARM = 'midnight-cloak-auto-lock';

let storage: EncryptedStorage | null = null;

// Request queue for persistent storage of pending requests
// Survives service worker dormancy (Chrome MV3 limitation)
const requestQueue = RequestQueue.getInstance();

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Midnight Cloak extension installed');
});

// Handle auto-lock alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) {
    console.log('[Background] Auto-lock alarm fired');
    storage = null;
    await chrome.storage.local.remove('lastActivity');

    // Notify any open popups
    try {
      await chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' });
    } catch {
      // No listeners (popup not open) - that's fine
    }

    console.log('[Background] Auto-locked due to inactivity');
  }
});

// On service worker startup, check if we should have locked while dormant
checkAutoLockOnStartup();

// Clean expired requests on startup (prevents stale request accumulation)
cleanRequestQueueOnStartup();

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages meant for offscreen document
  if (message.type === 'DERIVE_KEY') {
    // Don't handle - let offscreen document handle it
    // Return undefined to not interfere with other listeners
    return;
  }

  // Ignore messages from offscreen document (responses)
  if (message.type === 'DERIVE_KEY_RESULT') {
    return;
  }

  console.log('[Background] Received message:', message.type);

  // SECURITY: Use sender.origin for content script messages, not message.origin
  // This prevents origin spoofing attacks where malicious dApps could fake their origin
  const trustedOrigin = sender.origin || sender.url ? new URL(sender.url || '').origin : 'unknown';

  handleMessage(message, trustedOrigin)
    .then((response) => {
      console.log('[Background] Sending response:', response);
      sendResponse(response);
    })
    .catch((err) => {
      console.error('[Background] Error:', err);
      sendResponse({ success: false, error: err.message });
    });

  // Return true to indicate async response
  return true;
});

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  trustedOrigin: string
): Promise<unknown> {
  switch (message.type) {
    case 'GET_VAULT_STATUS':
      return { success: true, isUnlocked: storage !== null };

    case 'INIT_VAULT':
      return initVault(message.password as string);

    case 'UNLOCK_VAULT':
      return unlockVault(message.password as string);

    case 'LOCK_VAULT':
      return lockVault();

    case 'GET_CREDENTIALS':
      return getCredentials();

    case 'GET_CREDENTIAL':
      return getCredential(message.id as string);

    case 'ADD_CREDENTIAL':
      return addCredential(message.credential as unknown);

    case 'DELETE_CREDENTIAL':
      return deleteCredential(message.id as string);

    case 'UPDATE_AUTO_LOCK':
      return updateAutoLock(message.minutes as number);

    case 'VERIFICATION_REQUEST':
      // SECURITY: Use trustedOrigin from sender, not message.origin
      return handleVerificationRequest(
        message as { policyConfig?: unknown; serviceUris?: ServiceUris },
        trustedOrigin
      );

    case 'GET_PENDING_REQUEST':
      return getPendingRequest();

    case 'GET_ALL_PENDING_REQUESTS':
      return getAllPendingRequests();

    case 'APPROVE_VERIFICATION':
      return approveVerification(message.requestId as string | undefined);

    case 'DENY_VERIFICATION':
      return denyVerification(message.requestId as string | undefined);

    case 'POLL_RESPONSE':
      return pollResponse(message.requestId as string);

    case 'CREDENTIAL_OFFER':
      // SECURITY: Use trustedOrigin from sender, not message.origin
      return handleCredentialOffer(message as { credential?: unknown }, trustedOrigin);

    case 'GET_PENDING_OFFER':
      return getPendingOffer();

    case 'GET_ALL_PENDING_OFFERS':
      return getAllPendingOffers();

    case 'ACCEPT_CREDENTIAL':
      return acceptCredential(message.offerId as string | undefined);

    case 'REJECT_CREDENTIAL':
      return rejectCredential(message.offerId as string | undefined);

    case 'GET_AVAILABLE_CREDENTIALS':
      return getAvailableCredentials();

    case 'INIT_PROOF_GENERATOR':
      return initProofGenerator(message.serviceUris as ServiceUris);

    // ─────────────────────────────────────────────────────────────────────────
    // Issuer Trust Management (centralized to avoid cross-context race conditions)
    // ─────────────────────────────────────────────────────────────────────────

    case 'GET_TRUSTED_ISSUERS':
      return getTrustedIssuers();

    case 'ADD_TRUSTED_ISSUER':
      return addTrustedIssuer(message.issuer as Omit<TrustedIssuer, 'addedAt'>);

    case 'REMOVE_TRUSTED_ISSUER':
      return removeTrustedIssuer(message.address as string);

    case 'ASSESS_ISSUER_TRUST':
      return assessIssuerTrust(message.issuerAddress as string, message.credentialType as string | undefined);

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function initVault(password: string): Promise<{ success: boolean; error?: string }> {
  try {
    storage = new EncryptedStorage();
    await storage.initialize(password);

    // Save empty credentials array
    await storage.save({ credentials: [] });

    await resetAutoLockTimer();

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function unlockVault(password: string): Promise<{ success: boolean; error?: string }> {
  console.log('[Background] unlockVault called');
  try {
    storage = new EncryptedStorage();
    console.log('[Background] Created EncryptedStorage, calling unlock...');
    await storage.unlock(password);
    console.log('[Background] Unlock successful');

    await resetAutoLockTimer();

    return { success: true };
  } catch (err) {
    console.error('[Background] Unlock failed:', err);
    storage = null;
    return { success: false, error: 'Incorrect password' };
  }
}

async function lockVault(): Promise<{ success: boolean }> {
  storage = null;
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  await chrome.storage.local.remove('lastActivity');
  return { success: true };
}

async function getCredentials(): Promise<{ success: boolean; credentials?: unknown[]; error?: string }> {
  if (!storage) {
    return { success: false, error: 'Vault is locked' };
  }

  try {
    const data = await storage.load();
    await resetAutoLockTimer();
    return { success: true, credentials: data?.credentials || [] };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function getCredential(id: string): Promise<{ success: boolean; credential?: unknown; error?: string }> {
  if (!storage) {
    return { success: false, error: 'Vault is locked' };
  }

  try {
    const data = await storage.load();
    const credentials = (data?.credentials || []) as Array<{ id: string }>;
    const credential = credentials.find((c) => c.id === id);
    await resetAutoLockTimer();
    return { success: true, credential };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function addCredential(credential: unknown): Promise<{ success: boolean; error?: string }> {
  if (!storage) {
    return { success: false, error: 'Vault is locked' };
  }

  try {
    const data = await storage.load();
    const credentials = data?.credentials || [];
    credentials.push(credential);
    await storage.save({ credentials });
    await resetAutoLockTimer();
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function deleteCredential(id: string): Promise<{ success: boolean; error?: string }> {
  if (!storage) {
    return { success: false, error: 'Vault is locked' };
  }

  try {
    const data = await storage.load();
    const allCredentials = (data?.credentials || []) as Array<{ id: string }>;
    const credentials = allCredentials.filter((c) => c.id !== id);
    await storage.save({ credentials });
    await resetAutoLockTimer();
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function getAvailableCredentials(): Promise<{
  success: boolean;
  credentials?: Array<{ type: string; id: string }>;
  error?: string;
}> {
  if (!storage) {
    return { success: false, error: 'Vault is locked' };
  }

  try {
    const data = await storage.load();
    const credentials = (data?.credentials || []) as Array<{ id: string; type: string }>;
    // Return only type and id for privacy - don't expose full claims to dApps
    const available = credentials.map((c) => ({ id: c.id, type: c.type }));
    await resetAutoLockTimer();
    return { success: true, credentials: available };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function updateAutoLock(minutes: number): Promise<{ success: boolean }> {
  await chrome.storage.local.set({ autoLockMinutes: minutes });
  await resetAutoLockTimer();
  return { success: true };
}

async function resetAutoLockTimer(): Promise<void> {
  // Store current activity timestamp
  const now = Date.now();
  await chrome.storage.local.set({ lastActivity: now });

  // Get auto-lock setting
  const result = await chrome.storage.local.get(['autoLockMinutes']);
  const minutes = result.autoLockMinutes || 5;

  // Clear existing alarm and create new one
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  // @ts-expect-error - Chrome types have multiple overloads, this is the correct usage
  await chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: minutes });

  console.log(`[Background] Auto-lock alarm set for ${minutes} minutes`);
}

async function checkAutoLockOnStartup(): Promise<void> {
  const result = await chrome.storage.local.get(['lastActivity', 'autoLockMinutes', 'vault']);

  // If no vault exists, nothing to lock
  if (!result.vault) {
    return;
  }

  // If no last activity recorded, we were never unlocked
  if (!result.lastActivity) {
    return;
  }

  const lastActivity = result.lastActivity as number;
  const autoLockMinutes = (result.autoLockMinutes as number) || 5;
  const elapsed = Date.now() - lastActivity;
  const lockAfterMs = autoLockMinutes * 60 * 1000;

  if (elapsed >= lockAfterMs) {
    // Should have locked while dormant
    console.log('[Background] Service worker woke up - should have auto-locked');
    storage = null;
    await chrome.storage.local.remove('lastActivity');
  } else {
    // Still within lock window, set alarm for remaining time
    const remainingMs = lockAfterMs - elapsed;
    const remainingMinutes = Math.max(remainingMs / 60000, 0.1); // Minimum 6 seconds

    await chrome.alarms.clear(AUTO_LOCK_ALARM);
    await chrome.alarms.create(AUTO_LOCK_ALARM, {
      delayInMinutes: remainingMinutes,
    });

    console.log(`[Background] Resumed - auto-lock in ${remainingMinutes.toFixed(1)} minutes`);
  }
}

/**
 * Clean expired requests from the queue on service worker startup.
 * This prevents stale request accumulation across SW restarts.
 */
async function cleanRequestQueueOnStartup(): Promise<void> {
  try {
    const cleaned = await requestQueue.cleanExpired();
    if (cleaned > 0) {
      console.log(`[Background] Cleaned ${cleaned} expired request(s) from queue`);
    }
  } catch (err) {
    console.error('[Background] Error cleaning request queue:', err);
  }
}

async function handleVerificationRequest(
  message: { policyConfig?: unknown; serviceUris?: ServiceUris },
  trustedOrigin: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  console.log('[Background] Verification request received from:', trustedOrigin);

  const requestId = crypto.randomUUID();

  // Initialize ProofGenerator with Lace service URIs if provided
  if (message.serviceUris) {
    console.log('[Background] Initializing ProofGenerator with Lace service URIs');
    const generator = getProofGenerator();
    generator.configure({ allowMockProofs: ALLOW_MOCK_PROOFS });
    await generator.initialize(message.serviceUris);
  } else {
    console.warn('[Background] No service URIs provided - proof generation may fail or use mock');
  }

  // Add to persistent request queue
  // SECURITY: Use trustedOrigin from sender, not message payload (prevents spoofing)
  await requestQueue.addVerificationRequest({
    id: requestId,
    origin: trustedOrigin,
    policyConfig: (message.policyConfig as PersistedVerificationRequest['policyConfig']) || { type: 'UNKNOWN' },
    serviceUris: message.serviceUris,
    timestamp: Date.now(),
  });

  // Open popup for user to approve/deny
  chrome.action.openPopup().catch(() => {
    // openPopup may fail if popup is already open or not available
    // In that case, the popup will check for pending requests on load
    console.log('[Background] Could not open popup automatically');
  });

  // Return immediately with requestId - content script will poll for response
  // This allows the service worker to go dormant without losing the request
  return { success: true, requestId };
}

async function getPendingRequest(): Promise<{ success: boolean; request?: PersistedVerificationRequest | null }> {
  const request = await requestQueue.getNextPendingVerification();
  return { success: true, request };
}

async function getAllPendingRequests(): Promise<{ success: boolean; requests: PersistedVerificationRequest[] }> {
  const requests = await requestQueue.getAllPendingVerifications();
  return { success: true, requests };
}

async function pollResponse(requestId: string): Promise<{ completed: boolean; result?: unknown }> {
  if (!requestId) {
    return { completed: false };
  }

  const response = await requestQueue.getCompletedResponse(requestId);
  if (response) {
    // Remove response after pickup
    await requestQueue.removeCompletedResponse(requestId);
    return { completed: true, result: response.result };
  }

  return { completed: false };
}

async function approveVerification(requestId?: string): Promise<{ success: boolean; proof?: unknown; error?: string }> {
  // Get request from queue - either by ID or next pending
  const pendingRequest = requestId
    ? await requestQueue.getVerificationRequest(requestId)
    : await requestQueue.getNextPendingVerification();

  if (!pendingRequest) {
    return { success: false, error: 'No pending request' };
  }

  if (!storage) {
    // Store failure result for content script pickup
    await requestQueue.completeRequest(pendingRequest.id, 'verification', {
      success: false,
      error: 'Vault is locked',
    });
    return { success: false, error: 'Vault is locked' };
  }

  // Mark as processing to prevent duplicate handling
  await requestQueue.markVerificationProcessing(pendingRequest.id);

  try {
    // Re-initialize ProofGenerator if service URIs were stored with request
    if (pendingRequest.serviceUris) {
      const generator = getProofGenerator();
      generator.configure({ allowMockProofs: ALLOW_MOCK_PROOFS });
      await generator.initialize(pendingRequest.serviceUris);
    }

    // Load credentials and find matching one
    const data = await storage.load();
    const credentials = (data?.credentials || []) as Array<{
      id: string;
      type: string;
      claims: Record<string, unknown>;
      expiresAt: number | null;
    }>;

    const matchingCredential = findMatchingCredential(pendingRequest.policyConfig, credentials);

    if (!matchingCredential) {
      const result = { success: false, error: 'No matching credential found' };
      await requestQueue.completeRequest(pendingRequest.id, 'verification', result);
      return result;
    }

    // Generate proof based on credential type
    let proof: unknown;

    if (pendingRequest.policyConfig.type === 'AGE') {
      // Age verification - generate ZK proof
      const birthDate = matchingCredential.claims.birthDate as string;
      const birthYear = new Date(birthDate).getFullYear();
      const currentYear = new Date().getFullYear();
      const minAge = pendingRequest.policyConfig.minAge || 18;

      const proofGenerator = getProofGenerator();

      // Configure mock proofs setting
      proofGenerator.configure({ allowMockProofs: ALLOW_MOCK_PROOFS });

      // Generate proof - will throw if SDK unavailable and mocks disabled
      console.log('[Background] Generating ZK proof via ProofGenerator');
      const proofResult = await proofGenerator.generateAgeProof({
        birthYear,
        minAge,
        currentYear,
      });

      if (proofResult.isMock) {
        console.warn('[Background] Using mock proof - NOT FOR PRODUCTION');
      }

      proof = {
        type: 'AGE',
        verified: proofResult.isVerified,
        timestamp: Date.now(),
        proofData: Array.from(proofResult.proof),
        publicOutputs: proofResult.publicOutputs,
        isMock: proofResult.isMock,
      };
    } else {
      // Other credential types - require explicit mock opt-in
      if (!ALLOW_MOCK_PROOFS) {
        throw new Error(`ZK proofs not yet implemented for credential type: ${pendingRequest.policyConfig.type}`);
      }

      console.warn('[Background] Using mock proof for non-AGE credential - NOT FOR PRODUCTION');
      proof = {
        type: pendingRequest.policyConfig.type,
        verified: true,
        timestamp: Date.now(),
        proofData: btoa(JSON.stringify({
          nonce: crypto.randomUUID(),
        })),
        isMock: true,
      };
    }

    const result = { success: true, verified: true, proof };

    // Store result for content script pickup
    await requestQueue.completeRequest(pendingRequest.id, 'verification', result);
    await resetAutoLockTimer();

    return result;
  } catch (err) {
    const result = { success: false, error: (err as Error).message };
    await requestQueue.completeRequest(pendingRequest.id, 'verification', result);
    return result;
  }
}

async function denyVerification(requestId?: string): Promise<{ success: boolean }> {
  // Get request from queue - either by ID or next pending
  const pendingRequest = requestId
    ? await requestQueue.getVerificationRequest(requestId)
    : await requestQueue.getNextPendingVerification();

  if (!pendingRequest) {
    return { success: false };
  }

  // Store denial result for content script pickup
  await requestQueue.completeRequest(pendingRequest.id, 'verification', {
    success: false,
    error: 'User denied the request',
  });

  return { success: true };
}

async function handleCredentialOffer(
  message: { credential?: unknown },
  trustedOrigin: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  console.log('[Background] Credential offer received from:', trustedOrigin);

  const credential = message.credential as PersistedCredentialOffer['credential'];
  if (!credential || !credential.type) {
    return { success: false, error: 'Invalid credential data' };
  }

  const offerId = crypto.randomUUID();

  // Add to persistent request queue
  // SECURITY: Use trustedOrigin from sender, not message payload (prevents spoofing)
  await requestQueue.addCredentialOffer({
    id: offerId,
    origin: trustedOrigin,
    credential,
    timestamp: Date.now(),
  });

  // Open popup for user to accept/reject
  chrome.action.openPopup().catch(() => {
    console.log('[Background] Could not open popup automatically');
  });

  // Return immediately with requestId - content script will poll for response
  return { success: true, requestId: offerId };
}

async function getPendingOffer(): Promise<{ success: boolean; offer?: PersistedCredentialOffer | null }> {
  const offer = await requestQueue.getNextPendingOffer();
  return { success: true, offer };
}

async function getAllPendingOffers(): Promise<{ success: boolean; offers: PersistedCredentialOffer[] }> {
  const offers = await requestQueue.getAllPendingOffers();
  return { success: true, offers };
}

async function acceptCredential(offerId?: string): Promise<{ success: boolean; error?: string }> {
  // Get offer from queue - either by ID or next pending
  const pendingOffer = offerId
    ? await requestQueue.getCredentialOffer(offerId)
    : await requestQueue.getNextPendingOffer();

  if (!pendingOffer) {
    return { success: false, error: 'No pending offer' };
  }

  if (!storage) {
    await requestQueue.completeRequest(pendingOffer.id, 'credential', {
      success: false,
      error: 'Vault is locked',
    });
    return { success: false, error: 'Vault is locked' };
  }

  // Mark as processing to prevent duplicate handling
  await requestQueue.markOfferProcessing(pendingOffer.id);

  try {
    // Create full credential from offer
    const newCredential = {
      id: crypto.randomUUID(),
      type: pendingOffer.credential.type,
      issuer: pendingOffer.credential.issuer,
      subject: '', // Will be set when we have wallet address
      claims: pendingOffer.credential.claims,
      issuedAt: Date.now(),
      expiresAt: pendingOffer.credential.expiresAt,
      signature: new Uint8Array(0), // Mock signature
    };

    // Add to vault
    const data = await storage.load();
    const credentials = data?.credentials || [];
    credentials.push(newCredential);
    await storage.save({ credentials });

    const result = { success: true, credentialId: newCredential.id };

    // Store result for content script pickup
    await requestQueue.completeRequest(pendingOffer.id, 'credential', result);
    await resetAutoLockTimer();

    return result;
  } catch (err) {
    const result = { success: false, error: (err as Error).message };
    await requestQueue.completeRequest(pendingOffer.id, 'credential', result);
    return result;
  }
}

async function rejectCredential(offerId?: string): Promise<{ success: boolean }> {
  // Get offer from queue - either by ID or next pending
  const pendingOffer = offerId
    ? await requestQueue.getCredentialOffer(offerId)
    : await requestQueue.getNextPendingOffer();

  if (!pendingOffer) {
    return { success: false };
  }

  // Store rejection result for content script pickup
  await requestQueue.completeRequest(pendingOffer.id, 'credential', {
    success: false,
    error: 'User rejected the credential',
  });

  return { success: true };
}

function findMatchingCredential(
  policyConfig: { type: string; minAge?: number; [key: string]: unknown },
  credentials: Array<{ id: string; type: string; claims: Record<string, unknown>; expiresAt: number | null }>
): { id: string; type: string; claims: Record<string, unknown>; expiresAt: number | null } | null {
  return credentials.find((cred) => {
    // Type must match
    if (cred.type !== policyConfig.type) return false;

    // Check expiration
    if (cred.expiresAt && cred.expiresAt < Date.now()) return false;

    // Type-specific checks
    if (policyConfig.type === 'AGE' && policyConfig.minAge) {
      const birthDate = cred.claims.birthDate as string;
      if (!birthDate) return false;

      const age = calculateAge(new Date(birthDate));
      if (age < policyConfig.minAge) return false;
    }

    return true;
  }) || null;
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

async function initProofGenerator(serviceUris: ServiceUris): Promise<{ success: boolean; error?: string }> {
  try {
    const generator = getProofGenerator();
    await generator.initialize(serviceUris);
    console.log('[Background] ProofGenerator initialized with Lace service URIs');
    return { success: true };
  } catch (err) {
    console.error('[Background] Failed to initialize ProofGenerator:', err);
    return { success: false, error: (err as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Issuer Trust Management
//
// All issuer trust operations are centralized in the service worker to prevent
// cross-context race conditions. The popup and other contexts must use messages
// to interact with the trust store, not direct imports.
// ─────────────────────────────────────────────────────────────────────────────

const issuerTrustStore = IssuerTrustStore.getInstance();

async function getTrustedIssuers(): Promise<{ success: boolean; issuers?: TrustedIssuer[]; error?: string }> {
  try {
    const issuers = await issuerTrustStore.getAllWhitelisted();
    return { success: true, issuers };
  } catch (err) {
    console.error('[Background] Failed to get trusted issuers:', err);
    return { success: false, error: (err as Error).message };
  }
}

async function addTrustedIssuer(
  issuer: Omit<TrustedIssuer, 'addedAt'>
): Promise<{ success: boolean; error?: string }> {
  try {
    await issuerTrustStore.addToWhitelist(issuer);
    return { success: true };
  } catch (err) {
    console.error('[Background] Failed to add trusted issuer:', err);
    return { success: false, error: (err as Error).message };
  }
}

async function removeTrustedIssuer(address: string): Promise<{ success: boolean; error?: string }> {
  try {
    await issuerTrustStore.removeFromWhitelist(address);
    return { success: true };
  } catch (err) {
    console.error('[Background] Failed to remove trusted issuer:', err);
    return { success: false, error: (err as Error).message };
  }
}

async function assessIssuerTrust(
  issuerAddress: string,
  credentialType?: string
): Promise<{ success: boolean; assessment?: IssuerTrustAssessment; error?: string }> {
  try {
    const assessment = await issuerTrustStore.assessTrust(issuerAddress, credentialType);
    return { success: true, assessment };
  } catch (err) {
    console.error('[Background] Failed to assess issuer trust:', err);
    return { success: false, error: (err as Error).message };
  }
}

