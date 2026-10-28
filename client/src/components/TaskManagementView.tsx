import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Task, TaskPriority, TaskStatus, TaskSummary, EligibleAssignee } from '../types/task';
import {
  CheckSquare,
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  Trash2,
  Edit2,
  UserCheck,
  X,
  Activity,
  ChevronDown,
  RotateCcw,
  Clock,
  ShieldCheck,
  ArrowRight,
  ListTodo,
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
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [viewFilter, setViewFilter] = useState<'all' | 'assigned_to_me' | 'created_by_me'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToReassign, setTaskToReassign] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Create Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [eligibleAssignees, setEligibleAssignees] = useState<EligibleAssignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState<boolean>(false);
  const [submittingTask, setSubmittingTask] = useState<boolean>(false);

  // Reassign Modal State
  const [reassignCandidateId, setReassignCandidateId] = useState<string>('');
  const [reassignCandidates, setReassignCandidates] = useState<EligibleAssignee[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(false);
  const [submittingReassign, setSubmittingReassign] = useState<boolean>(false);
  const [reassignSearchTerm, setReassignSearchTerm] = useState<string>('');

  // Status & Delete submitting trackers
  const [submittingStatusId, setSubmittingStatusId] = useState<number | null>(null);
  const [submittingDeleteId, setSubmittingDeleteId] = useState<number | null>(null);

  // Check if current actor can allocate tasks based on role hierarchy
  const canAllocate =
    user?.role === 'HOD' ||
    user?.role === 'PROFESSOR' ||
    (user?.role === 'ASSISTANT_PROFESSOR' && user.canAssignWork);

  // Check if filters are actively applied
  const hasActiveFilters = Boolean(
    searchTerm.trim() || statusFilter || priorityFilter || viewFilter !== 'all'
  );

  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setPriorityFilter('');
    setViewFilter('all');
  };

  const fetchTasksAndSummary = useCallback(async () => {
    if (!user?.departmentId) return;
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.append('status', statusFilter);
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
  }, [user?.departmentId, statusFilter, priorityFilter, viewFilter, searchTerm]);

  useEffect(() => {
    fetchTasksAndSummary();
  }, [fetchTasksAndSummary]);

  // Keyboard accessibility: Close modals on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (taskToDelete) setTaskToDelete(null);
        else if (selectedTask) setSelectedTask(null);
        else if (taskToEdit) setTaskToEdit(null);
        else if (taskToReassign) setTaskToReassign(null);
        else if (showCreateModal) setShowCreateModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [taskToDelete, selectedTask, taskToEdit, taskToReassign, showCreateModal]);

  // Fetch eligible assignees when create modal opens
  useEffect(() => {
    if (!showCreateModal || !user?.departmentId) return;

    let isMounted = true;
    async function loadAssignees() {
      setLoadingAssignees(true);
      try {
        const res = await fetch('/api/tasks/eligible-assignees', {
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
  }, [showCreateModal, user?.departmentId]);

  // Handle task creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDueDate || !newAssigneeId) return;

    setSubmittingTask(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
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
    if (submittingStatusId) return;
    setSubmittingStatusId(taskId);
    setError(null);
    setSuccess(null);

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

      setSuccess(`Task status updated to ${newStatus}.`);
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(data.task);
      }
      await fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setError(msg);
    } finally {
      setSubmittingStatusId(null);
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
          title: taskToEdit.title.trim(),
          description: taskToEdit.description?.trim() || null,
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
    setReassignSearchTerm('');
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/tasks/eligible-assignees?category=${task.category || ''}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.assignees?.length > 0) {
        setReassignCandidates(data.assignees);
        // Default to first candidate that is not the current assignee if possible
        const differentAssignee = data.assignees.find((a: EligibleAssignee) => a.id !== task.assignee.id);
        setReassignCandidateId(String(differentAssignee ? differentAssignee.id : data.assignees[0].id));
      } else {
        setReassignCandidates([]);
        setReassignCandidateId('');
      }
    } catch {
      setReassignCandidates([]);
      setReassignCandidateId('');
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Filter candidates in reassign dialog
  const filteredCandidates = useMemo(() => {
    if (!reassignSearchTerm.trim()) return reassignCandidates;
    const term = reassignSearchTerm.toLowerCase();
    return reassignCandidates.filter(
      c =>
        c.fullName.toLowerCase().includes(term) ||
        c.role.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term)
    );
  }, [reassignCandidates, reassignSearchTerm]);

  // Submit Reassignment
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToReassign || !reassignCandidateId) return;

    setSubmittingReassign(true);
    setError(null);
    setSuccess(null);

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
      if (selectedTask && selectedTask.id === taskToReassign.id) {
        setSelectedTask(data.task);
      }
      fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reassigning task';
      setError(msg);
    } finally {
      setSubmittingReassign(false);
    }
  };

  // Handle Delete Confirmation
  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    setSubmittingDeleteId(taskToDelete.id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/tasks/${taskToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to delete task');
      }

      setSuccess('Task deleted successfully.');
      if (selectedTask && selectedTask.id === taskToDelete.id) {
        setSelectedTask(null);
      }
      setTaskToDelete(null);
      fetchTasksAndSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting task';
      setError(msg);
    } finally {
      setSubmittingDeleteId(null);
    }
  };

  // Helper to check if task is overdue
  const checkIsOverdue = (task: Task) => {
    if (task.status === 'Completed') return false;
    const today = new Date().toISOString().slice(0, 10);
    return task.dueDate < today;
  };

  // Helper to format role names
  const formatRole = (roleStr: string) => {
    return roleStr
      .toLowerCase()
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  // Helper for initial avatar
  const getInitials = (name: string) => {
    return name
      .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+/i, '')
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  if (!user?.departmentId) {
    return (
      <div className="empty-state-box">
        <ShieldCheck size={40} color="var(--brand-ocean)" style={{ marginBottom: '0.75rem' }} />
        <h4>Administrative Notice</h4>
        <p>System Administrators manage infrastructure and do not have departmental task queues.</p>
      </div>
    );
  }

  return (
    <div className="task-mgmt-container" id="task-mgmt-section">
      {/* 1. Page Header */}
      <div className="task-page-header">
        <div className="task-header-titles">
          <div className="task-header-context">
            <CheckSquare size={16} />
            <span>Department Task Management & Workload</span>
          </div>
          <h2 className="task-main-title">Tasks</h2>
          <p className="task-main-desc">
            Manage assignments, deadlines, and progress for {user.departmentName}.
          </p>
        </div>

        <div className="task-header-actions">
          <button
            className="task-btn-secondary"
            onClick={fetchTasksAndSummary}
            disabled={loading}
            title="Refresh task data"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {canAllocate && (
            <button
              id="btn-create-task"
              className="task-btn-primary"
              aria-label="Assign New Task — Create Task"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={18} />
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
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', color: 'inherit' }}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="alert-box success" role="alert">
          <CheckCircle2 size={18} />
          <div>{success}</div>
          <button
            onClick={() => setSuccess(null)}
            style={{ marginLeft: 'auto', color: 'inherit' }}
            aria-label="Dismiss success"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 2. Workload Summary Cards (Interactive Filtering) */}
      {summary && (
        <div className="task-summary-grid">
          <div
            className={`task-summary-card total ${statusFilter === '' ? 'active-filter' : ''}`}
            onClick={() => setStatusFilter('')}
            title="Show all tasks"
          >
            <div className="summary-icon-wrap">
              <ListTodo size={22} />
            </div>
            <div className="summary-content">
              <span className="summary-stat">{summary.total}</span>
              <span className="summary-label">Total Workload</span>
            </div>
          </div>

          <div
            className={`task-summary-card pending ${statusFilter === 'Pending' ? 'active-filter' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Pending' ? '' : 'Pending')}
            title="Filter by Pending tasks"
          >
            <div className="summary-icon-wrap">
              <Clock size={22} />
            </div>
            <div className="summary-content">
              <span className="summary-stat">{summary.pending}</span>
              <span className="summary-label">Pending</span>
            </div>
          </div>

          <div
            className={`task-summary-card in-progress ${statusFilter === 'In Progress' ? 'active-filter' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'In Progress' ? '' : 'In Progress')}
            title="Filter by In Progress tasks"
          >
            <div className="summary-icon-wrap">
              <Activity size={22} />
            </div>
            <div className="summary-content">
              <span className="summary-stat">{summary.inProgress}</span>
              <span className="summary-label">In Progress</span>
            </div>
          </div>

          <div
            className={`task-summary-card completed ${statusFilter === 'Completed' ? 'active-filter' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Completed' ? '' : 'Completed')}
            title="Filter by Completed tasks"
          >
            <div className="summary-icon-wrap">
              <CheckCircle2 size={22} />
            </div>
            <div className="summary-content">
              <span className="summary-stat">{summary.completed}</span>
              <span className="summary-label">Completed</span>
            </div>
          </div>

          <div
            className="task-summary-card overdue"
            onClick={() => {
              // Quick view for overdue if any
              if (summary.overdue > 0) {
                setStatusFilter('');
                setViewFilter('all');
              }
            }}
            title="Tasks overdue"
          >
            <div className="summary-icon-wrap">
              <AlertTriangle size={22} />
            </div>
            <div className="summary-content">
              <span className="summary-stat">{summary.overdue}</span>
              <span className="summary-label">Overdue</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Search and Filters Toolbar */}
      <div className="task-toolbar">
        <div className="task-search-wrap">
          <Search size={16} className="task-search-icon" />
          <input
            type="text"
            className="task-search-input"
            placeholder="Search tasks by title or description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            aria-label="Search tasks by title or description"
          />
          {searchTerm && (
            <button
              className="task-search-clear-btn"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="task-filters-group">
          {/* View Filter */}
          <div className="task-filter-select-wrap">
            <select
              className="task-filter-select"
              value={viewFilter}
              onChange={e => setViewFilter(e.target.value as any)}
              aria-label="Filter tasks by view scope"
            >
              <option value="all">View: All Relevant</option>
              <option value="assigned_to_me">Assigned to Me</option>
              <option value="created_by_me">Created by Me</option>
            </select>
            <span className="task-select-arrow">
              <ChevronDown size={14} />
            </span>
          </div>

          {/* Status Filter */}
          <div className="task-filter-select-wrap">
            <select
              className="task-filter-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Filter tasks by status"
            >
              <option value="">Status: All</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
            <span className="task-select-arrow">
              <ChevronDown size={14} />
            </span>
          </div>

          {/* Priority Filter */}
          <div className="task-filter-select-wrap">
            <select
              className="task-filter-select"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              aria-label="Filter tasks by priority"
            >
              <option value="">Priority: All</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <span className="task-select-arrow">
              <ChevronDown size={14} />
            </span>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              className="task-clear-filters-btn"
              onClick={clearAllFilters}
              title="Reset all search and filter conditions"
            >
              <X size={14} />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Task Cards Grid */}
      {loading && !tasks.length ? (
        <div className="loading-box">
          <RefreshCw size={20} className="spin" />
          <span>Loading department tasks...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-state-box">
          <CheckSquare size={38} color="var(--brand-ocean)" style={{ marginBottom: '0.75rem' }} />
          <h4>No Tasks Found</h4>
          <p>
            {hasActiveFilters
              ? 'No tasks match your current filter combination. Try clearing some filters.'
              : `There are currently no tasks allocated in ${user.departmentName}.`}
          </p>
          {hasActiveFilters && (
            <button className="task-btn-secondary" onClick={clearAllFilters}>
              <RotateCcw size={14} />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="tasks-grid">
          {tasks.map(task => {
            const isAssignee = task.assignee.id === user.id;
            const isCreator = task.creator.id === user.id;
            const isHOD = user.role === 'HOD';
            const canManage = isCreator || isHOD;
            const isOverdue = checkIsOverdue(task);
            const statusSlug = task.status.toLowerCase().replace(' ', '-');
            const prioritySlug = task.priority.toLowerCase();

            return (
              <div
                key={task.id}
                className={`task-item-card status-${statusSlug} priority-${prioritySlug}`}
                data-priority={task.priority}
              >
                <div>
                  {/* Card Header: Priority & Status Badges */}
                  <div className="task-item-header">
                    <div className="task-card-badges">
                      <span className={`priority-pill ${prioritySlug}`}>
                        {task.priority === 'High' && <AlertTriangle size={12} />}
                        {task.priority === 'Medium' && <Clock size={12} />}
                        {task.priority === 'Low' && <CheckSquare size={12} />}
                        <span>{task.priority} Priority</span>
                      </span>

                      {isOverdue && (
                        <span className="task-overdue-pill" title="Task deadline has passed">
                          <AlertTriangle size={11} />
                          <span>Overdue</span>
                        </span>
                      )}
                    </div>

                    <span className={`status-badge ${statusSlug}`}>
                      {task.status === 'Completed' && <CheckCircle2 size={12} />}
                      {task.status === 'In Progress' && <Activity size={12} />}
                      {task.status === 'Pending' && <Clock size={12} />}
                      <span>{task.status}</span>
                    </span>
                  </div>

                  {/* Card Body: Title & Description */}
                  <div className="task-card-body" style={{ marginTop: '0.85rem' }}>
                    <h4
                      className="task-item-title"
                      onClick={() => setSelectedTask(task)}
                      title="Click to view full task details"
                    >
                      {task.title}
                    </h4>

                    {task.description ? (
                      <p className="task-item-desc">{task.description}</p>
                    ) : (
                      <p className="task-item-desc empty">No deliverables or instructions specified.</p>
                    )}
                  </div>
                </div>

                <div>
                  {/* Card Meta: Assignee, Due Date, Completed At */}
                  <div className="task-item-meta">
                    <div className="meta-line">
                      <User size={14} className="task-meta-icon" />
                      <span className="task-meta-label">Assignee:</span>
                      <strong className="task-meta-val">{task.assignee.fullName}</strong>
                    </div>

                    <div className="meta-line">
                      <Calendar size={14} className="task-meta-icon" />
                      <span className="task-meta-label">Due Date:</span>
                      <strong className={`task-meta-val ${isOverdue ? 'overdue-alert' : ''}`}>
                        {task.dueDate}
                      </strong>
                    </div>

                    {task.completedAt && (
                      <div className="meta-line" style={{ color: 'var(--color-success)' }}>
                        <CheckCircle2 size={14} className="task-meta-icon" />
                        <span className="task-meta-label" style={{ color: 'var(--color-success)' }}>
                          Completed:
                        </span>
                        <strong className="task-meta-val">
                          {new Date(task.completedAt).toLocaleDateString()}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Card Actions Area */}
                  <div className="task-item-actions">
                    <div className="task-actions-left">
                      {/* Prominent Complete Task button for eligible assigned faculty */}
                      {isAssignee && task.status !== 'Completed' && (
                        <button
                          id={`btn-complete-task-${task.id}`}
                          className="action-btn complete-task-btn"
                          onClick={() => handleStatusChange(task.id, 'Completed')}
                          disabled={submittingStatusId === task.id}
                          title="Mark this task as completed"
                        >
                          <CheckCircle2
                            size={14}
                            className={submittingStatusId === task.id ? 'spin' : ''}
                          />
                          <span>
                            {submittingStatusId === task.id ? 'Completing...' : 'Complete Task'}
                          </span>
                        </button>
                      )}

                      {/* Start work quick action for Pending tasks */}
                      {task.status === 'Pending' && (isAssignee || canManage) && (
                        <button
                          className="action-btn start"
                          onClick={() => handleStatusChange(task.id, 'In Progress')}
                          disabled={submittingStatusId === task.id}
                          title="Start work on this task"
                        >
                          <Activity size={13} />
                          <span>Start</span>
                        </button>
                      )}

                      {/* Reopen action for managers */}
                      {task.status === 'Completed' && canManage && (
                        <button
                          className="action-btn revert"
                          onClick={() => handleStatusChange(task.id, 'In Progress')}
                          disabled={submittingStatusId === task.id}
                          title="Reopen completed task"
                        >
                          <RotateCcw size={13} />
                          <span>Reopen</span>
                        </button>
                      )}
                    </div>

                    <div className="task-actions-right">
                      {/* View Details */}
                      <button
                        className="action-btn view"
                        onClick={() => setSelectedTask(task)}
                        title="View full task details"
                      >
                        Details
                      </button>

                      {/* Management Controls */}
                      {canManage && (
                        <>
                          <button
                            className="task-icon-btn"
                            onClick={() => setTaskToEdit({ ...task })}
                            title="Edit task details"
                            aria-label="Edit task"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="task-icon-btn"
                            onClick={() => openReassignModal(task)}
                            title="Reassign faculty member"
                            aria-label="Reassign faculty"
                          >
                            <UserCheck size={14} />
                          </button>
                          <button
                            className="task-icon-btn danger"
                            onClick={() => setTaskToDelete(task)}
                            title="Delete task"
                            aria-label="Delete task"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================
          Modal 1: Create Task Form Dialog
          ======================================================== */}
      {showCreateModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-task-heading"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h4 id="create-task-heading">
                <Plus size={18} color="var(--brand-ocean)" />
                <span>Assign New Departmental Task</span>
              </h4>
              <button
                className="close-btn"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close dialog"
                disabled={submittingTask}
              >
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
                  placeholder="e.g. Prepare Operating Systems Mid-Term Practical Exam"
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
                  placeholder="Provide explicit instructions, syllabus coverage, submission criteria..."
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  disabled={submittingTask}
                />
              </div>

              <div className="modal-grid-fields">
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
              </div>

              <div className="form-field">
                <label htmlFor="task-assignee-select">Assignee (Eligible Faculty) *</label>
                {loadingAssignees ? (
                  <span className="form-note">Checking eligible faculty members...</span>
                ) : eligibleAssignees.length === 0 ? (
                  <span className="form-note error">No eligible faculty members found in department.</span>
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
                <span className="form-note">
                  Only faculty members authorized by institutional allocation policy in {user.departmentName} are shown.
                </span>
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
                  disabled={submittingTask || !newAssigneeId || !newTitle.trim() || !newDueDate}
                >
                  {submittingTask ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={15} />
                      <span>Assign Task</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          Modal 2: Improved Task Assignment & Reassignment Dialog
          ======================================================== */}
      {taskToReassign && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reassign-dialog-heading"
        >
          <div className="modal-content detail">
            <div className="modal-header">
              <h4 id="reassign-dialog-heading">
                <UserCheck size={18} color="var(--brand-ocean)" />
                <span>Reassign Faculty Member</span>
              </h4>
              <button
                className="close-btn"
                onClick={() => setTaskToReassign(null)}
                aria-label="Close dialog"
                disabled={submittingReassign}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReassignSubmit} className="modal-form">
              {/* Section A: Task Summary */}
              <div className="assign-task-summary-card">
                <div className="assign-summary-header">
                  <h5 className="assign-summary-title">{taskToReassign.title}</h5>
                  <span className={`status-badge ${taskToReassign.status.toLowerCase().replace(' ', '-')}`}>
                    {taskToReassign.status}
                  </span>
                </div>

                <div className="assign-summary-meta-grid">
                  <div>
                    <span className="task-meta-label">Priority: </span>
                    <strong className="task-meta-val">{taskToReassign.priority}</strong>
                  </div>
                  <div>
                    <span className="task-meta-label">Due Date: </span>
                    <strong className="task-meta-val">{taskToReassign.dueDate}</strong>
                  </div>
                </div>

                <div className="assign-current-assignee-card">
                  <div className="assignee-avatar-sm">
                    {getInitials(taskToReassign.assignee.fullName)}
                  </div>
                  <div className="faculty-info">
                    <span className="task-meta-label">Current Assignee</span>
                    <strong className="task-meta-val">
                      {taskToReassign.assignee.fullName} ({formatRole(taskToReassign.assignee.role)})
                    </strong>
                  </div>
                </div>
              </div>

              {/* Section B: Searchable Eligible Assignee Selection */}
              <div className="form-field">
                <label>Select New Faculty Member *</label>

                {/* Live Filter Input */}
                <div className="faculty-search-wrapper">
                  <Search size={14} className="faculty-search-icon" />
                  <input
                    type="text"
                    className="faculty-search-input"
                    placeholder="Search eligible faculty by name or role..."
                    value={reassignSearchTerm}
                    onChange={e => setReassignSearchTerm(e.target.value)}
                    disabled={submittingReassign || loadingCandidates}
                  />
                </div>

                {loadingCandidates ? (
                  <div className="loading-box" style={{ padding: '1.5rem' }}>
                    <RefreshCw size={16} className="spin" />
                    <span>Loading eligible faculty candidates...</span>
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="empty-state-box" style={{ padding: '1.5rem' }}>
                    <p style={{ margin: 0 }}>
                      {reassignCandidates.length === 0
                        ? 'No other eligible faculty members available in this department.'
                        : 'No faculty members match your search.'}
                    </p>
                  </div>
                ) : (
                  <div className="faculty-list-container" role="radiogroup" aria-label="Eligible Faculty">
                    {filteredCandidates.map(candidate => {
                      const isSelected = String(candidate.id) === reassignCandidateId;
                      const isCurrent = candidate.id === taskToReassign.assignee.id;

                      return (
                        <div
                          key={candidate.id}
                          className={`faculty-select-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setReassignCandidateId(String(candidate.id))}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={e => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              setReassignCandidateId(String(candidate.id));
                            }
                          }}
                        >
                          <div className="faculty-card-left">
                            <div className="faculty-avatar">
                              {getInitials(candidate.fullName)}
                            </div>
                            <div className="faculty-info">
                              <span className="faculty-name">
                                {candidate.fullName} {isCurrent && '(Current)'}
                              </span>
                              <span className="faculty-role-dept">
                                <span>{formatRole(candidate.role)}</span>
                                <span>•</span>
                                <span>{candidate.email}</span>
                              </span>
                            </div>
                          </div>

                          <div className="faculty-radio">
                            {isSelected && <div className="faculty-radio-inner" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section C: Policy & Delegation Note */}
              <div className="assign-policy-box">
                <ShieldCheck size={18} color="var(--brand-ocean)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p>
                  Institutional policy enforced: Reassignment is confined to verified active faculty in{' '}
                  <strong>{user.departmentName}</strong> adhering to academic role hierarchy.
                </p>
              </div>

              {/* Section D: Footer Actions */}
              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setTaskToReassign(null)}
                  disabled={submittingReassign}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={
                    submittingReassign ||
                    !reassignCandidateId ||
                    reassignCandidates.length === 0 ||
                    String(taskToReassign.assignee.id) === reassignCandidateId
                  }
                >
                  {submittingReassign ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Reassigning...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight size={15} />
                      <span>Reassign Task</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          Modal 3: Structured Task Details Modal
          ======================================================== */}
      {selectedTask && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedTask(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-detail-title"
        >
          <div className="modal-content detail" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className={`priority-pill ${selectedTask.priority.toLowerCase()}`}>
                  {selectedTask.priority} Priority
                </span>
                <span className={`status-badge ${selectedTask.status.toLowerCase().replace(' ', '-')}`}>
                  {selectedTask.status}
                </span>
              </div>
              <button
                className="close-btn"
                onClick={() => setSelectedTask(null)}
                aria-label="Close task details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-form">
              <h3 id="task-detail-title" className="detail-title" style={{ margin: 0, fontSize: '1.35rem' }}>
                {selectedTask.title}
              </h3>

              {/* Structured Metadata Grid */}
              <div className="detail-meta-grid">
                <div>
                  <span className="task-meta-label">Status</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    <strong className="task-meta-val">{selectedTask.status}</strong>
                  </div>
                </div>

                <div>
                  <span className="task-meta-label">Due Date</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    <strong className={`task-meta-val ${checkIsOverdue(selectedTask) ? 'overdue-alert' : ''}`}>
                      {selectedTask.dueDate} {checkIsOverdue(selectedTask) && '(Overdue)'}
                    </strong>
                  </div>
                </div>

                <div>
                  <span className="task-meta-label">Assignee</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    <strong className="task-meta-val">{selectedTask.assignee.fullName}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {formatRole(selectedTask.assignee.role)} • {selectedTask.assignee.email}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="task-meta-label">Created By</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    <strong className="task-meta-val">{selectedTask.creator.fullName}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {formatRole(selectedTask.creator.role)}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="task-meta-label">Department</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    <strong className="task-meta-val">
                      {selectedTask.department.name} ({selectedTask.department.code})
                    </strong>
                  </div>
                </div>

                <div>
                  <span className="task-meta-label">Completion Status</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    <strong className="task-meta-val">
                      {selectedTask.completedAt
                        ? new Date(selectedTask.completedAt).toLocaleString()
                        : 'Not completed yet'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Description & Deliverables */}
              <div className="detail-desc-box">
                <span className="task-meta-label" style={{ fontWeight: 600 }}>
                  Description & Deliverables:
                </span>
                <p>{selectedTask.description || 'No detailed instructions or criteria provided.'}</p>
              </div>

              {/* Footer Actions */}
              <div className="modal-actions">
                {selectedTask.assignee.id === user.id && selectedTask.status !== 'Completed' && (
                  <button
                    id="btn-complete-task-detail"
                    className="submit-btn"
                    onClick={() => handleStatusChange(selectedTask.id, 'Completed')}
                    disabled={submittingStatusId === selectedTask.id}
                    style={{ background: '#15803d', borderColor: '#166534' }}
                  >
                    <CheckCircle2
                      size={16}
                      className={submittingStatusId === selectedTask.id ? 'spin' : ''}
                    />
                    <span>
                      {submittingStatusId === selectedTask.id ? 'Completing...' : 'Complete Task'}
                    </span>
                  </button>
                )}

                <button className="cancel-btn" onClick={() => setSelectedTask(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Modal 4: Edit Task Details Modal
          ======================================================== */}
      {taskToEdit && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-task-heading"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h4 id="edit-task-heading">
                <Edit2 size={18} color="var(--brand-ocean)" />
                <span>Edit Task Details</span>
              </h4>
              <button
                className="close-btn"
                onClick={() => setTaskToEdit(null)}
                aria-label="Close edit dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-field">
                <label htmlFor="edit-task-title">Task Title *</label>
                <input
                  id="edit-task-title"
                  type="text"
                  required
                  value={taskToEdit.title}
                  onChange={e => setTaskToEdit({ ...taskToEdit, title: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label htmlFor="edit-task-desc">Description</label>
                <textarea
                  id="edit-task-desc"
                  rows={3}
                  value={taskToEdit.description || ''}
                  onChange={e => setTaskToEdit({ ...taskToEdit, description: e.target.value })}
                />
              </div>

              <div className="modal-grid-fields">
                <div className="form-field">
                  <label htmlFor="edit-task-priority">Priority</label>
                  <select
                    id="edit-task-priority"
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
                  <label htmlFor="edit-task-duedate">Due Date (YYYY-MM-DD)</label>
                  <input
                    id="edit-task-duedate"
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

      {/* ========================================================
          Modal 5: Delete Task Confirmation Dialog
          ======================================================== */}
      {taskToDelete && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="delete-confirm-box">
              <div className="delete-confirm-icon">
                <Trash2 size={26} />
              </div>
              <h4 id="delete-confirm-title" className="delete-confirm-title">
                Delete Task
              </h4>
              <p className="delete-confirm-desc">
                Are you sure you want to permanently delete{' '}
                <strong>"{taskToDelete.title}"</strong>? This action cannot be undone.
              </p>
              <div className="modal-actions" style={{ width: '100%', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setTaskToDelete(null)}
                  disabled={submittingDeleteId === taskToDelete.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="submit-btn danger"
                  onClick={confirmDeleteTask}
                  disabled={submittingDeleteId === taskToDelete.id}
                >
                  {submittingDeleteId === taskToDelete.id ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Confirm Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
