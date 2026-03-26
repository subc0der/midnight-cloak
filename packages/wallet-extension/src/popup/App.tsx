import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import LockScreen from './pages/LockScreen';
import CredentialDetail from './pages/CredentialDetail';
import Settings from './pages/Settings';
import VerificationRequest from './pages/VerificationRequest';
import CredentialOffer from './pages/CredentialOffer';
import ActivityLog from './pages/ActivityLog';

type AppState = 'loading' | 'onboarding' | 'locked' | 'unlocked' | 'verification-request' | 'credential-offer';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');

  useEffect(() => {
    checkInitialState();

    // Listen for auto-lock from background
    const handleMessage = (message: { type: string }) => {
      if (message.type === 'VAULT_LOCKED') {
        setAppState('locked');
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  async function checkInitialState() {
    try {
      const result = await chrome.storage.local.get(['encryptedVault', 'salt']);

      if (!result.salt || !result.encryptedVault) {
        setAppState('onboarding');
        return;
      }

      // Check if vault is unlocked in background
      const status = await chrome.runtime.sendMessage({ type: 'GET_VAULT_STATUS' });
      if (!status?.isUnlocked) {
        setAppState('locked');
        return;
      }

      // Check for pending requests/offers
      const [requestResponse, offerResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_PENDING_REQUEST' }),
        chrome.runtime.sendMessage({ type: 'GET_PENDING_OFFER' }),
      ]);

      if (requestResponse?.success && requestResponse.request) {
        setAppState('verification-request');
      } else if (offerResponse?.success && offerResponse.offer) {
        setAppState('credential-offer');
      } else {
        setAppState('unlocked');
      }
    } catch {
      setAppState('onboarding');
    }
  }

  function handleSetupComplete() {
    setAppState('unlocked');
  }

  async function handleUnlock() {
    // After unlocking, check for pending requests/offers
    try {
      const [requestResponse, offerResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_PENDING_REQUEST' }),
        chrome.runtime.sendMessage({ type: 'GET_PENDING_OFFER' }),
      ]);

      if (requestResponse?.success && requestResponse.request) {
        setAppState('verification-request');
      } else if (offerResponse?.success && offerResponse.offer) {
        setAppState('credential-offer');
      } else {
        setAppState('unlocked');
      }
    } catch {
      setAppState('unlocked');
    }
  }

  function handleLock() {
    setAppState('locked');
  }

  if (appState === 'loading') {
    return (
      <div className="app loading">
        <div className="spinner" />
      </div>
    );
  }

  if (appState === 'onboarding') {
    return <Onboarding onComplete={handleSetupComplete} />;
  }

  if (appState === 'locked') {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  if (appState === 'verification-request') {
    return <VerificationRequest onComplete={() => setAppState('unlocked')} />;
  }

  if (appState === 'credential-offer') {
    return <CredentialOffer onComplete={() => setAppState('unlocked')} />;
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home onLock={handleLock} />} />
        <Route path="/credential/:id" element={<CredentialDetail />} />
        <Route path="/settings" element={<Settings onLock={handleLock} />} />
        <Route path="/activity" element={<ActivityLog />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
