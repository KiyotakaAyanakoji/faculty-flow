import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { Navbar } from './components/Navbar';
import { RoleMatrixView } from './components/RoleMatrixView';
import { DepartmentFacultyView } from './components/DepartmentFacultyView';
import { UserManagementView } from './components/UserManagementView';
import { TaskPolicySimulator } from './components/TaskPolicySimulator';
import { TaskManagementView } from './components/TaskManagementView';
import { HealthCard } from './components/HealthCard';
import { Layers, Terminal, Database, Sparkles, ShieldCheck } from 'lucide-react';
import './App.css';

const MainAppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('overview');

  if (loading && !user) {
    return (
      <div className="app-container" style={{ textAlign: 'center', paddingTop: '8rem' }}>
        <div className="brand-badge">
          <Sparkles size={14} className="spin" /> Verifying Session...
        </div>
        <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>
          Initializing Faculty Flow 2.0 Security Layer...
        </p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {user ? (
        /* Authenticated Application Shell */
        <>
          <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

          <main>
            {activeTab === 'overview' && <RoleMatrixView />}
            {activeTab === 'tasks' && <TaskManagementView />}
            {activeTab === 'faculty' && <DepartmentFacultyView />}
            {activeTab === 'users' && user.role === 'SYSTEM_ADMIN' && <UserManagementView />}
            {activeTab === 'simulator' && <TaskPolicySimulator />}
          </main>

          <section style={{ marginTop: '3.5rem' }}>
            <HealthCard />
          </section>
        </>
      ) : (
        /* Public / Unauthenticated Landing and Login View */
        <>
          <header className="app-header">
            <div className="brand-badge">
              <Sparkles size={14} /> Faculty Flow 2.0 • Phase 2 RBAC
            </div>
            <h1 className="app-title">Academic Operations & Faculty Portal</h1>
            <p className="app-subtitle">
              Role-Based Access Control and secure session management for System Administrators,
              HODs, Professors, and Assistant Professors.
            </p>
          </header>

          {/* Architecture Highlights */}
          <section className="arch-grid" aria-label="System Architecture Modules">
            <div className="arch-card client">
              <div className="arch-card-header">
                <div className="arch-icon-wrap">
                  <Layers size={20} />
                </div>
                <h3>Identity & RBAC Client</h3>
              </div>
              <p>
                React 19 + TypeScript. Role-aware navigation, interactive policy simulator, and
                credential management.
              </p>
            </div>

            <div className="arch-card server">
              <div className="arch-card-header">
                <div className="arch-icon-wrap">
                  <Terminal size={20} />
                </div>
                <h3>Express Security Engine</h3>
              </div>
              <p>
                HttpOnly token management, login rate limiting, Zod validation, and strict
                departmental scope enforcement.
              </p>
            </div>

            <div className="arch-card db">
              <div className="arch-card-header">
                <div className="arch-icon-wrap">
                  <Database size={20} />
                </div>
                <h3>MySQL Authorization Schema</h3>
              </div>
              <p>
                Versioned relational schemas for departments, faculty profiles, token revocations,
                and security audit trails.
              </p>
            </div>
          </section>

          {/* Login Form */}
          <section style={{ marginBottom: '3rem' }}>
            <LoginForm />
          </section>

          {/* System Health Check Card */}
          <main>
            <HealthCard />
          </main>
        </>
      )}

      {/* Footer */}
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
          <span>Faculty Flow 2.0 • Phase 2 Authentication & Authorization Active</span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
};

export default App;
