import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import LockScreen from './pages/LockScreen';
import CredentialDetail from './pages/CredentialDetail';
import Settings from './pages/Settings';

type AppState = 'loading' | 'onboarding' | 'locked' | 'unlocked';

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
      if (status?.isUnlocked) {
        setAppState('unlocked');
      } else {
        setAppState('locked');
      }
    } catch {
      setAppState('onboarding');
    }
  }

  function handleSetupComplete() {
    setAppState('unlocked');
  }

  function handleUnlock() {
    setAppState('unlocked');
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

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home onLock={handleLock} />} />
        <Route path="/credential/:id" element={<CredentialDetail />} />
        <Route path="/settings" element={<Settings onLock={handleLock} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
