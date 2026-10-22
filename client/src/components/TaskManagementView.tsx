import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Task, TaskCategory, TaskPriority, TaskStatus, TaskSummary, EligibleAssignee } from '../types/task';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  Trash2,
  Edit2,
  UserCheck,
  X,
  Activity,
} from 'lucide-react';

export const TaskManagementView: React.FC = () => {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [viewFilter, setViewFilter] = useState<'all' | 'assigned_to_me' | 'created_by_me'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToReassign, setTaskToReassign] = useState<Task | null>(null);

  // Create Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<TaskCategory>('Teaching');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [eligibleAssignees, setEligibleAssignees] = useState<EligibleAssignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState<boolean>(false);
  const [submittingTask, setSubmittingTask] = useState<boolean>(false);

  // Reassign State
  const [reassignCandidateId, setReassignCandidateId] = useState<string>('');
  const [reassignCandidates, setReassignCandidates] = useState<EligibleAssignee[]>([]);

  // Check if current actor can allocate tasks
  const canAllocate =
    user?.role === 'HOD' ||
    user?.role === 'PROFESSOR' ||
    (user?.role === 'ASSISTANT_PROFESSOR' && user.canAssignWork);

  // Determine permitted categories for current actor
  const permittedCategories: TaskCategory[] =
    user?.role === 'HOD'
      ? ['Teaching', 'Research', 'Grading', 'Meetings', 'Administrative']
      : user?.role === 'PROFESSOR'
      ? ['Teaching', 'Research', 'Grading', 'Meetings']
      : user?.role === 'ASSISTANT_PROFESSOR' && user.canAssignWork
      ? ['Teaching', 'Research', 'Grading']
      : [];

  const fetchTasksAndSummary = useCallback(async () => {
    if (!user?.departmentId) return;
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.append('status', statusFilter);
      if (categoryFilter) queryParams.append('category', categoryFilter);
      if (priorityFilter) queryParams.append('priority', priorityFilter);
      if (viewFilter) queryParams.append('view', viewFilter);
      if (searchTerm) queryParams.append('search', searchTerm);

      const [tasksRes, summaryRes] = await Promise.all([
        fetch(`/api/tasks?${queryParams.toString()}`, { credentials: 'include' }),
        fetch('/api/tasks/summary', { credentials: 'include' }),
      ]);

      const tasksData = await tasksRes.json();
      const summaryData = await summaryRes.json();

      if (!tasksRes.ok) throw new Error(tasksData.error?.message || 'Failed to load tasks');
      if (!summaryRes.ok) throw new Error(summaryData.error?.message || 'Failed to load summary');

      setTasks(tasksData.tasks || []);
      setSummary(summaryData.summary || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching tasks';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user?.departmentId, statusFilter, categoryFilter, priorityFilter, viewFilter, searchTerm]);

  useEffect(() => {
    fetchTasksAndSummary();
  }, [fetchTasksAndSummary]);

  // Fetch eligible assignees when category changes in create modal
  useEffect(() => {
    if (!showCreateModal || !user?.departmentId) return;

    let isMounted = true;
    async function loadAssignees() {
      setLoadingAssignees(true);
      try {
        const res = await fetch(`/api/tasks/eligible-assignees?category=${newCategory}`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (isMounted) {
          if (res.ok && data.assignees) {
            setEligibleAssignees(data.assignees);
            if (data.assignees.length > 0) {
              setNewAssigneeId(String(data.assignees[0].id));
            } else {
              setNewAssigneeId('');
            }
          } else {
            setEligibleAssignees([]);
            setNewAssigneeId('');
          }
        }
      } catch {
        if (isMounted) {
          setEligibleAssignees([]);
          setNewAssigneeId('');
        }
      } finally {
        if (isMounted) setLoadingAssignees(false);
      }
    }

    loadAssignees();
    return () => {
      isMounted = false;
    };
  }, [showCreateModal, newCategory, user?.departmentId]);

  // Handle task creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDueDate || !newAssigneeId) return;

    setSubmittingTask(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newTitle,
          description: newDescription || undefined,
          category: newCategory,
          priority: newPriority,
          dueDate: newDueDate,
          assigneeId: Number(newAssigneeId),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create task');
      }

      setSuccess(`Task "${data.task.title}" allocated successfully.`);
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewDueDate('');
      fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating task';
      setError(msg);
    } finally {
      setSubmittingTask(false);
    }
  };

  // Handle Status Update
  const handleStatusChange = async (taskId: number, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update status');
      }

      setSuccess(`Task status changed to ${newStatus}.`);
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(data.task);
      }
      fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setError(msg);
    }
  };

  // Handle Task Details Update
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToEdit) return;

    try {
      const res = await fetch(`/api/tasks/${taskToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: taskToEdit.title,
          description: taskToEdit.description,
          priority: taskToEdit.priority,
          dueDate: taskToEdit.dueDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update task');
      }

      setSuccess('Task updated successfully.');
      setTaskToEdit(null);
      fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating task';
      setError(msg);
    }
  };

  // Open Reassign Modal & fetch candidates
  const openReassignModal = async (task: Task) => {
    setTaskToReassign(task);
    try {
      const res = await fetch(`/api/tasks/eligible-assignees?category=${task.category}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.assignees?.length > 0) {
        setReassignCandidates(data.assignees);
        setReassignCandidateId(String(data.assignees[0].id));
      } else {
        setReassignCandidates([]);
      }
    } catch {
      setReassignCandidates([]);
    }
  };

  // Submit Reassignment
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToReassign || !reassignCandidateId) return;

    try {
      const res = await fetch(`/api/tasks/${taskToReassign.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assigneeId: Number(reassignCandidateId) }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to reassign task');
      }

      setSuccess(`Task reassigned to ${data.task.assignee.fullName}.`);
      setTaskToReassign(null);
      fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reassigning task';
      setError(msg);
    }
  };

  // Handle Delete
  const handleDeleteTask = async (taskId: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to delete task');
      }

      setSuccess('Task deleted successfully.');
      setSelectedTask(null);
      fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting task';
      setError(msg);
    }
  };

  if (!user?.departmentId) {
    return (
      <div className="empty-state-box">
        <p>System Administrators manage infrastructure and do not have departmental task queues.</p>
      </div>
    );
  }

  return (
    <div className="task-mgmt-container" id="task-mgmt-section">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h3>Department Task Management & Workload</h3>
          <p>
            Allocate, track, and execute academic responsibilities for {user.departmentName}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="refresh-btn" onClick={fetchTasksAndSummary} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {canAllocate && (
            <button
              id="btn-create-task"
              className="submit-btn"
              onClick={() => {
                setShowCreateModal(true);
                if (permittedCategories.length > 0) {
                  setNewCategory(permittedCategories[0]);
                }
              }}
            >
              <Plus size={16} />
              <span>Assign New Task</span>
            </button>
          )}
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
        <div className="alert-box success" role="alert">
          <CheckCircle2 size={18} />
          <div>{success}</div>
          <button onClick={() => setSuccess(null)} style={{ marginLeft: 'auto', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Workload Summary Cards */}
      {summary && (
        <div className="task-summary-grid">
          <div className="summary-card total">
            <span className="summary-num">{summary.total}</span>
            <span className="summary-label">Total Workload</span>
          </div>
          <div className="summary-card pending">
            <span className="summary-num">{summary.pending}</span>
            <span className="summary-label">Pending</span>
          </div>
          <div className="summary-card in-progress">
            <span className="summary-num">{summary.inProgress}</span>
            <span className="summary-label">In Progress</span>
          </div>
          <div className="summary-card completed">
            <span className="summary-num">{summary.completed}</span>
            <span className="summary-label">Completed</span>
          </div>
          <div className="summary-card overdue">
            <span className="summary-num">{summary.overdue}</span>
            <span className="summary-label">Overdue</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="task-filters-card">
        <div className="filter-input-wrap search-field">
          <Search size={16} className="input-icon" />
          <input
            type="text"
            placeholder="Search tasks by title or description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-controls-group">
          <select value={viewFilter} onChange={e => setViewFilter(e.target.value as any)}>
            <option value="all">View: All Relevant</option>
            <option value="assigned_to_me">Assigned to Me</option>
            <option value="created_by_me">Created by Me</option>
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Status: All</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>

          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Category: All</option>
            <option value="Teaching">Teaching</option>
            <option value="Research">Research</option>
            <option value="Grading">Grading</option>
            <option value="Meetings">Meetings</option>
            <option value="Administrative">Administrative</option>
          </select>

          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            <option value="">Priority: All</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
      </div>

      {/* Tasks List */}
      {loading && !tasks.length ? (
        <div className="loading-box">Loading department tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="empty-state-box">
          <CheckSquare size={36} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h4>No Tasks Found</h4>
          <p>There are no tasks matching your selected filters in {user.departmentName}.</p>
        </div>
      ) : (
        <div className="tasks-grid">
          {tasks.map(task => {
            const isAssignee = task.assignee.id === user.id;
            const isCreator = task.creator.id === user.id;
            const isHOD = user.role === 'HOD';
            const canManage = isCreator || isHOD;

            return (
              <div
                key={task.id}
                className={`task-item-card status-${task.status.toLowerCase().replace(' ', '-')}`}
              >
                <div className="task-item-header">
                  <div className="task-badges">
                    <span className={`priority-pill ${task.priority.toLowerCase()}`}>
                      {task.priority} Priority
                    </span>
                    <span className="category-pill">{task.category}</span>
                  </div>

                  <span className={`status-badge ${task.status.toLowerCase().replace(' ', '-')}`}>
                    {task.status}
                  </span>
                </div>

                <h4 className="task-item-title" onClick={() => setSelectedTask(task)}>
                  {task.title}
                </h4>

                {task.description && (
                  <p className="task-item-desc">
                    {task.description.length > 120
                      ? `${task.description.slice(0, 120)}...`
                      : task.description}
                  </p>
                )}

                <div className="task-item-meta">
                  <div className="meta-line">
                    <User size={13} />
                    <span>Assignee: <strong>{task.assignee.fullName}</strong></span>
                  </div>
                  <div className="meta-line">
                    <Calendar size={13} />
                    <span>Due: <strong>{task.dueDate}</strong></span>
                  </div>
                </div>

                <div className="task-item-actions">
                  {/* Status Progression Quick Buttons */}
                  {task.status === 'Pending' && (isAssignee || canManage) && (
                    <button
                      className="action-btn start"
                      onClick={() => handleStatusChange(task.id, 'In Progress')}
                      title="Start work"
                    >
                      <Activity size={14} /> Start
                    </button>
                  )}

                  {task.status === 'In Progress' && (isAssignee || canManage) && (
                    <button
                      className="action-btn complete"
                      onClick={() => handleStatusChange(task.id, 'Completed')}
                      title="Mark task completed"
                    >
                      <CheckCircle2 size={14} /> Complete
                    </button>
                  )}

                  {task.status === 'Completed' && canManage && (
                    <button
                      className="action-btn revert"
                      onClick={() => handleStatusChange(task.id, 'In Progress')}
                      title="Reopen task"
                    >
                      <RefreshCw size={14} /> Reopen
                    </button>
                  )}

                  <button
                    className="action-btn view"
                    onClick={() => setSelectedTask(task)}
                    title="View details"
                  >
                    Details
                  </button>

                  {canManage && (
                    <>
                      <button
                        className="action-btn icon-only"
                        onClick={() => setTaskToEdit({ ...task })}
                        title="Edit task"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="action-btn icon-only"
                        onClick={() => openReassignModal(task)}
                        title="Reassign faculty"
                      >
                        <UserCheck size={14} />
                      </button>
                      <button
                        className="action-btn icon-only danger"
                        onClick={() => handleDeleteTask(task.id)}
                        title="Delete task"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h4>Assign New Departmental Task</h4>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="modal-form">
              <div className="form-field">
                <label htmlFor="task-title-input">Task Title *</label>
                <input
                  id="task-title-input"
                  type="text"
                  required
                  placeholder="e.g. Prepare Operating Systems Mid-Term Exam"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  disabled={submittingTask}
                />
              </div>

              <div className="form-field">
                <label htmlFor="task-desc-input">Description & Deliverables</label>
                <textarea
                  id="task-desc-input"
                  rows={3}
                  placeholder="Provide explicit instructions, syllabus coverage, or submission criteria..."
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  disabled={submittingTask}
                />
              </div>

              <div className="modal-grid-fields">
                <div className="form-field">
                  <label htmlFor="task-category-select">Category *</label>
                  <select
                    id="task-category-select"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as TaskCategory)}
                    disabled={submittingTask}
                  >
                    {permittedCategories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="task-priority-select">Priority</label>
                  <select
                    id="task-priority-select"
                    value={newPriority}
                    onChange={e => setNewPriority(e.target.value as TaskPriority)}
                    disabled={submittingTask}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div className="modal-grid-fields">
                <div className="form-field">
                  <label htmlFor="task-duedate-input">Due Date * (YYYY-MM-DD)</label>
                  <input
                    id="task-duedate-input"
                    type="date"
                    required
                    value={newDueDate}
                    onChange={e => setNewDueDate(e.target.value)}
                    disabled={submittingTask}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="task-assignee-select">Assignee (Eligible Faculty) *</label>
                  {loadingAssignees ? (
                    <span className="form-note">Checking eligible faculty...</span>
                  ) : eligibleAssignees.length === 0 ? (
                    <span className="form-note error">No eligible faculty for this category.</span>
                  ) : (
                    <select
                      id="task-assignee-select"
                      value={newAssigneeId}
                      onChange={e => setNewAssigneeId(e.target.value)}
                      disabled={submittingTask}
                    >
                      {eligibleAssignees.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.fullName} ({a.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submittingTask}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={submittingTask || !newAssigneeId || !newTitle || !newDueDate}
                >
                  {submittingTask ? 'Creating...' : 'Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      {selectedTask && (
        <div className="modal-backdrop" onClick={() => setSelectedTask(null)}>
          <div className="modal-content detail" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className={`priority-pill ${selectedTask.priority.toLowerCase()}`}>
                {selectedTask.priority} Priority
              </span>
              <button className="close-btn" onClick={() => setSelectedTask(null)}>
                <X size={18} />
              </button>
            </div>

            <h3 className="detail-title">{selectedTask.title}</h3>

            <div className="detail-meta-grid">
              <div>
                <span className="meta-label">Category:</span>
                <span className="meta-val">{selectedTask.category}</span>
              </div>
              <div>
                <span className="meta-label">Status:</span>
                <span className={`status-badge ${selectedTask.status.toLowerCase().replace(' ', '-')}`}>
                  {selectedTask.status}
                </span>
              </div>
              <div>
                <span className="meta-label">Assignee:</span>
                <span className="meta-val">
                  {selectedTask.assignee.fullName} ({selectedTask.assignee.role})
                </span>
              </div>
              <div>
                <span className="meta-label">Created By:</span>
                <span className="meta-val">
                  {selectedTask.creator.fullName} ({selectedTask.creator.role})
                </span>
              </div>
              <div>
                <span className="meta-label">Due Date:</span>
                <span className="meta-val">{selectedTask.dueDate}</span>
              </div>
              <div>
                <span className="meta-label">Completed At:</span>
                <span className="meta-val">
                  {selectedTask.completedAt
                    ? new Date(selectedTask.completedAt).toLocaleString()
                    : 'Not completed'}
                </span>
              </div>
            </div>

            <div className="detail-desc-box">
              <span className="meta-label">Description & Instructions:</span>
              <p>{selectedTask.description || 'No detailed instructions provided.'}</p>
            </div>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setSelectedTask(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {taskToEdit && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h4>Edit Task Details</h4>
              <button className="close-btn" onClick={() => setTaskToEdit(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-field">
                <label>Title</label>
                <input
                  type="text"
                  required
                  value={taskToEdit.title}
                  onChange={e => setTaskToEdit({ ...taskToEdit, title: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Description</label>
                <textarea
                  rows={3}
                  value={taskToEdit.description || ''}
                  onChange={e => setTaskToEdit({ ...taskToEdit, description: e.target.value })}
                />
              </div>

              <div className="modal-grid-fields">
                <div className="form-field">
                  <label>Priority</label>
                  <select
                    value={taskToEdit.priority}
                    onChange={e =>
                      setTaskToEdit({ ...taskToEdit, priority: e.target.value as TaskPriority })
                    }
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Due Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    required
                    value={taskToEdit.dueDate}
                    onChange={e => setTaskToEdit({ ...taskToEdit, dueDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setTaskToEdit(null)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Task Modal */}
      {taskToReassign && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h4>Reassign Faculty Member</h4>
              <button className="close-btn" onClick={() => setTaskToReassign(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReassignSubmit} className="modal-form">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Reassign task: <strong>{taskToReassign.title}</strong> ({taskToReassign.category})
              </p>

              <div className="form-field" style={{ marginTop: '1rem' }}>
                <label>Select Eligible Faculty</label>
                {reassignCandidates.length === 0 ? (
                  <span className="form-note error">No other eligible faculty members available.</span>
                ) : (
                  <select
                    value={reassignCandidateId}
                    onChange={e => setReassignCandidateId(e.target.value)}
                  >
                    {reassignCandidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.role.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setTaskToReassign(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={!reassignCandidateId || reassignCandidates.length === 0}
                >
                  Reassign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
