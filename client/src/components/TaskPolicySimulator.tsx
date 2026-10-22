import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserProfile, TaskCategory } from '../types/auth';
import { CheckCircle2, XCircle, Send } from 'lucide-react';

export const TaskPolicySimulator: React.FC = () => {
  const { user } = useAuth();
  const [facultyList, setFacultyList] = useState<UserProfile[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [category, setCategory] = useState<TaskCategory>('Teaching');
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [result, setResult] = useState<{ allowed: boolean; reason?: string; context?: any } | null>(null);

  useEffect(() => {
    async function loadCandidates() {
      try {
        const res = await fetch('/api/users', { credentials: 'include' });
        const data = await res.json();
        if (res.ok && data.users?.length > 0) {
          setFacultyList(data.users);
          setTargetUserId(String(data.users[0].id));
        }
      } catch {
        // Ignored
      }
    }
    loadCandidates();
  }, []);

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId) return;
    setEvaluating(true);
    setResult(null);

    try {
      const res = await fetch('/api/tasks/evaluate-allocation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: Number(targetUserId),
          category,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        allowed: false,
        reason: 'Failed to communicate with policy engine.',
      });
    } finally {
      setEvaluating(false);
    }
  };

  if (!user) return null;

  return (
    <div className="simulator-container">
      <div className="view-header">
        <div>
          <h3>Interactive RBAC Policy Engine Simulator</h3>
          <p>
            Evaluate task assignment permissions against the backend security rules in real-time.
          </p>
        </div>
      </div>

      <div className="simulator-card">
        <form onSubmit={handleEvaluate} className="simulator-form">
          <div className="sim-field">
            <label>Current Authenticated Actor</label>
            <div className="actor-badge-box">
              <strong>{user.fullName}</strong> ({user.role}) • Dept: {user.departmentCode || 'None'}
            </div>
          </div>

          <div className="sim-field">
            <label>Select Target Faculty Member</label>
            <select
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              disabled={evaluating}
            >
              {facultyList.map(f => (
                <option key={f.id} value={f.id}>
                  {f.fullName} ({f.role} - {f.departmentCode || 'Admin'})
                </option>
              ))}
            </select>
          </div>

          <div className="sim-field">
            <label>Select Task Category to Allocate</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as TaskCategory)}
              disabled={evaluating}
            >
              <option value="Teaching">Teaching</option>
              <option value="Research">Research</option>
              <option value="Grading">Grading</option>
              <option value="Meetings">Meetings</option>
              <option value="Administrative">Administrative</option>
            </select>
          </div>

          <button type="submit" className="submit-btn" disabled={evaluating || !targetUserId}>
            <Send size={16} />
            <span>{evaluating ? 'Evaluating Policy...' : 'Evaluate Allocation Permission'}</span>
          </button>
        </form>

        {result && (
          <div className={`eval-result-box ${result.allowed ? 'allowed' : 'denied'}`}>
            <div className="eval-result-header">
              {result.allowed ? (
                <>
                  <CheckCircle2 size={24} className="icon-success" />
                  <h4>ALLOCATION PERMITTED</h4>
                </>
              ) : (
                <>
                  <XCircle size={24} className="icon-error" />
                  <h4>ALLOCATION PROHIBITED</h4>
                </>
              )}
            </div>
            {result.reason && <p className="eval-reason">{result.reason}</p>}
            {result.context && (
              <pre className="eval-context-json">{JSON.stringify(result.context, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
