import { useState } from 'react';

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleUnlock() {
    setError('');
    setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UNLOCK_VAULT',
        password,
      });

      if (response.success) {
        onUnlock();
      } else {
        setError(response.error || 'Incorrect password');
        setLoading(false);
      }
    } catch {
      setError('Failed to unlock. Please try again.');
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && password && !loading) {
      handleUnlock();
    }
  }

  return (
    <div className="page-center">
      <div className="logo">🌙</div>
      <h2>Welcome Back</h2>
      <p>Enter your password to unlock</p>

      <div className="form-stack">
        <div className="input-group">
          <input
            type="password"
            className={`input ${error ? 'error' : ''}`}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            autoFocus
          />
        </div>

        {error && <p className="error-message">{error}</p>}

        <button
          className="btn btn-primary btn-full"
          onClick={handleUnlock}
          disabled={loading || !password}
        >
          {loading ? 'Unlocking...' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}
