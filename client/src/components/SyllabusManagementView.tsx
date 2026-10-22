import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Syllabus, SyllabusStatus } from '../types/syllabus';
import {
  BookOpen,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  X,
  Trash2,
  Edit3,
  User,
  Calendar,
} from 'lucide-react';

export const SyllabusManagementView: React.FC = () => {
  const { user } = useAuth();
  const [syllabuses, setSyllabuses] = useState<Syllabus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [syllabusToProgress, setSyllabusToProgress] = useState<Syllabus | null>(null);
  const [progressUnits, setProgressUnits] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<SyllabusStatus>('In Progress');

  // Create Form State
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newAcademicYear, setNewAcademicYear] = useState('2026-2027');
  const [newSemester, setNewSemester] = useState('Semester 5');
  const [newTotalUnits, setNewTotalUnits] = useState(5);
  const [newFacultyId, setNewFacultyId] = useState<string>('');
  const [facultyList, setFacultyList] = useState<Array<{ id: number; fullName: string; role: string }>>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const canCreate = user?.role === 'HOD' || user?.role === 'PROFESSOR';

  const fetchSyllabuses = useCallback(async () => {
    if (!user?.departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);

      const res = await fetch(`/api/syllabus?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch syllabus records');
      setSyllabuses(data.syllabuses || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading syllabus');
    } finally {
      setLoading(false);
    }
  }, [user?.departmentId, statusFilter, searchTerm]);

  useEffect(() => {
    fetchSyllabuses();
  }, [fetchSyllabuses]);

  // Load faculty list for assignment modal
  useEffect(() => {
    if (!showCreateModal || !user?.departmentId) return;
    async function loadFaculty() {
      try {
        const res = await fetch('/api/users', { credentials: 'include' });
        const data = await res.json();
        if (res.ok && data.users) {
          // Filter to same department
          const deptFaculty = data.users.filter(
            (u: any) => u.departmentId === user?.departmentId && u.isActive
          );
          setFacultyList(deptFaculty);
          if (deptFaculty.length > 0 && !newFacultyId) {
            setNewFacultyId(String(deptFaculty[0].id));
          }
        }
      } catch {
        // Fallback
      }
    }
    loadFaculty();
  }, [showCreateModal, user?.departmentId, newFacultyId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          courseCode: newCourseCode.trim(),
          courseName: newCourseName.trim(),
          academicYear: newAcademicYear,
          semester: newSemester,
          totalUnits: Number(newTotalUnits),
          facultyId: newFacultyId ? Number(newFacultyId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create syllabus');

      setSuccess(`Course syllabus for ${data.syllabus.courseCode} created successfully.`);
      setShowCreateModal(false);
      setNewCourseCode('');
      setNewCourseName('');
      fetchSyllabuses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating syllabus');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syllabusToProgress) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/syllabus/${syllabusToProgress.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          completedUnits: progressUnits,
          status: progressStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update progress');

      setSuccess(`Progress updated for ${data.syllabus.courseCode}: ${data.syllabus.completionPercentage}% completed.`);
      setSyllabusToProgress(null);
      fetchSyllabuses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating progress');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, code: string) => {
    if (!window.confirm(`Are you sure you want to delete course syllabus ${code}?`)) return;
    try {
      const res = await fetch(`/api/syllabus/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to delete syllabus');

      setSuccess(`Syllabus ${code} deleted.`);
      fetchSyllabuses();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error deleting syllabus');
    }
  };

  if (!user?.departmentId) {
    return (
      <div className="empty-state-box">
        <p>System Administrators manage infrastructure and do not have departmental course syllabuses.</p>
      </div>
    );
  }

  // Summary counts
  const totalCourses = syllabuses.length;
  const inProgressCount = syllabuses.filter(s => s.status === 'In Progress').length;
  const completedCount = syllabuses.filter(s => s.status === 'Completed').length;
  const avgCompletion =
    totalCourses > 0
      ? (syllabuses.reduce((acc, s) => acc + s.completionPercentage, 0) / totalCourses).toFixed(1)
      : '0.0';

  return (
    <div className="syllabus-container" id="syllabus-view-section">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h3>Department Course Syllabuses & Progress Tracking</h3>
          <p>
            Curriculum unit coverage, instructor assignments, and completion progress for {user.departmentName}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="refresh-btn" onClick={fetchSyllabuses} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {canCreate && (
            <button
              id="btn-add-syllabus"
              className="submit-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} />
              <span>Add Course Syllabus</span>
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
            <BookOpen size={20} />
          </div>
          <div>
            <div className="summary-stat">{totalCourses}</div>
            <div className="summary-label">Total Courses</div>
          </div>
        </div>

        <div className="task-summary-card in-progress">
          <div className="summary-icon-wrap">
            <Clock size={20} />
          </div>
          <div>
            <div className="summary-stat">{inProgressCount}</div>
            <div className="summary-label">In Progress</div>
          </div>
        </div>

        <div className="task-summary-card completed">
          <div className="summary-icon-wrap">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="summary-stat">{completedCount}</div>
            <div className="summary-label">Fully Completed</div>
          </div>
        </div>

        <div className="task-summary-card total">
          <div className="summary-icon-wrap">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="summary-stat">{avgCompletion}%</div>
            <div className="summary-label">Avg Completion</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="task-controls-bar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by course code or title..."
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
            <option value="Draft">Draft</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Syllabuses Grid */}
      {loading && !syllabuses.length ? (
        <div className="empty-state-box">Loading department syllabuses...</div>
      ) : syllabuses.length === 0 ? (
        <div className="empty-state-box">
          <BookOpen size={36} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
          <h4>No Course Syllabuses Found</h4>
          <p>There are no courses matching your search in {user.departmentName}.</p>
        </div>
      ) : (
        <div className="syllabus-grid">
          {syllabuses.map(syl => {
            const isAssigned = syl.faculty?.id === user.id;
            const isHOD = user.role === 'HOD';
            const canUpdateProgress = isAssigned || isHOD;

            return (
              <div key={syl.id} className="syllabus-card">
                <div className="syl-card-header">
                  <span className="course-code-badge">{syl.courseCode}</span>
                  <span className={`status-badge ${syl.status.toLowerCase().replace(' ', '-')}`}>
                    {syl.status}
                  </span>
                </div>

                <h4 className="syl-card-title">{syl.courseName}</h4>

                <div className="syl-card-meta">
                  <div className="meta-item">
                    <Calendar size={13} /> {syl.semester} • {syl.academicYear}
                  </div>
                  <div className="meta-item">
                    <User size={13} /> Instructor:{' '}
                    <strong>{syl.faculty ? syl.faculty.fullName : 'Unassigned'}</strong>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="syl-progress-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                    <span>
                      Units: <strong>{syl.completedUnits} / {syl.totalUnits}</strong>
                    </span>
                    <span style={{ fontWeight: 600, color: syl.completionPercentage >= 100 ? '#34d399' : '#818cf8' }}>
                      {syl.completionPercentage}%
                    </span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(syl.completionPercentage, 100)}%`,
                        background: syl.completionPercentage >= 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : undefined,
                      }}
                    />
                  </div>
                </div>

                {/* Units List */}
                {syl.units && syl.units.length > 0 && (
                  <div className="syl-units-mini-list">
                    {syl.units.slice(0, 3).map(u => (
                      <div key={u.unitNumber} className="syl-unit-pill">
                        <span>Unit {u.unitNumber}: {u.title}</span>
                        <span className={`unit-status-tag ${u.status.toLowerCase()}`}>{u.status}</span>
                      </div>
                    ))}
                    {syl.units.length > 3 && (
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                        +{syl.units.length - 3} more units
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="syl-card-actions">
                  {canUpdateProgress && (
                    <button
                      className="card-action-btn"
                      onClick={() => {
                        setSyllabusToProgress(syl);
                        setProgressUnits(syl.completedUnits);
                        setProgressStatus(syl.status);
                      }}
                    >
                      <Edit3 size={14} />
                      <span>Update Progress</span>
                    </button>
                  )}

                  {isHOD && (
                    <button
                      className="card-action-btn delete"
                      onClick={() => handleDelete(syl.id, syl.courseCode)}
                      title="Delete Syllabus"
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

      {/* Create Syllabus Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h4>Add Course Syllabus</h4>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="new-course-code">Course Code *</label>
                  <input
                    id="new-course-code"
                    className="form-input"
                    type="text"
                    required
                    placeholder="e.g. CS301"
                    value={newCourseCode}
                    onChange={e => setNewCourseCode(e.target.value.toUpperCase())}
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="new-course-name">Course Name *</label>
                  <input
                    id="new-course-name"
                    className="form-input"
                    type="text"
                    required
                    placeholder="e.g. Operating Systems & System Programming"
                    value={newCourseName}
                    onChange={e => setNewCourseName(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="new-academic-year">Academic Year *</label>
                    <input
                      id="new-academic-year"
                      className="form-input"
                      type="text"
                      required
                      placeholder="2026-2027"
                      value={newAcademicYear}
                      onChange={e => setNewAcademicYear(e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="new-semester">Semester *</label>
                    <input
                      id="new-semester"
                      className="form-input"
                      type="text"
                      required
                      placeholder="Semester 5"
                      value={newSemester}
                      onChange={e => setNewSemester(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="new-total-units">Total Units (1-20) *</label>
                    <input
                      id="new-total-units"
                      className="form-input"
                      type="number"
                      min={1}
                      max={20}
                      required
                      value={newTotalUnits}
                      onChange={e => setNewTotalUnits(Number(e.target.value))}
                      disabled={submitting}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="new-faculty-id">Course Instructor</label>
                    <select
                      id="new-faculty-id"
                      className="form-select"
                      value={newFacultyId}
                      onChange={e => setNewFacultyId(e.target.value)}
                      disabled={submitting}
                    >
                      <option value="">-- Unassigned --</option>
                      {facultyList.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.fullName} ({f.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  </div>
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
                  {submitting ? 'Creating...' : 'Create Syllabus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Progress Modal */}
      {syllabusToProgress && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h4>Update Syllabus Progress: {syllabusToProgress.courseCode}</h4>
              <button className="modal-close-btn" onClick={() => setSyllabusToProgress(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProgressSubmit}>
              <div className="modal-body">
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {syllabusToProgress.courseName} • Total Units: {syllabusToProgress.totalUnits}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="progress-completed-units">
                    Completed Units (0 - {syllabusToProgress.totalUnits}) *
                  </label>
                  <input
                    id="progress-completed-units"
                    className="form-input"
                    type="number"
                    min={0}
                    max={syllabusToProgress.totalUnits}
                    required
                    value={progressUnits}
                    onChange={e => setProgressUnits(Number(e.target.value))}
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="progress-status-select">Status</label>
                  <select
                    id="progress-status-select"
                    className="form-select"
                    value={progressStatus}
                    onChange={e => setProgressStatus(e.target.value as SyllabusStatus)}
                    disabled={submitting}
                  >
                    <option value="Draft">Draft</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div style={{ padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem' }}>
                  Projected Completion:{' '}
                  <strong>
                    {((progressUnits / syllabusToProgress.totalUnits) * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="card-action-btn"
                  onClick={() => setSyllabusToProgress(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Progress'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
