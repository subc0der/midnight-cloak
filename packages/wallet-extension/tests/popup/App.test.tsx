/**
 * Tests for App component
 *
 * Tests app state machine: loading → onboarding | locked | unlocked | verification-request | credential-offer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/popup/App';
import { setMockStorage, addMessageHandler, clearMessageHandlers } from '../setup';

// Mock child components to isolate App state machine logic
vi.mock('../../src/popup/pages/Onboarding', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="onboarding">
      <button onClick={onComplete}>Complete Setup</button>
    </div>
  ),
}));

vi.mock('../../src/popup/pages/LockScreen', () => ({
  default: ({ onUnlock }: { onUnlock: () => void }) => (
    <div data-testid="lock-screen">
      <button onClick={onUnlock}>Unlock</button>
    </div>
  ),
}));

vi.mock('../../src/popup/pages/Home', () => ({
  default: ({ onLock }: { onLock: () => void }) => (
    <div data-testid="home">
      <button onClick={onLock}>Lock</button>
    </div>
  ),
}));

vi.mock('../../src/popup/pages/VerificationRequest', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="verification-request">
      <button onClick={onComplete}>Complete Verification</button>
    </div>
  ),
}));

vi.mock('../../src/popup/pages/CredentialOffer', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="credential-offer">
      <button onClick={onComplete}>Accept Credential</button>
    </div>
  ),
}));

vi.mock('../../src/popup/pages/CredentialDetail', () => ({
  default: () => <div data-testid="credential-detail">Credential Detail</div>,
}));

vi.mock('../../src/popup/pages/Settings', () => ({
  default: ({ onLock }: { onLock: () => void }) => (
    <div data-testid="settings">
      <button onClick={onLock}>Lock from Settings</button>
    </div>
  ),
}));

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMessageHandlers();
  });

  describe('loading state', () => {
    it('shows loading spinner initially', () => {
      // No storage data, no message handlers - stays in loading
      renderApp();

      const spinner = document.querySelector('.spinner');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('onboarding state', () => {
    it('shows onboarding when no vault exists', async () => {
      // Empty storage - no salt or encryptedVault
      setMockStorage({});

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('onboarding')).toBeInTheDocument();
      });
    });

    it('shows onboarding when only salt exists (incomplete setup)', async () => {
      setMockStorage({ salt: 'some-salt' });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('onboarding')).toBeInTheDocument();
      });
    });

    it('transitions to unlocked state when onboarding completes', async () => {
      setMockStorage({});

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('onboarding')).toBeInTheDocument();
      });

      // Click the Complete Setup button
      const completeButton = screen.getByText('Complete Setup');
      completeButton.click();

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument();
      });
    });
  });

  describe('locked state', () => {
    it('shows lock screen when vault exists but is locked', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: false });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
      });
    });

    it('transitions to unlocked state when unlock succeeds with no pending requests', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: false });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({ success: true, request: null });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({ success: true, offer: null });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
      });

      // Click unlock
      const unlockButton = screen.getByText('Unlock');
      unlockButton.click();

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument();
      });
    });

    it('transitions to verification-request when unlock reveals pending request', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      let unlockCalled = false;

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: false });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          // After unlock, return a pending request
          if (unlockCalled) {
            sendResponse({
              success: true,
              request: { id: 'req-1', origin: 'https://example.com', policyConfig: { type: 'AGE' } },
            });
          } else {
            sendResponse({ success: true, request: null });
          }
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({ success: true, offer: null });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
      });

      // Simulate unlock which will check for pending requests
      unlockCalled = true;
      const unlockButton = screen.getByText('Unlock');
      unlockButton.click();

      await waitFor(() => {
        expect(screen.getByTestId('verification-request')).toBeInTheDocument();
      });
    });
  });

  describe('unlocked state', () => {
    it('shows home when vault is unlocked with no pending requests', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({ success: true, request: null });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({ success: true, offer: null });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument();
      });
    });

    it('transitions to locked state when lock is triggered', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({ success: true, request: null });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({ success: true, offer: null });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument();
      });

      // Click lock
      const lockButton = screen.getByText('Lock');
      lockButton.click();

      await waitFor(() => {
        expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
      });
    });
  });

  describe('verification-request state', () => {
    it('shows verification request when vault unlocked with pending request', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({
            success: true,
            request: {
              id: 'req-1',
              origin: 'https://example.com',
              policyConfig: { type: 'AGE', minAge: 18 },
            },
          });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({ success: true, offer: null });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('verification-request')).toBeInTheDocument();
      });
    });

    it('transitions to unlocked when verification completes', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({
            success: true,
            request: {
              id: 'req-1',
              origin: 'https://example.com',
              policyConfig: { type: 'AGE', minAge: 18 },
            },
          });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({ success: true, offer: null });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('verification-request')).toBeInTheDocument();
      });

      // Complete verification
      const completeButton = screen.getByText('Complete Verification');
      completeButton.click();

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument();
      });
    });
  });

  describe('credential-offer state', () => {
    it('shows credential offer when vault unlocked with pending offer', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({ success: true, request: null });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({
            success: true,
            offer: {
              id: 'offer-1',
              origin: 'https://issuer.com',
              credential: { type: 'AGE', claims: { birthDate: '1990-01-01' }, issuer: 'issuer-addr' },
            },
          });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('credential-offer')).toBeInTheDocument();
      });
    });

    it('transitions to unlocked when credential offer completes', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({ success: true, request: null });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({
            success: true,
            offer: {
              id: 'offer-1',
              origin: 'https://issuer.com',
              credential: { type: 'AGE', claims: { birthDate: '1990-01-01' }, issuer: 'issuer-addr' },
            },
          });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('credential-offer')).toBeInTheDocument();
      });

      // Accept credential
      const acceptButton = screen.getByText('Accept Credential');
      acceptButton.click();

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument();
      });
    });
  });

  describe('priority and edge cases', () => {
    it('prioritizes verification request over credential offer when both pending', async () => {
      // Edge case: both a verification request AND a credential offer are pending
      // App should show verification request first (per checkInitialState logic)
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          // Return a pending request
          sendResponse({
            success: true,
            request: {
              id: 'req-1',
              origin: 'https://dapp.com',
              policyConfig: { type: 'AGE', minAge: 18 },
            },
          });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          // ALSO return a pending offer
          sendResponse({
            success: true,
            offer: {
              id: 'offer-1',
              origin: 'https://issuer.com',
              credential: { type: 'AGE', claims: { birthDate: '1990-01-01' }, issuer: 'issuer-addr' },
            },
          });
          return true;
        }
      });

      renderApp();

      // Should show verification request, not credential offer
      await waitFor(() => {
        expect(screen.getByTestId('verification-request')).toBeInTheDocument();
      });

      // Credential offer should NOT be shown
      expect(screen.queryByTestId('credential-offer')).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('falls back to onboarding on storage check error', async () => {
      // Simulate storage error by not setting up any storage
      // and having chrome.storage.local.get throw
      const originalGet = chrome.storage.local.get;
      vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('Storage error'));

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('onboarding')).toBeInTheDocument();
      });

      // Restore
      chrome.storage.local.get = originalGet;
    });
  });

  describe('auto-lock message handling', () => {
    it('transitions to locked when VAULT_LOCKED message received', async () => {
      setMockStorage({
        salt: 'test-salt',
        encryptedVault: 'encrypted-data',
      });

      addMessageHandler((message, _sender, sendResponse) => {
        const msg = message as { type: string };
        if (msg.type === 'GET_VAULT_STATUS') {
          sendResponse({ success: true, isUnlocked: true });
          return true;
        }
        if (msg.type === 'GET_PENDING_REQUEST') {
          sendResponse({ success: true, request: null });
          return true;
        }
        if (msg.type === 'GET_PENDING_OFFER') {
          sendResponse({ success: true, offer: null });
          return true;
        }
      });

      renderApp();

      await waitFor(() => {
        expect(screen.getByTestId('home')).toBeInTheDocument();
      });

      // Simulate auto-lock message from background
      // The App component adds a listener via chrome.runtime.onMessage.addListener
      // We need to call those registered listeners
      const listeners = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
      expect(listeners.length).toBeGreaterThan(0);

      // Call the listener with VAULT_LOCKED message
      const listener = listeners[0][0];
      listener({ type: 'VAULT_LOCKED' }, {}, () => {});

      await waitFor(() => {
        expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
      });
    });
  });
});
