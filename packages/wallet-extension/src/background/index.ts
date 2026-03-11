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
import type { PendingVerificationRequest, PendingCredentialOffer } from '../shared/messaging/types';

const AUTO_LOCK_ALARM = 'midnight-cloak-auto-lock';

let storage: EncryptedStorage | null = null;

// Pending requests/offers waiting for user approval
let pendingVerificationRequest: PendingVerificationRequest | null = null;
let pendingCredentialOffer: PendingCredentialOffer | null = null;

// Callbacks to resolve pending requests
let pendingRequestResolve: ((result: unknown) => void) | null = null;
let pendingOfferResolve: ((result: unknown) => void) | null = null;

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
      return handleVerificationRequest(message as { policyConfig?: unknown }, trustedOrigin);

    case 'GET_PENDING_REQUEST':
      return getPendingRequest();

    case 'APPROVE_VERIFICATION':
      return approveVerification();

    case 'DENY_VERIFICATION':
      return denyVerification();

    case 'CREDENTIAL_OFFER':
      // SECURITY: Use trustedOrigin from sender, not message.origin
      return handleCredentialOffer(message as { credential?: unknown }, trustedOrigin);

    case 'GET_PENDING_OFFER':
      return getPendingOffer();

    case 'ACCEPT_CREDENTIAL':
      return acceptCredential();

    case 'REJECT_CREDENTIAL':
      return rejectCredential();

    case 'GET_AVAILABLE_CREDENTIALS':
      return getAvailableCredentials();

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
  await chrome.alarms.create(AUTO_LOCK_ALARM, {
    delayInMinutes: minutes,
  });

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

async function handleVerificationRequest(
  message: { policyConfig?: unknown },
  trustedOrigin: string
): Promise<unknown> {
  console.log('[Background] Verification request received from:', trustedOrigin);

  // Create pending request
  // SECURITY: Use trustedOrigin from sender, not message payload (prevents spoofing)
  const request: PendingVerificationRequest = {
    id: crypto.randomUUID(),
    origin: trustedOrigin,
    policyConfig: (message.policyConfig as PendingVerificationRequest['policyConfig']) || { type: 'UNKNOWN' },
    timestamp: Date.now(),
  };

  pendingVerificationRequest = request;

  // Return a promise that resolves when user approves/denies
  return new Promise((resolve) => {
    pendingRequestResolve = resolve;

    // Open popup for user to approve/deny
    chrome.action.openPopup().catch(() => {
      // openPopup may fail if popup is already open or not available
      // In that case, the popup will check for pending requests on load
      console.log('[Background] Could not open popup automatically');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingVerificationRequest?.id === request.id) {
        pendingVerificationRequest = null;
        pendingRequestResolve = null;
        resolve({ success: false, error: 'Request timed out' });
      }
    }, 5 * 60 * 1000);
  });
}

function getPendingRequest(): { success: boolean; request?: PendingVerificationRequest | null } {
  return { success: true, request: pendingVerificationRequest };
}

async function approveVerification(): Promise<{ success: boolean; proof?: unknown; error?: string }> {
  if (!pendingVerificationRequest) {
    return { success: false, error: 'No pending request' };
  }

  if (!storage) {
    return { success: false, error: 'Vault is locked' };
  }

  try {
    // Load credentials and find matching one
    const data = await storage.load();
    const credentials = (data?.credentials || []) as Array<{
      id: string;
      type: string;
      claims: Record<string, unknown>;
      expiresAt: number | null;
    }>;

    const matchingCredential = findMatchingCredential(pendingVerificationRequest.policyConfig, credentials);

    if (!matchingCredential) {
      const result = { success: false, error: 'No matching credential found' };
      if (pendingRequestResolve) {
        pendingRequestResolve(result);
        pendingRequestResolve = null;
      }
      pendingVerificationRequest = null;
      return result;
    }

    // Generate mock proof (real proof generation in Phase 3D)
    // PRIVACY: Do NOT include credentialId - it would enable cross-dApp tracking
    // Real ZK proofs will use nullifiers that are dApp-specific
    const proof = {
      type: pendingVerificationRequest.policyConfig.type,
      verified: true,
      timestamp: Date.now(),
      // Mock proof data - in production, this will be actual ZK proof bytes
      proofData: btoa(JSON.stringify({
        credentialType: matchingCredential.type,
        nonce: crypto.randomUUID(),
      })),
    };

    const result = { success: true, verified: true, proof };

    if (pendingRequestResolve) {
      pendingRequestResolve(result);
      pendingRequestResolve = null;
    }

    pendingVerificationRequest = null;
    await resetAutoLockTimer();

    return result;
  } catch (err) {
    const result = { success: false, error: (err as Error).message };
    if (pendingRequestResolve) {
      pendingRequestResolve(result);
      pendingRequestResolve = null;
    }
    pendingVerificationRequest = null;
    return result;
  }
}

