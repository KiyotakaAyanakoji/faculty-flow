import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LogOut,
  Shield,
  Building,
  UserCheck,
  CheckCircle,
  Users,
  Cpu,
  Layers,
  CheckSquare,
  LayoutDashboard,
  BookOpen,
  Send,
  Calendar,
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  const getRoleBadgeClass = () => {
    switch (user.role) {
      case 'SYSTEM_ADMIN':
        return 'role-badge admin';
      case 'HOD':
        return 'role-badge hod';
      case 'PROFESSOR':
        return 'role-badge prof';
      case 'ASSISTANT_PROFESSOR':
        return 'role-badge asst';
      default:
        return 'role-badge';
    }
  };

  const formatRoleTitle = (r: string) => {
    switch (r) {
      case 'SYSTEM_ADMIN':
        return 'System Administrator';
      case 'HOD':
        return 'Head of Department';
      case 'PROFESSOR':
        return 'Professor';
      case 'ASSISTANT_PROFESSOR':
        return 'Assistant Professor';
      default:
        return r;
    }
  };

  return (
    <nav className="navbar" id="app-navbar">
      <div className="nav-brand">
        <div className="nav-logo-wrap">
          <Layers size={22} />
        </div>
        <div>
          <span className="nav-title">Faculty Flow 2.0</span>
          <span className="nav-version">RBAC Active</span>
        </div>
      </div>

      {/* Role-Aware Tab Navigation */}
      <div className="nav-tabs">
        <button
          id="tab-dashboard"
          className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={16} /> Dashboard
        </button>

        {user.departmentId && (
          <button
            id="tab-tasks"
            className={`nav-tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            <CheckSquare size={16} /> Tasks
          </button>
        )}

        {user.departmentId && (
          <button
            id="tab-syllabus"
            className={`nav-tab-btn ${activeTab === 'syllabus' ? 'active' : ''}`}
            onClick={() => setActiveTab('syllabus')}
          >
            <BookOpen size={16} /> Syllabus
          </button>
        )}

        {user.departmentId && (
          <button
            id="tab-handovers"
            className={`nav-tab-btn ${activeTab === 'handovers' ? 'active' : ''}`}
            onClick={() => setActiveTab('handovers')}
          >
            <Send size={16} /> Handovers
          </button>
        )}

        <button
          id="tab-calendar"
          className={`nav-tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <Calendar size={16} /> Calendar
        </button>

        {user.departmentId && (
          <button
            className={`nav-tab-btn ${activeTab === 'faculty' ? 'active' : ''}`}
            onClick={() => setActiveTab('faculty')}
          >
            <Users size={16} /> Faculty Roster
          </button>
        )}

        {user.role === 'SYSTEM_ADMIN' && (
          <button
            className={`nav-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <UserCheck size={16} /> User Management
          </button>
        )}

        <button
          className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Shield size={16} /> RBAC Matrix
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulator')}
        >
          <Cpu size={16} /> Policy Simulator
        </button>
      </div>

      {/* User Status & Logout */}
      <div className="nav-user-controls">
        <div className="user-info-chip">
          <span className="user-name">{user.fullName}</span>
          <div className="user-tags">
            <span className={getRoleBadgeClass()}>{formatRoleTitle(user.role)}</span>
            {user.departmentCode && (
              <span className="dept-tag">
                <Building size={12} /> {user.departmentCode}
              </span>
            )}
            {user.canAssignWork && (
              <span className="delegation-tag" title="Authorized to allocate work">
                <CheckCircle size={12} /> Delegator
              </span>
            )}
          </div>
        </div>

        <button
          id="btn-nav-logout"
          data-testid="btn-logout"
          className="logout-btn"
          onClick={() => logout()}
          aria-label="Sign Out"
          title="Sign Out"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
};
