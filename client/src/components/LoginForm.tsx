import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, AlertCircle, LogIn, KeyRound } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { login, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    await login(email, password);
  };

  const setDemoAccount = (demoEmail: string) => {
    clearError();
    setEmail(demoEmail);
    setPassword('Password@12345');
  };

  return (
    <div className="login-card" id="login-card">
      <div className="login-header">
        <div className="login-badge">
          <KeyRound size={16} /> Secure Authentication
        </div>
        <h2 className="login-title">Sign In to Faculty Flow</h2>
        <p className="login-subtitle">
          Access your institutional role portal, departmental rosters, and workflow tools.
        </p>
      </div>

      {error && (
        <div className="alert-box error" id="login-error-alert" role="alert">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="login-form" data-testid="login-form">
        <div className="input-group">
          <label htmlFor="login-email">Institutional Email</label>
          <div className="input-wrap">
            <Mail size={18} className="input-icon" />
            <input
              id="login-email"
              type="email"
              required
              placeholder="e.g. prof.cs@facultyflow.local"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="login-password">Password</label>
          <div className="input-wrap">
            <Lock size={18} className="input-icon" />
            <input
              id="login-password"
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
        </div>

        <button
          type="submit"
          id="btn-login-submit"
          className="submit-btn"
          disabled={loading || !email || !password}
        >
          <LogIn size={18} className={loading ? 'spin' : ''} />
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
        </button>
      </form>

      {/* Quick Demo Credentials Picker */}
      <div className="demo-credentials-section">
        <span className="demo-label">Quick Test Roles (Default password: Password@12345):</span>
        <div className="demo-chips">
          <button
            type="button"
            className="chip admin"
            onClick={() => setDemoAccount('admin@facultyflow.local')}
          >
            System Admin
          </button>
          <button
            type="button"
            className="chip hod"
            onClick={() => setDemoAccount('hod.cs@facultyflow.local')}
          >
            HOD (CS)
          </button>
          <button
            type="button"
            className="chip prof"
            onClick={() => setDemoAccount('prof.cs@facultyflow.local')}
          >
            Professor (CS)
          </button>
          <button
            type="button"
            className="chip asst"
            onClick={() => setDemoAccount('asst.cs@facultyflow.local')}
          >
            Asst. Professor (CS)
          </button>
          <button
            type="button"
            className="chip hod-mech"
            onClick={() => setDemoAccount('hod.mech@facultyflow.local')}
          >
            HOD (MECH)
          </button>
          <button
            type="button"
            className="chip inactive"
            onClick={() => setDemoAccount('inactive@facultyflow.local')}
          >
            Inactive Account
          </button>
        </div>
      </div>
    </div>
  );
};
