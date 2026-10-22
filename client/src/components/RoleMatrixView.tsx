import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Check, X, Award } from 'lucide-react';

export const RoleMatrixView: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;

  const matrix = [
    {
      role: 'System Admin',
      scope: 'Global / System Infrastructure',
      privileges: 'Manage user accounts, assign roles, manage department records.',
      academicDelegation: 'None (distinct administrative role, not an HOD).',
      categories: [],
    },
    {
      role: 'Head of Department (HOD)',
      scope: 'Department Scope Only',
      privileges: 'Highest departmental authority. Manages faculty records within their department.',
      academicDelegation: 'Can allocate across all 5 task categories.',
      categories: ['Teaching', 'Research', 'Grading', 'Meetings', 'Administrative'],
    },
    {
      role: 'Professor',
      scope: 'Department Scope Only',
      privileges: 'Can allocate tasks to eligible Assistant Professors in the same department.',
      academicDelegation: 'Can allocate 4 categories. Administrative prohibited.',
      categories: ['Teaching', 'Research', 'Grading', 'Meetings'],
    },
    {
      role: 'Assistant Professor',
      scope: 'Department Scope Only',
      privileges: 'Primarily executes assigned work.',
      academicDelegation: 'Denied by default unless explicitly configured via can_assign_work flag.',
      categories: user.canAssignWork ? ['Teaching', 'Research', 'Grading'] : [],
    },
  ];

  return (
    <div className="role-matrix-container">
      {/* Active User Card */}
      <div className="user-profile-banner">
        <div className="banner-left">
          <div className="banner-avatar">
            <Award size={30} />
          </div>
          <div>
            <h2 className="banner-name">{user.fullName}</h2>
            <div className="banner-meta">
              <span>{user.email}</span> •{' '}
              <span>Department: {user.departmentName || 'Global Infrastructure'}</span> •{' '}
              <span>Status: Active</span>
            </div>
          </div>
        </div>

        <div className="banner-right">
          <div className="delegation-status-box">
            <span className="status-label">Work Allocation Authority:</span>
            {user.role === 'HOD' ? (
              <span className="pill full">Full (All 5 Categories)</span>
            ) : user.role === 'PROFESSOR' ? (
              <span className="pill academic">Academic (4 Categories)</span>
            ) : user.role === 'ASSISTANT_PROFESSOR' && user.canAssignWork ? (
              <span className="pill limited">Delegated (3 Categories)</span>
            ) : user.role === 'ASSISTANT_PROFESSOR' ? (
              <span className="pill denied">Denied by Default</span>
            ) : (
              <span className="pill admin">System Administration Only</span>
            )}
          </div>
        </div>
      </div>

      {/* Institutional Role Matrix Table */}
      <div className="matrix-card">
        <div className="matrix-header">
          <div className="matrix-icon">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3>Faculty Flow 2.0 Institutional Role & Authority Matrix</h3>
            <p>Formal operational rules enforced by the backend security layer</p>
          </div>
        </div>

        <div className="matrix-table-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Institutional Role</th>
                <th>Authority Scope</th>
                <th>Responsibilities</th>
                <th>Teaching</th>
                <th>Research</th>
                <th>Grading</th>
                <th>Meetings</th>
                <th>Administrative</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map(m => (
                <tr key={m.role} className={user.role === m.role.toUpperCase().replace(/\s+/g, '_') ? 'highlight-row' : ''}>
                  <td>
                    <strong>{m.role}</strong>
                  </td>
                  <td>{m.scope}</td>
                  <td>{m.privileges}</td>
                  <td className="center-cell">
                    {m.categories.includes('Teaching') ? <Check className="icon-allow" size={18} /> : <X className="icon-deny" size={18} />}
                  </td>
                  <td className="center-cell">
                    {m.categories.includes('Research') ? <Check className="icon-allow" size={18} /> : <X className="icon-deny" size={18} />}
                  </td>
                  <td className="center-cell">
                    {m.categories.includes('Grading') ? <Check className="icon-allow" size={18} /> : <X className="icon-deny" size={18} />}
                  </td>
                  <td className="center-cell">
                    {m.categories.includes('Meetings') ? <Check className="icon-allow" size={18} /> : <X className="icon-deny" size={18} />}
                  </td>
                  <td className="center-cell">
                    {m.categories.includes('Administrative') ? <Check className="icon-allow" size={18} /> : <X className="icon-deny" size={18} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
