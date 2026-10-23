import React, { useState, useEffect, useCallback } from 'react';
import {
  DashboardResponseData,
  AdminDashboardData,
  HodDashboardData,
  ProfessorDashboardData,
  AssistantProfessorDashboardData,
} from '../types/dashboard';
import {
  Users,
  Building,
  CheckSquare,
  Clock,
  AlertTriangle,
  BookOpen,
  Send,
  Calendar,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Activity,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<DashboardResponseData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error?.message || 'Failed to fetch dashboard metrics');
      }
      setData(result.dashboard);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div className="empty-state-box">
        <RefreshCw size={28} className="spin" style={{ color: 'var(--accent-indigo)' }} />
        <h4>Loading Dashboard Metrics...</h4>
        <p>Aggregating institutional data for your role.</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="alert-box error" role="alert">
        <AlertCircle size={20} />
        <div>
          <strong>Dashboard Unavailable:</strong> {error}
        </div>
        <button className="card-action-btn" onClick={fetchDashboard} style={{ marginLeft: 'auto' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="dashboard-container" id="dashboard-view-section">
      {/* Dashboard Header */}
      <div className="view-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3>
              {data.role === 'SYSTEM_ADMIN'
                ? 'System Administration & Infrastructure Dashboard'
                : data.role === 'HOD'
                ? `${data.department.name} • HOD Command Center`
                : data.role === 'PROFESSOR'
                ? `Academic Workload & Course Dashboard • ${data.department.code}`
                : `Faculty Workload & Assignments Dashboard • ${data.department.code}`}
            </h3>
          </div>
          <p>
            {data.role === 'SYSTEM_ADMIN'
              ? 'Institutional governance, user management, and security audit metrics'
              : `Departmental workload status, syllabus coverage, and academic handovers`}
          </p>
        </div>

        <button className="refresh-btn" onClick={fetchDashboard} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* 1. SYSTEM ADMIN DASHBOARD */}
      {data.role === 'SYSTEM_ADMIN' && (
        <div className="dashboard-layout">
          {/* Top Metric Cards */}
          <div className="metric-cards-grid">
            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Total Users</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                  <Users size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as AdminDashboardData).users.total}</div>
              <div className="metric-subtext">
                <span style={{ color: '#34d399' }}>{(data as AdminDashboardData).users.active} Active</span> •{' '}
                <span style={{ color: '#f87171' }}>{(data as AdminDashboardData).users.inactive} Inactive</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Departments</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                  <Building size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as AdminDashboardData).departments.length}</div>
              <div className="metric-subtext">Active academic departments</div>
            </div>
          </div>

          {/* User Distribution & Departments */}
          <div className="dashboard-panels-grid">
            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <Users size={18} /> Role Distribution
                </h4>
              </div>
              <div className="panel-body">
                <div className="role-distribution-list">
                  <div className="role-stat-item">
                    <span>System Administrators</span>
                    <span className="role-badge admin">{(data as AdminDashboardData).users.byRole.SYSTEM_ADMIN}</span>
                  </div>
                  <div className="role-stat-item">
                    <span>Heads of Department</span>
                    <span className="role-badge hod">{(data as AdminDashboardData).users.byRole.HOD}</span>
                  </div>
                  <div className="role-stat-item">
                    <span>Professors</span>
                    <span className="role-badge prof">{(data as AdminDashboardData).users.byRole.PROFESSOR}</span>
                  </div>
                  <div className="role-stat-item">
                    <span>Assistant Professors</span>
                    <span className="role-badge asst">{(data as AdminDashboardData).users.byRole.ASSISTANT_PROFESSOR}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <Building size={18} /> Academic Departments
                </h4>
              </div>
              <div className="panel-body">
                <div className="dept-faculty-counts-list">
                  {(data as AdminDashboardData).departments.map(dept => (
                    <div key={dept.id} className="dept-count-item">
                      <div>
                        <strong>{dept.name}</strong>
                        <span className="code-badge">{dept.code}</span>
                      </div>
                      <span className="faculty-badge">{dept.facultyCount} Faculty</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Audit Logs */}
          <div className="dashboard-panel">
            <div className="panel-header">
              <h4>
                <Activity size={18} /> Recent Security Audit Events
              </h4>
            </div>
            <div className="panel-body">
              <div className="audit-log-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Target Type</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data as AdminDashboardData).recentAuditLogs.map(log => (
                      <tr key={log.id}>
                        <td>
                          <code className="action-code">{log.action}</code>
                        </td>
                        <td>{log.actorName}</td>
                        <td>{log.targetType}</td>
                        <td className="time-col">{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. HOD DASHBOARD */}
      {data.role === 'HOD' && (
        <div className="dashboard-layout">
          {/* Top Metric Cards */}
          <div className="metric-cards-grid">
            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Total Tasks</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                  <CheckSquare size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as HodDashboardData).taskMetrics.total}</div>
              <div className="metric-subtext">
                {(data as HodDashboardData).taskMetrics.pending} Pending • {(data as HodDashboardData).taskMetrics.inProgress} In Progress
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Overdue Deadlines</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div className="metric-number" style={{ color: (data as HodDashboardData).taskMetrics.overdue > 0 ? '#f87171' : 'inherit' }}>
                {(data as HodDashboardData).taskMetrics.overdue}
              </div>
              <div className="metric-subtext">Requires attention</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Upcoming (7 Days)</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                  <Calendar size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as HodDashboardData).taskMetrics.upcoming}</div>
              <div className="metric-subtext">Approaching due dates</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Syllabus Completion</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                  <BookOpen size={20} />
                </div>
              </div>
              <div className="metric-number">
                {(data as HodDashboardData).syllabusOverview.averageCompletionPercentage}%
              </div>
              <div className="metric-subtext">
                {(data as HodDashboardData).syllabusOverview.totalCourses} Active Courses
              </div>
            </div>
          </div>

          {/* Department Faculty Workload Distribution Table */}
          <div className="dashboard-panel">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4>
                <Users size={18} /> Department Faculty Workload Distribution
              </h4>
              {onNavigateTab && (
                <button className="card-action-btn" onClick={() => onNavigateTab('tasks')}>
                  Manage Tasks
                </button>
              )}
            </div>
            <div className="panel-body">
              <div className="table-responsive">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Faculty Member</th>
                      <th>Role</th>
                      <th>Pending</th>
                      <th>In Progress</th>
                      <th>Completed</th>
                      <th>Overdue</th>
                      <th>Total Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data as HodDashboardData).facultyWorkload.map(faculty => (
                      <tr key={faculty.facultyId}>
                        <td>
                          <strong>{faculty.fullName}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{faculty.email}</div>
                        </td>
                        <td>
                          <span className={`role-badge ${faculty.role.toLowerCase().slice(0, 4)}`}>
                            {faculty.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td>{faculty.pendingTasks}</td>
                        <td>{faculty.inProgressTasks}</td>
                        <td style={{ color: '#34d399' }}>{faculty.completedTasks}</td>
                        <td style={{ color: faculty.overdueTasks > 0 ? '#f87171' : 'inherit', fontWeight: faculty.overdueTasks > 0 ? 700 : 'normal' }}>
                          {faculty.overdueTasks}
                        </td>
                        <td>
                          <strong>{faculty.totalTasks}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Task Breakdown & Syllabus Panels */}
          <div className="dashboard-panels-grid">
            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <TrendingUp size={18} /> Priority Overview
                </h4>
              </div>
              <div className="panel-body">
                <div>
                  <div className="section-small-title">By Priority</div>
                  <div className="breakdown-pills">
                    {Object.entries((data as HodDashboardData).taskMetrics.byPriority).map(([pri, count]) => (
                      <div key={pri} className={`breakdown-pill priority-${pri.toLowerCase()}`}>
                        <span className="pill-label">{pri}</span>
                        <span className="pill-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <Send size={18} /> Department Continuity & Handovers
                </h4>
              </div>
              <div className="panel-body">
                <div className="overview-stats-box">
                  <div className="stat-row">
                    <span>Pending Handovers Awaiting Acceptance:</span>
                    <strong>{(data as HodDashboardData).handoversCount.pending}</strong>
                  </div>
                  <div className="stat-row">
                    <span>Total Handover Records:</span>
                    <strong>{(data as HodDashboardData).handoversCount.total}</strong>
                  </div>
                </div>
                {onNavigateTab && (
                  <button
                    className="submit-btn"
                    style={{ marginTop: '1rem', width: '100%' }}
                    onClick={() => onNavigateTab('handovers')}
                  >
                    View All Handovers
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. PROFESSOR DASHBOARD */}
      {data.role === 'PROFESSOR' && (
        <div className="dashboard-layout">
          {/* Top Metric Cards */}
          <div className="metric-cards-grid">
            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Tasks Assigned to Me</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                  <CheckSquare size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as ProfessorDashboardData).assignedTasks.total}</div>
              <div className="metric-subtext">
                {(data as ProfessorDashboardData).assignedTasks.pending} Pending • {(data as ProfessorDashboardData).assignedTasks.inProgress} In Progress
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Tasks Delegated</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  <Send size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as ProfessorDashboardData).createdTasks.total}</div>
              <div className="metric-subtext">Created by you</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Overdue Deadlines</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div className="metric-number" style={{ color: (data as ProfessorDashboardData).assignedTasks.overdue > 0 ? '#f87171' : 'inherit' }}>
                {(data as ProfessorDashboardData).assignedTasks.overdue}
              </div>
              <div className="metric-subtext">Immediate action required</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Courses Taught</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                  <BookOpen size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as ProfessorDashboardData).assignedSyllabuses.length}</div>
              <div className="metric-subtext">Active syllabus modules</div>
            </div>
          </div>

          {/* Upcoming Deadlines & Assigned Courses */}
          <div className="dashboard-panels-grid">
            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <Clock size={18} /> Upcoming Task Deadlines
                </h4>
              </div>
              <div className="panel-body">
                {(data as ProfessorDashboardData).upcomingDeadlines.length === 0 ? (
                  <div className="empty-subpanel">No upcoming task deadlines.</div>
                ) : (
                  <div className="upcoming-tasks-list">
                    {(data as ProfessorDashboardData).upcomingDeadlines.map(task => (
                      <div key={task.id} className="upcoming-task-item">
                        <div>
                          <strong>{task.title}</strong>
                          <div className="task-subtext">
                            <span className={`priority-tag ${task.priority.toLowerCase()}`}>{task.priority}</span>
                          </div>
                        </div>
                        <div className="deadline-badge">
                          <Calendar size={12} /> {task.dueDate}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <BookOpen size={18} /> Assigned Course Syllabuses
                </h4>
              </div>
              <div className="panel-body">
                {(data as ProfessorDashboardData).assignedSyllabuses.length === 0 ? (
                  <div className="empty-subpanel">No courses currently assigned.</div>
                ) : (
                  <div className="assigned-syllabus-list">
                    {(data as ProfessorDashboardData).assignedSyllabuses.map(syl => (
                      <div key={syl.id} className="assigned-syl-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <strong>{syl.courseCode}: {syl.courseName}</strong>
                          <span className="pct-text">{syl.completionPercentage}%</span>
                        </div>
                        <div className="progress-bar-wrap">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${Math.min(syl.completionPercentage, 100)}%` }}
                          />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                          {syl.semester} • Status: {syl.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. ASSISTANT PROFESSOR DASHBOARD */}
      {data.role === 'ASSISTANT_PROFESSOR' && (
        <div className="dashboard-layout">
          {/* Top Metric Cards */}
          <div className="metric-cards-grid">
            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Assigned Tasks</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                  <CheckSquare size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as AssistantProfessorDashboardData).assignedTasks.total}</div>
              <div className="metric-subtext">
                {(data as AssistantProfessorDashboardData).assignedTasks.pending} Pending • {(data as AssistantProfessorDashboardData).assignedTasks.inProgress} In Progress
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Overdue Tasks</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div className="metric-number" style={{ color: (data as AssistantProfessorDashboardData).assignedTasks.overdue > 0 ? '#f87171' : 'inherit' }}>
                {(data as AssistantProfessorDashboardData).assignedTasks.overdue}
              </div>
              <div className="metric-subtext">Attention needed</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Upcoming Deadlines</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                  <Calendar size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as AssistantProfessorDashboardData).assignedTasks.upcoming}</div>
              <div className="metric-subtext">Due within 7 days</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Pending Handovers</span>
                <div className="metric-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                  <Send size={20} />
                </div>
              </div>
              <div className="metric-number">{(data as AssistantProfessorDashboardData).pendingHandoversToRespond}</div>
              <div className="metric-subtext">Awaiting your response</div>
            </div>
          </div>

          {/* Upcoming Deadlines & Syllabuses */}
          <div className="dashboard-panels-grid">
            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <Clock size={18} /> My Upcoming Deadlines
                </h4>
              </div>
              <div className="panel-body">
                {(data as AssistantProfessorDashboardData).upcomingDeadlines.length === 0 ? (
                  <div className="empty-subpanel">No upcoming task deadlines.</div>
                ) : (
                  <div className="upcoming-tasks-list">
                    {(data as AssistantProfessorDashboardData).upcomingDeadlines.map(task => (
                      <div key={task.id} className="upcoming-task-item">
                        <div>
                          <strong>{task.title}</strong>
                          <div className="task-subtext">
                            <span className={`priority-tag ${task.priority.toLowerCase()}`}>{task.priority}</span>
                          </div>
                        </div>
                        <div className="deadline-badge">
                          <Calendar size={12} /> {task.dueDate}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-panel">
              <div className="panel-header">
                <h4>
                  <BookOpen size={18} /> Courses & Syllabus Progress
                </h4>
              </div>
              <div className="panel-body">
                {(data as AssistantProfessorDashboardData).assignedSyllabuses.length === 0 ? (
                  <div className="empty-subpanel">No course syllabuses currently assigned.</div>
                ) : (
                  <div className="assigned-syllabus-list">
                    {(data as AssistantProfessorDashboardData).assignedSyllabuses.map(syl => (
                      <div key={syl.id} className="assigned-syl-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                          <strong>{syl.courseCode}: {syl.courseName}</strong>
                          <span className="pct-text">{syl.completionPercentage}%</span>
                        </div>
                        <div className="progress-bar-wrap">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${Math.min(syl.completionPercentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
