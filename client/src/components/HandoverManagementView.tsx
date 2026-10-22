import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Handover } from '../types/handover';
import {
  Send,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Trash2,
  Calendar,
  Check,
  Ban,
  Link as LinkIcon,
  ArrowRight,
} from 'lucide-react';

export const HandoverManagementView: React.FC = () => {
  const { user } = useAuth();
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'received' | 'sent' | 'department'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [handoverToRespond, setHandoverToRespond] = useState<{ id: number; action: 'Accepted' | 'Rejected' } | null>(null);
  const [responseNotes, setResponseNotes] = useState('');

  // Create Form State
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newTaskId, setNewTaskId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [facultyList, setFacultyList] = useState<Array<{ id: number; fullName: string; role: string }>>([]);
  const [taskList, setTaskList] = useState<Array<{ id: number; title: string; category: string }>>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchHandovers = useCallback(async () => {
    if (!user?.departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.append('type', typeFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);

      const res = await fetch(`/api/handovers?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch handovers');
      setHandovers(data.handovers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading handovers');
    } finally {
      setLoading(false);
    }
  }, [user?.departmentId, typeFilter, statusFilter, searchTerm]);

  useEffect(() => {
    fetchHandovers();
  }, [fetchHandovers]);

  // Load faculty & tasks for handover creation
  useEffect(() => {
    if (!showCreateModal || !user?.departmentId) return;
    async function loadOptions() {
      try {
        const [usersRes, tasksRes] = await Promise.all([
          fetch('/api/users', { credentials: 'include' }),
          fetch('/api/tasks?limit=50', { credentials: 'include' }),
        ]);
        const usersData = await usersRes.json();
        const tasksData = await tasksRes.json();

        if (usersRes.ok && usersData.users) {
          const peers = usersData.users.filter(
            (u: any) => u.departmentId === user?.departmentId && u.isActive && u.id !== user?.id
          );
          setFacultyList(peers);
          if (peers.length > 0 && !newRecipientId) {
            setNewRecipientId(String(peers[0].id));
          }
        }

        if (tasksRes.ok && tasksData.tasks) {
          setTaskList(tasksData.tasks);
        }
      } catch {
        // Fallback
      }
    }
    loadOptions();
  }, [showCreateModal, user?.departmentId, user?.id, newRecipientId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecipientId) {
      setError('Please select a recipient faculty member.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/handovers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipientId: Number(newRecipientId),
          taskId: newTaskId ? Number(newTaskId) : null,
          title: newTitle.trim(),
          notes: newNotes.trim(),
          dueDate: newDueDate || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create handover');

      setSuccess(`Handover "${data.handover.title}" initiated successfully.`);
      setShowCreateModal(false);
      setNewTitle('');
      setNewNotes('');
      setNewDueDate('');
      setNewTaskId('');
      fetchHandovers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error initiating handover');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: 'Accepted' | 'Rejected' | 'Completed', notes?: string) => {
    try {
      const res = await fetch(`/api/handovers/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, responseNotes: notes || null }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update handover status');

      setSuccess(`Handover status marked as ${status}.`);
      setHandoverToRespond(null);
      setResponseNotes('');
      fetchHandovers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating handover status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to cancel this pending handover?')) return;
    try {
      const res = await fetch(`/api/handovers/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to cancel handover');

      setSuccess('Handover cancelled successfully.');
      fetchHandovers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error cancelling handover');
    }
  };

  if (!user?.departmentId) {
    return (
      <div className="empty-state-box">
        <p>System Administrators manage infrastructure and do not have departmental academic handovers.</p>
      </div>
    );
  }

  // Metric counts
  const totalCount = handovers.length;
  const pendingCount = handovers.filter(h => h.status === 'Pending').length;
  const acceptedCount = handovers.filter(h => h.status === 'Accepted').length;
  const completedCount = handovers.filter(h => h.status === 'Completed').length;

  return (
    <div className="handover-container" id="handover-view-section">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h3>Faculty Academic Handovers & Continuity</h3>
          <p>
            Seamlessly transfer, accept, and track academic responsibilities, committee duties, and courses in {user.departmentName}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="refresh-btn" onClick={fetchHandovers} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            id="btn-initiate-handover"
            className="submit-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} />
            <span>Initiate Handover</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert-box error" role="alert">
          <AlertCircle size={18} />
          <div>{error}</div>
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="alert-box" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399' }} role="status">
          <CheckCircle2 size={18} />
          <div>{success}</div>
          <button onClick={() => setSuccess(null)} style={{ marginLeft: 'auto', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="task-summary-grid">
        <div className="task-summary-card total">
          <div className="summary-icon-wrap">
            <Send size={20} />
          </div>
          <div>
            <div className="summary-stat">{totalCount}</div>
            <div className="summary-label">Total Records</div>
          </div>
        </div>

        <div className="task-summary-card pending">
          <div className="summary-icon-wrap">
            <Clock size={20} />
          </div>
          <div>
            <div className="summary-stat">{pendingCount}</div>
            <div className="summary-label">Pending Action</div>
          </div>
        </div>

        <div className="task-summary-card in-progress">
          <div className="summary-icon-wrap">
            <Check size={20} />
          </div>
          <div>
            <div className="summary-stat">{acceptedCount}</div>
            <div className="summary-label">Accepted / In Progress</div>
          </div>
        </div>

        <div className="task-summary-card completed">
          <div className="summary-icon-wrap">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="summary-stat">{completedCount}</div>
            <div className="summary-label">Completed</div>
          </div>
        </div>
      </div>

      {/* Controls Bar with Tabs & Filters */}
      <div className="task-controls-bar">
        <div className="view-toggle-group">
          <button
            className={`view-toggle-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All Related
          </button>
          <button
            className={`view-toggle-btn ${typeFilter === 'received' ? 'active' : ''}`}
            onClick={() => setTypeFilter('received')}
          >
            Received
          </button>
          <button
            className={`view-toggle-btn ${typeFilter === 'sent' ? 'active' : ''}`}
            onClick={() => setTypeFilter('sent')}
          >
            Sent
          </button>
          {user.role === 'HOD' && (
            <button
              className={`view-toggle-btn ${typeFilter === 'department' ? 'active' : ''}`}
              onClick={() => setTypeFilter('department')}
            >
              All Departmental
            </button>
          )}
        </div>

        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search handover notes or title..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filters-group">
          <select
            className="select-filter"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">Status: All</option>
            <option value="Pending">Pending</option>
            <option value="Accepted">Accepted</option>
            <option value="Rejected">Rejected</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Handovers List */}
      {loading && !handovers.length ? (
        <div className="empty-state-box">Loading handovers...</div>
      ) : handovers.length === 0 ? (
        <div className="empty-state-box">
          <Send size={36} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h4>No Handover Records Found</h4>
          <p>There are no handovers in this view category.</p>
        </div>
      ) : (
        <div className="handover-grid">
          {handovers.map(ho => {
            const isSender = ho.sender.id === user.id;
            const isRecipient = ho.recipient.id === user.id;
            const isHOD = user.role === 'HOD';

            return (
              <div key={ho.id} className="handover-card">
                <div className="handover-card-header">
                  <div className="participants-row">
                    <span className="party-chip">
                      From: <strong>{ho.sender.fullName}</strong>
                    </span>
                    <ArrowRight size={14} color="var(--text-muted)" />
                    <span className="party-chip highlight">
                      To: <strong>{ho.recipient.fullName}</strong>
                    </span>
                  </div>

                  <span className={`status-badge ${ho.status.toLowerCase()}`}>{ho.status}</span>
                </div>

                <h4 className="handover-title">{ho.title}</h4>
                <p className="handover-notes">{ho.notes}</p>

                {/* Response Notes if any */}
                {ho.responseNotes && (
                  <div className="response-notes-box">
                    <strong>Recipient Response:</strong> {ho.responseNotes}
                  </div>
                )}

                {/* Linked Task Chip */}
                {ho.task && (
                  <div className="linked-task-chip">
                    <LinkIcon size={13} />
                    <span>
                      Linked Task: <strong>{ho.task.title}</strong> ({ho.task.category} • {ho.task.status})
                    </span>
                  </div>
                )}

                <div className="handover-meta">
                  {ho.dueDate && (
                    <div className="meta-item">
                      <Calendar size={13} /> Target Date: <strong>{ho.dueDate}</strong>
                    </div>
                  )}
                  <div className="meta-item">
                    <Clock size={13} /> Created: {new Date(ho.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Actions */}
                <div className="handover-actions">
                  {/* Recipient Action: Accept or Reject */}
                  {isRecipient && ho.status === 'Pending' && (
                    <>
                      <button
                        className="card-action-btn"
                        style={{ color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                        onClick={() => setHandoverToRespond({ id: ho.id, action: 'Accepted' })}
                      >
                        <Check size={14} />
                        <span>Accept Handover</span>
                      </button>

                      <button
                        className="card-action-btn delete"
                        onClick={() => setHandoverToRespond({ id: ho.id, action: 'Rejected' })}
                      >
                        <Ban size={14} />
                        <span>Decline</span>
                      </button>
                    </>
                  )}

                  {/* Mark Completed */}
                  {ho.status === 'Accepted' && (isRecipient || isSender || isHOD) && (
                    <button
                      className="card-action-btn"
                      onClick={() => handleStatusUpdate(ho.id, 'Completed')}
                    >
                      <CheckCircle2 size={14} />
                      <span>Mark Work Completed</span>
                    </button>
                  )}

                  {/* Cancel Pending */}
                  {ho.status === 'Pending' && (isSender || isHOD) && (
                    <button
                      className="card-action-btn delete"
                      onClick={() => handleDelete(ho.id)}
                      title="Cancel Handover"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Handover Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h4>Initiate Academic Handover</h4>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="handover-recipient-select">
                    Recipient Faculty Member *
                  </label>
                  <select
                    id="handover-recipient-select"
                    className="form-select"
                    required
                    value={newRecipientId}
                    onChange={e => setNewRecipientId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">-- Select Recipient --</option>
                    {facultyList.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.fullName} ({f.role.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="handover-task-select">
                    Link Related Task (Optional)
                  </label>
                  <select
                    id="handover-task-select"
                    className="form-select"
                    value={newTaskId}
                    onChange={e => setNewTaskId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">-- No Linked Task --</option>
                    {taskList.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="handover-title-input">
                    Handover Title *
                  </label>
                  <input
                    id="handover-title-input"
                    className="form-input"
                    type="text"
                    required
                    placeholder="e.g. Computer Networks Midterm Exam Duties"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="handover-notes-input">
                    Context, Guidelines & Deliverables *
                  </label>
                  <textarea
                    id="handover-notes-input"
                    className="form-textarea"
                    rows={4}
                    required
                    placeholder="Explain the required duties, resources, syllabus units, or handover requirements..."
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="handover-due-date">
                    Target Completion Date
                  </label>
                  <input
                    id="handover-due-date"
                    className="form-input"
                    type="date"
                    value={newDueDate}
                    onChange={e => setNewDueDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="card-action-btn"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={submitting}>
                  {submitting ? 'Initiating...' : 'Send Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recipient Accept/Reject Response Modal */}
      {handoverToRespond && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h4>
                {handoverToRespond.action === 'Accepted' ? 'Accept Handover' : 'Decline Handover'}
              </h4>
              <button className="modal-close-btn" onClick={() => setHandoverToRespond(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {handoverToRespond.action === 'Accepted'
                  ? 'Confirm acceptance of this academic responsibility. You can add notes for the sender below.'
                  : 'Please state the reason for declining this handover so the sender can reallocate.'}
              </p>

              <div className="form-group">
                <label className="form-label" htmlFor="handover-response-notes">
                  Response Notes {handoverToRespond.action === 'Rejected' && '*'}
                </label>
                <textarea
                  id="handover-response-notes"
                  className="form-textarea"
                  rows={3}
                  required={handoverToRespond.action === 'Rejected'}
                  placeholder={
                    handoverToRespond.action === 'Accepted'
                      ? 'e.g. Confirmed, will coordinate with lab assistant.'
                      : 'e.g. Schedule conflict with department evaluation.'
                  }
                  value={responseNotes}
                  onChange={e => setResponseNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="card-action-btn"
                onClick={() => setHandoverToRespond(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={handoverToRespond.action === 'Accepted' ? 'submit-btn' : 'card-action-btn delete'}
                onClick={() =>
                  handleStatusUpdate(handoverToRespond.id, handoverToRespond.action, responseNotes)
                }
              >
                {handoverToRespond.action === 'Accepted' ? 'Confirm Acceptance' : 'Decline Handover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
