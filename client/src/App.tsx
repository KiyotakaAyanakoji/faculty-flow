import React from 'react';
import { HealthCard } from './components/HealthCard';
import { Layers, Terminal, Database, Sparkles, ShieldCheck } from 'lucide-react';
import './App.css';

export const App: React.FC = () => {
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-badge">
          <Sparkles size={14} /> Faculty Flow 2.0 Foundation
        </div>
        <h1 className="app-title">Academic Operations & Faculty Portal</h1>
        <p className="app-subtitle">
          Phase 1 Foundation established: Modular architecture powered by React, Vite, Express,
          TypeScript, and MySQL.
        </p>
      </header>

      {/* Architecture Highlights */}
      <section className="arch-grid" aria-label="System Architecture Modules">
        <div className="arch-card client">
          <div className="arch-card-header">
            <div className="arch-icon-wrap">
              <Layers size={20} />
            </div>
            <h3>Client Application</h3>
          </div>
          <p>
            React 19 + TypeScript bundled with Vite. Includes Vanilla CSS design system, responsive
            layouts, and Vitest smoke tests.
          </p>
        </div>

        <div className="arch-card server">
          <div className="arch-card-header">
            <div className="arch-icon-wrap">
              <Terminal size={20} />
            </div>
            <h3>Server Application</h3>
          </div>
          <p>
            Node.js & Express with TypeScript. Strict environment validation, CORS policies,
            centralized error management, and health endpoints.
          </p>
        </div>

        <div className="arch-card db">
          <div className="arch-card-header">
            <div className="arch-icon-wrap">
              <Database size={20} />
            </div>
            <h3>Database & Migrations</h3>
          </div>
          <p>
            MySQL connection pooling with ping verification, transactional migration runner, and
            baseline schema versioning.
          </p>
        </div>
      </section>

      {/* Main Health & Connectivity Check */}
      <main>
        <HealthCard />
      </main>

      {/* Phase 1 Verification Checklist */}
      <footer style={{ marginTop: '3.5rem', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
          }}
        >
          <ShieldCheck size={16} color="var(--accent-emerald)" />
          <span>Foundation Stage Verified • Ready for Module Development</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
