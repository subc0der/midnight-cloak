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

  /**
   * Validates password strength.
   * Returns an error message if invalid, or empty string if valid.
   */
  function validatePasswordStrength(pwd: string): string {
    if (pwd.length < 12) {
      return 'Password must be at least 12 characters';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) {
      return 'Password must contain at least one special character';
    }
    return '';
  }

  async function handleCreateWallet() {
    setError('');

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
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
    } catch {
      setError('Failed to create wallet. Please try again.');
      setLoading(false);
    }
  }

  if (step === 'welcome') {
    return (
      <div className="page-center">
        <img src="/icons/icon-128.png" alt="Midnight Cloak" className="logo-img" />
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
            placeholder="Min 12 chars, upper, lower, number, special"
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