function denyVerification(): { success: boolean } {
  const result = { success: false, error: 'User denied the request' };

  if (pendingRequestResolve) {
    pendingRequestResolve(result);
    pendingRequestResolve = null;
  }

  pendingVerificationRequest = null;
  return { success: true };
}

async function handleCredentialOffer(
  message: { credential?: unknown },
  trustedOrigin: string
): Promise<unknown> {
  console.log('[Background] Credential offer received from:', trustedOrigin);

  const credential = message.credential as PendingCredentialOffer['credential'];
  if (!credential || !credential.type) {
    return { success: false, error: 'Invalid credential data' };
  }

  // Create pending offer
  // SECURITY: Use trustedOrigin from sender, not message payload (prevents spoofing)
  const offer: PendingCredentialOffer = {
    id: crypto.randomUUID(),
    origin: trustedOrigin,
    credential,
    timestamp: Date.now(),
  };

  pendingCredentialOffer = offer;

  // Return a promise that resolves when user accepts/rejects
  return new Promise((resolve) => {
    pendingOfferResolve = resolve;

    // Open popup for user to accept/reject
    chrome.action.openPopup().catch(() => {
      console.log('[Background] Could not open popup automatically');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingCredentialOffer?.id === offer.id) {
        pendingCredentialOffer = null;
        pendingOfferResolve = null;
        resolve({ success: false, error: 'Offer timed out' });
      }
    }, 5 * 60 * 1000);
  });
}

function getPendingOffer(): { success: boolean; offer?: PendingCredentialOffer | null } {
  return { success: true, offer: pendingCredentialOffer };
}

async function acceptCredential(): Promise<{ success: boolean; error?: string }> {
  if (!pendingCredentialOffer) {
    return { success: false, error: 'No pending offer' };
  }

  if (!storage) {
    return { success: false, error: 'Vault is locked' };
  }

  try {
    // Create full credential from offer
    const newCredential = {
      id: crypto.randomUUID(),
      type: pendingCredentialOffer.credential.type,
      issuer: pendingCredentialOffer.credential.issuer,
      subject: '', // Will be set when we have wallet address
      claims: pendingCredentialOffer.credential.claims,
      issuedAt: Date.now(),
      expiresAt: pendingCredentialOffer.credential.expiresAt,
      signature: new Uint8Array(0), // Mock signature
    };

    // Add to vault
    const data = await storage.load();
    const credentials = data?.credentials || [];
    credentials.push(newCredential);
    await storage.save({ credentials });

    const result = { success: true, credentialId: newCredential.id };

    if (pendingOfferResolve) {
      pendingOfferResolve(result);
      pendingOfferResolve = null;
    }

    pendingCredentialOffer = null;
    await resetAutoLockTimer();

    return result;
  } catch (err) {
    const result = { success: false, error: (err as Error).message };
    if (pendingOfferResolve) {
      pendingOfferResolve(result);
      pendingOfferResolve = null;
    }
    pendingCredentialOffer = null;
    return result;
  }
}

function rejectCredential(): { success: boolean } {
  const result = { success: false, error: 'User rejected the credential' };

  if (pendingOfferResolve) {
    pendingOfferResolve(result);
    pendingOfferResolve = null;
  }

  pendingCredentialOffer = null;
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

