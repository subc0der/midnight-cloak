import { useState } from 'react';

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<'welcome' | 'password'>('welcome');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreateWallet() {
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Send message to background to initialize vault
      const response = await chrome.runtime.sendMessage({
        type: 'INIT_VAULT',
        password,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to initialize vault');
      }

      onComplete();
    } catch (err) {
      setError('Failed to create wallet. Please try again.');
      setLoading(false);
    }
  }

  if (step === 'welcome') {
    return (
      <div className="page-center">
        <div className="logo">🌙</div>
        <h2>Midnight Cloak</h2>
        <p>
          Your zero-knowledge identity wallet.
          <br />
          Prove who you are without revealing your data.
        </p>
        <button className="btn btn-primary btn-full" onClick={() => setStep('password')}>
          Get Started
        </button>
      </div>
    );
  }

  return (
    <div className="page-center">
      <h2>Create Password</h2>
      <p>This password encrypts your credentials locally.</p>

      <div className="form-stack">
        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className={`input ${error && !confirmPassword ? 'error' : ''}`}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="input-group">
          <label htmlFor="confirm">Confirm Password</label>
          <input
            id="confirm"
            type="password"
            className={`input ${error ? 'error' : ''}`}
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        {error && <p className="error-message">{error}</p>}

        <button
          className="btn btn-primary btn-full"
          onClick={handleCreateWallet}
          disabled={loading || !password || !confirmPassword}
        >
          {loading ? 'Creating...' : 'Create Wallet'}
        </button>

        <button
          className="btn btn-secondary btn-full"
          onClick={() => setStep('welcome')}
          disabled={loading}
        >
          Back
        </button>
      </div>
    </div>
  );
}
