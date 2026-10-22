import React, { useState, useEffect } from 'react';
import { UserProfile, Department, Role } from '../types/auth';
import { UserPlus, UserCheck, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

export const UserManagementView: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New user form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('ASSISTANT_PROFESSOR');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [canAssignWork, setCanAssignWork] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, deptsRes] = await Promise.all([
        fetch('/api/users', { credentials: 'include' }),
        fetch('/api/departments', { credentials: 'include' }),
      ]);

      const usersData = await usersRes.json();
      const deptsData = await deptsRes.json();

      if (!usersRes.ok) throw new Error(usersData.error?.message || 'Failed to fetch users');
      if (!deptsRes.ok) throw new Error(deptsData.error?.message || 'Failed to fetch departments');

      setUsers(usersData.users || []);
      setDepartments(deptsData.departments || []);
      if (deptsData.departments?.length > 0 && !departmentId) {
        setDepartmentId(String(deptsData.departments[0].id));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching administration data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        email,
        password,
        fullName,
        role,
        canAssignWork,
      };

      if (role !== 'SYSTEM_ADMIN') {
        payload.departmentId = Number(departmentId);
      }

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create user');
      }

      setSuccess(`User account created successfully for ${data.user.fullName} (${data.user.role}).`);
      setEmail('');
      setPassword('');
      setFullName('');
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="user-mgmt-container">
      <div className="view-header">
        <div>
          <h3>System User Administration</h3>
          <p>Create and provision faculty accounts with explicit role and department bindings</p>
        </div>
        <button className="refresh-btn" onClick={fetchData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="alert-box error">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {success && (
        <div className="alert-box success">
          <CheckCircle2 size={18} />
          <div>{success}</div>
        </div>
      )}

      {/* Account Provisioning Form */}
      <div className="admin-form-card">
        <div className="form-card-title">
          <UserPlus size={18} />
          <h4>Provision New Faculty / Administrator Account</h4>
        </div>

        <form onSubmit={handleCreateUser} className="admin-grid-form">
          <div className="form-field">
            <label>Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Dr. Richard Feynman"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label>Institutional Email</label>
            <input
              type="email"
              required
              placeholder="e.g. rfeynman@facultyflow.local"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label>Initial Password (min 8 chars)</label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label>Institutional Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              disabled={submitting}
            >
              <option value="SYSTEM_ADMIN">System Administrator</option>
              <option value="HOD">Head of Department (HOD)</option>
              <option value="PROFESSOR">Professor</option>
              <option value="ASSISTANT_PROFESSOR">Assistant Professor</option>
            </select>
          </div>

          {role !== 'SYSTEM_ADMIN' && (
            <div className="form-field">
              <label>Department</label>
              <select
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
                disabled={submitting}
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field checkbox-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={canAssignWork}
                onChange={e => setCanAssignWork(e.target.checked)}
                disabled={submitting}
              />
              <span>Enable Work Delegation Privilege (can_assign_work)</span>
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="submit-btn" disabled={submitting}>
              <UserCheck size={16} />
              <span>{submitting ? 'Creating User...' : 'Provision User Account'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Existing Users Table */}
      <div className="existing-users-card">
        <h4>Registered Institutional Accounts ({users.length})</h4>
        <div className="matrix-table-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Delegation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.fullName}</strong></td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-badge ${u.role.toLowerCase().replace('_', '-')}`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{u.departmentCode || 'Global Admin'}</td>
                  <td>{u.canAssignWork ? 'Enabled' : 'Disabled'}</td>
                  <td>
                    <span className={`status-pill ${u.isActive ? 'active' : 'inactive'}`}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </span>
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
