import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types/auth';
import { Mail, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export const DepartmentFacultyView: React.FC = () => {
  const { user } = useAuth();
  const [faculty, setFaculty] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFaculty = async () => {
    if (!user?.departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/departments/${user.departmentId}/faculty`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch faculty list.');
      }
      setFaculty(data.faculty || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching department roster';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaculty();
  }, [user?.departmentId]);

  if (!user?.departmentId) {
    return (
      <div className="empty-state-box">
        <p>System Administrators do not have a departmental assignment.</p>
      </div>
    );
  }

  return (
    <div className="faculty-view-container">
      <div className="view-header">
        <div>
          <h3>Department Faculty Roster: {user.departmentName}</h3>
          <p>Official faculty roster registered in the {user.departmentCode} academic unit</p>
        </div>
        <button
          className="refresh-btn"
          onClick={fetchFaculty}
          disabled={loading}
          title="Refresh roster"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {error && <div className="alert-box error">{error}</div>}

      {loading && !faculty.length ? (
        <div className="loading-box">Loading department records...</div>
      ) : (
        <div className="faculty-grid">
          {faculty.map(f => (
            <div key={f.id} className="faculty-card">
              <div className="faculty-card-header">
                <span className={`role-badge ${f.role.toLowerCase().replace('_', '-')}`}>
                  {f.role.replace('_', ' ')}
                </span>
                {f.canAssignWork ? (
                  <span className="delegation-badge enabled" title="Authorized to delegate work">
                    <CheckCircle2 size={13} /> Delegator
                  </span>
                ) : (
                  <span className="delegation-badge disabled" title="Execution only">
                    <XCircle size={13} /> Execution Only
                  </span>
                )}
              </div>
              <h4 className="faculty-name">{f.fullName}</h4>
              <div className="faculty-email">
                <Mail size={14} />
                <span>{f.email}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
