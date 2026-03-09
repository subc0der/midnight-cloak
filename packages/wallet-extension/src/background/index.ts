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

const AUTO_LOCK_ALARM = 'midnight-cloak-auto-lock';

let storage: EncryptedStorage | null = null;

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

  handleMessage(message)
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

async function handleMessage(message: { type: string; [key: string]: unknown }): Promise<unknown> {
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
      return handleVerificationRequest(message);

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

async function handleVerificationRequest(message: unknown): Promise<{ success: boolean; error?: string }> {
  // TODO: Implement verification request handling
  // This will open the popup and show the request approval screen
  console.log('Verification request received:', message);
  return { success: true };
}

