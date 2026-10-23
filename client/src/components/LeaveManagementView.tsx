import React, { useState, useEffect, useId } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  DepartmentLeaveMetrics,
  LeaveStatus,
} from '../types/leave';
import {
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
  FileText,
  User,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';

export function formatIndianDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const cleanStr = typeof dateStr === 'string' ? dateStr.slice(0, 10) : dateStr.toISOString().slice(0, 10);
  const parts = cleanStr.split('-');
  if (parts.length !== 3) return String(dateStr);
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day)) return String(dateStr);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

export const LeaveManagementView: React.FC = () => {
  const { user } = useAuth();

  // Data state
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [metrics, setMetrics] = useState<DepartmentLeaveMetrics | null>(null);

  // UI state
  const [activeSubTab, setActiveSubTab] = useState<'my-leaves' | 'approvals'>('my-leaves');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Apply Modal state
  const [isApplyModalOpen, setIsApplyModalOpen] = useState<boolean>(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number>(0);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isHalfDay, setIsHalfDay] = useState<boolean>(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<'First Half' | 'Second Half'>('First Half');
  const [reason, setReason] = useState<string>('');
  const [calculatedDays, setCalculatedDays] = useState<number | null>(null);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);

  // Decision Modal state
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    request: LeaveRequest | null;
    action: 'Approved' | 'Rejected';
    notes: string;
  }>({
    isOpen: false,
    request: null,
    action: 'Approved',
    notes: '',
  });

  // Cancel Confirmation state
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    requestId: number | null;
    notes: string;
  }>({
    isOpen: false,
    requestId: null,
    notes: '',
  });

  const openApplyModal = () => {
    setApplyError(null);
    setError(null);
    if ((selectedTypeId === 0 || !selectedTypeId) && leaveTypes.length > 0) {
      setSelectedTypeId(leaveTypes[0].id);
    }
    setIsApplyModalOpen(true);
  };

  const isHOD = user?.role === 'HOD';
  const canApplyForLeave =
    user?.role !== 'SYSTEM_ADMIN' &&
    (!!user?.departmentId ||
      user?.role === 'HOD' ||
      user?.role === 'PROFESSOR' ||
      user?.role === 'ASSISTANT_PROFESSOR');

  const formIds = {
    applyModal: useId(),
    leaveType: useId(),
    halfDay: useId(),
    halfDayPeriod: useId(),
    startDate: useId(),
    endDate: useId(),
    reason: useId(),
    decisionNotes: useId(),
    cancelNotes: useId(),
  };

  const getAuthHeaders = (): Record<string, string> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const token = window.localStorage.getItem('token');
        if (token) return { Authorization: `Bearer ${token}` };
      }
    } catch {
      // Ignore storage access error
    }
    return {};
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();

      // 1. Fetch Types & Balances
      const [typesRes, balRes, myRes] = await Promise.all([
        fetch('/api/leaves/types', { headers, credentials: 'include' }),
        fetch('/api/leaves/balances', { headers, credentials: 'include' }),
        fetch(`/api/leaves/my${statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''}`, { headers, credentials: 'include' }),
      ]);

      const typesData = await typesRes.json();
      const balData = await balRes.json();
      const myData = await myRes.json();

      if (typesData.success) {
        setLeaveTypes(typesData.data);
        if (typesData.data.length > 0 && selectedTypeId === 0) {
          setSelectedTypeId(typesData.data[0].id);
        }
      }
      if (balData.success) setBalances(balData.data);
      if (myData.success) setMyRequests(myData.data);

      // 2. If HOD, fetch pending approvals & department summary
      if (isHOD) {
        const [appRes, summaryRes] = await Promise.all([
          fetch('/api/leaves/approvals', { headers, credentials: 'include' }),
          fetch('/api/leaves/department-summary', { headers, credentials: 'include' }),
        ]);

        const appData = await appRes.json();
        const summaryData = await summaryRes.json();

        if (appData.success) setApprovals(appData.data);
        if (summaryData.success && summaryData.data.metrics) {
          setMetrics(summaryData.data.metrics);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load leave records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  // Recalculate duration when dates or half-day options change
  useEffect(() => {
    if (!startDate || (!isHalfDay && !endDate)) {
      setCalculatedDays(null);
      return;
    }

    const effectiveEnd = isHalfDay ? startDate : endDate;
    if (new Date(startDate) > new Date(effectiveEnd)) {
      setCalculatedDays(null);
      return;
    }

    const fetchCalc = async () => {
      setCalcLoading(true);
      try {
        const query = new URLSearchParams({
          startDate,
          endDate: effectiveEnd,
          isHalfDay: isHalfDay ? 'true' : 'false',
        });
        const res = await fetch(`/api/leaves/calculate?${query.toString()}`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        const data = await res.json();
        if (data.success) {
          setCalculatedDays(data.data.daysCount);
        }
      } catch {
        // Fallback calculation excluding Sundays
        setCalculatedDays(null);
      } finally {
        setCalcLoading(false);
      }
    };

    fetchCalc();
  }, [startDate, endDate, isHalfDay]);

  // Handle Submit Leave Request
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplyError(null);
    setError(null);
    setSuccessMessage(null);

    const effectiveTypeId = selectedTypeId || (leaveTypes.length > 0 ? leaveTypes[0].id : 0);
    if (!effectiveTypeId) {
      setApplyError('Please select a valid leave type.');
      return;
    }
    if (!startDate) {
      setApplyError('Please select a start date.');
      return;
    }
    if (!isHalfDay && !endDate) {
      setApplyError('Please select an end date.');
      return;
    }
    if (!isHalfDay && new Date(endDate) < new Date(startDate)) {
      setApplyError('End date cannot precede start date.');
      return;
    }
    if (reason.trim().length < 5) {
      setApplyError('Please provide a reason of at least 5 characters.');
      return;
    }

    setActionLoading(true);

    try {
      const payload = {
        leaveTypeId: effectiveTypeId,
        startDate,
        endDate: isHalfDay ? startDate : endDate,
        isHalfDay,
        halfDayPeriod: isHalfDay ? halfDayPeriod : null,
        reason: reason.trim(),
      };

      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to submit leave request');
      }

      setSuccessMessage('Your leave request has been submitted successfully.');
      setIsApplyModalOpen(false);
      setApplyError(null);
      setReason('');
      setStartDate('');
      setEndDate('');
      setIsHalfDay(false);
      fetchData();
    } catch (err: any) {
      setApplyError(err.message || 'Failed to submit leave request');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle HOD Decision (Approve / Reject)
  const handleDecision = async () => {
    if (!decisionModal.request) return;
    setActionLoading(true);
    setDecisionError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/leaves/${decisionModal.request.id}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({
          status: decisionModal.action,
          decisionNotes: decisionModal.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to submit decision');
      }

      setSuccessMessage(`Leave request successfully marked as ${decisionModal.action}.`);
      setDecisionModal({ isOpen: false, request: null, action: 'Approved', notes: '' });
      setDecisionError(null);
      fetchData();
    } catch (err: any) {
      setDecisionError(err.message || 'Failed to submit decision');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Requester Cancellation
  const handleCancelRequest = async () => {
    if (!cancelModal.requestId) return;
    setActionLoading(true);
    setCancelError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/leaves/${cancelModal.requestId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ notes: cancelModal.notes }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to cancel leave request');
      }

      setSuccessMessage('Leave request cancelled successfully. Any reserved balances have been restored.');
      setCancelModal({ isOpen: false, requestId: null, notes: '' });
      setCancelError(null);
      fetchData();
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel leave request');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={13} /> Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <XCircle size={13} /> Rejected
          </span>
        );
      case 'Cancelled':
        return (
          <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <X size={13} /> Cancelled
          </span>
        );
      case 'Pending':
      default:
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={13} /> Pending Decision
          </span>
        );
    }
  };

  return (
    <div className="view-container" id="leave-management-view">
      {/* View Header */}
      <div className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Calendar className="text-primary" size={28} />
            <span>Faculty Leave Management</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>
            Track institutional leave balances, request entitlements, and coordinate departmental approvals.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            id="btn-refresh-leaves"
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
            title="Refresh Leave Data"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {canApplyForLeave && (
            <button
              id="btn-apply-leave"
              data-testid="apply-leave-btn"
              className="btn btn-primary"
              onClick={openApplyModal}
              title="Apply for institutional faculty leave"
            >
              <Plus size={16} />
              <span>Apply for Leave</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications / Feedback */}
      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <AlertTriangle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn-icon" onClick={() => setError(null)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <CheckCircle2 size={18} />
          <span style={{ flex: 1 }}>{successMessage}</span>
          <button className="btn-icon" onClick={() => setSuccessMessage(null)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. Leave Balance Cards */}
      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={16} /> Leave Balances (Academic Year 2026-2027)
        </h3>

        <div className="balance-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          {balances.map(bal => {
            const isPaid = bal.is_paid;
            const pctUsed = bal.entitled_days > 0 ? Math.min(100, Math.round(((bal.used_days + bal.pending_days) / bal.entitled_days) * 100)) : 0;

            return (
              <div
                key={bal.leave_type_id}
                className="card"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{bal.leave_type_name}</h4>
                    <span style={{ fontSize: '0.75rem', color: isPaid ? 'var(--text-secondary)' : '#f59e0b', fontWeight: 500 }}>
                      {isPaid ? 'PAID ENTITLEMENT' : 'LEAVE WITHOUT PAY (LWP)'}
                    </span>
                  </div>
                  <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', fontWeight: 700 }}>
                    {bal.leave_type_code}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: bal.available_days > 0 || !isPaid ? 'var(--text-primary)' : 'var(--danger)' }}>
                    {isPaid ? bal.available_days.toFixed(1) : '∞'}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {isPaid ? 'Days Available' : 'Days (Configurable)'}
                  </span>
                </div>

                {isPaid && (
                  <div style={{ width: '100%', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pctUsed}%`,
                        background: pctUsed > 85 ? 'var(--danger)' : 'var(--primary)',
                        height: '100%',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {isPaid ? (
                    <>
                      <span>Entitled: <strong>{bal.entitled_days}</strong></span>
                      <span>Used: <strong>{bal.used_days}</strong></span>
                      <span>Pending: <strong>{bal.pending_days}</strong></span>
                    </>
                  ) : (
                    <span>Policy: Unpaid leave does not reduce paid allowances.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. HOD Department Metrics Bar (if HOD) */}
      {isHOD && metrics && (
        <section style={{ marginBottom: '2rem', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Department Oversight Metrics
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Active Department: <strong>{user?.departmentCode || 'CS'}</strong>
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Awaiting Approval</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{metrics.pending_count}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Approved This Academic Year</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{metrics.approved_count}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rejected Requests</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{metrics.rejected_count}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>On Leave Today</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38bdf8' }}>{metrics.active_today_count}</div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Section Navigation Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            id="tab-my-leaves"
            className={`btn ${activeSubTab === 'my-leaves' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '20px', padding: '0.4rem 1.25rem', fontSize: '0.9rem' }}
            onClick={() => setActiveSubTab('my-leaves')}
          >
            My Leave History ({myRequests.length})
          </button>

          {isHOD && (
            <button
              id="tab-approvals-queue"
              className={`btn ${activeSubTab === 'approvals' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '20px', padding: '0.4rem 1.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => setActiveSubTab('approvals')}
            >
              Approval Queue
              {approvals.length > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '0.1rem 0.5rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {approvals.length}
                </span>
              )}
            </button>
          )}
        </div>

        {activeSubTab === 'my-leaves' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Filter Status:</span>
            <select
              id="select-status-filter"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="form-control"
              style={{ width: 'auto', padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>

      {/* 4. Tab 1: My Leave History */}
      {activeSubTab === 'my-leaves' && (
        <section>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '0.75rem' }} />
              <div>Loading leave records...</div>
            </div>
          ) : myRequests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <FileText size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>No Leave Requests Found</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>You have not submitted any leave requests matching the current filter.</p>
              {canApplyForLeave && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '1.25rem' }}
                  onClick={openApplyModal}
                  data-testid="apply-leave-empty-btn"
                >
                  <Plus size={16} /> Apply for Leave
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date Range</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Duration</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Reason</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Decision Details</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map(req => {
                    const isEligibleForCancel = req.status === 'Pending' || req.status === 'Approved';

                    return (
                      <tr
                        key={req.id}
                        style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '0.9rem' }}
                        id={`leave-row-${req.id}`}
                      >
                        <td style={{ padding: '1rem', fontWeight: 600 }}>
                          <div>{req.leave_type_name}</div>
                          <span style={{ fontSize: '0.75rem', color: req.is_paid ? 'var(--text-secondary)' : '#f59e0b' }}>
                            {req.is_paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: 500 }}>
                            {req.start_date === req.end_date
                              ? formatIndianDate(req.start_date)
                              : `${formatIndianDate(req.start_date)} — ${formatIndianDate(req.end_date)}`}
                          </div>
                          {req.is_half_day && (
                            <span style={{ fontSize: '0.75rem', color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Clock size={11} /> Half-Day ({req.half_day_period})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '1rem', fontWeight: 700 }}>
                          {req.days_count} {req.days_count === 1 ? 'day' : 'days'}
                        </td>
                        <td style={{ padding: '1rem', maxWidth: '240px', color: 'var(--text-secondary)' }}>
                          <span title={req.reason}>
                            {req.reason.length > 55 ? `${req.reason.slice(0, 55)}...` : req.reason}
                          </span>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {getStatusBadge(req.status)}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                          {req.approver_name && (
                            <div>
                              Decided by: <strong>{req.approver_name}</strong>
                            </div>
                          )}
                          {req.decision_notes && (
                            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '0.2rem' }}>
                              "{req.decision_notes}"
                            </div>
                          )}
                          {!req.approver_name && !req.decision_notes && (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          {isEligibleForCancel && (
                            <button
                              id={`btn-cancel-leave-${req.id}`}
                              className="btn btn-secondary btn-sm"
                              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                              onClick={() => {
                                setCancelError(null);
                                setCancelModal({ isOpen: true, requestId: req.id, notes: '' });
                              }}
                              title="Cancel Leave Request"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 5. Tab 2: HOD Approval Queue (Visible to HOD only) */}
      {isHOD && activeSubTab === 'approvals' && (
        <section>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '0.75rem' }} />
              <div>Loading approval queue...</div>
            </div>
          ) : approvals.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={40} style={{ opacity: 0.3, marginBottom: '0.75rem', color: '#10b981' }} />
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>All Clear!</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                There are no pending leave requests awaiting your decision in Department {user?.departmentCode}.
              </p>
            </div>
          ) : (
            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Faculty Requester</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Leave Type</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Requested Dates</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Duration</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Reason / Notes</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Decision Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map(req => (
                    <tr
                      key={req.id}
                      style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '0.9rem' }}
                      id={`approval-row-${req.id}`}
                    >
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                            {req.requester_name ? req.requester_name.charAt(0) : <User size={16} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{req.requester_name}</div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {req.requester_role} • {req.requester_email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 600 }}>
                        <div>{req.leave_type_name}</div>
                        <span style={{ fontSize: '0.75rem', color: req.is_paid ? 'var(--text-secondary)' : '#f59e0b' }}>
                          {req.is_paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 500 }}>
                          {req.start_date === req.end_date
                            ? formatIndianDate(req.start_date)
                            : `${formatIndianDate(req.start_date)} — ${formatIndianDate(req.end_date)}`}
                        </div>
                        {req.is_half_day && (
                          <span style={{ fontSize: '0.75rem', color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={11} /> Half-Day ({req.half_day_period})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 700 }}>
                        {req.days_count} {req.days_count === 1 ? 'day' : 'days'}
                      </td>
                      <td style={{ padding: '1rem', maxWidth: '220px', color: 'var(--text-secondary)' }}>
                        <span title={req.reason}>
                          {req.reason.length > 50 ? `${req.reason.slice(0, 50)}...` : req.reason}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            id={`btn-approve-leave-${req.id}`}
                            className="btn btn-sm"
                            style={{ background: '#10b981', color: '#fff', border: 'none' }}
                            onClick={() => {
                              setDecisionError(null);
                              setDecisionModal({
                                isOpen: true,
                                request: req,
                                action: 'Approved',
                                notes: 'Approved. Department workload arranged.',
                              });
                            }}
                            title="Approve Leave"
                          >
                            <Check size={14} /> Approve
                          </button>

                          <button
                            id={`btn-reject-leave-${req.id}`}
                            className="btn btn-sm btn-secondary"
                            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            onClick={() => {
                              setDecisionError(null);
                              setDecisionModal({
                                isOpen: true,
                                request: req,
                                action: 'Rejected',
                                notes: '',
                              });
                            }}
                            title="Reject Leave"
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 6. Modal: Apply for Leave */}
      {isApplyModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', maxWidth: '540px', width: '100%', padding: '1.75rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar className="text-primary" size={20} /> Apply for Leave
              </h3>
              <button className="btn-icon" onClick={() => setIsApplyModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {applyError && (
              <div
                className="alert alert-danger"
                id="apply-modal-error"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{applyError}</span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setApplyError(null)}
                  title="Dismiss"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <form onSubmit={handleSubmitLeave} id={formIds.applyModal}>
              {/* Leave Type Selector */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor={formIds.leaveType} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Leave Type *
                </label>
                <select
                  id={formIds.leaveType}
                  value={selectedTypeId}
                  onChange={e => setSelectedTypeId(Number(e.target.value))}
                  className="form-control"
                  style={{ width: '100%' }}
                  required
                >
                  {leaveTypes.map(t => {
                    const bal = balances.find(b => b.leave_type_id === t.id);
                    const balStr = t.is_paid && bal ? ` (${bal.available_days} days available)` : ' (Unpaid)';
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name}{balStr}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Half-Day Checkbox */}
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id={formIds.halfDay}
                  checked={isHalfDay}
                  onChange={e => {
                    setIsHalfDay(e.target.checked);
                    if (e.target.checked && startDate) {
                      setEndDate(startDate);
                    }
                  }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor={formIds.halfDay} style={{ fontSize: '0.9rem', cursor: 'pointer', userSelect: 'none' }}>
                  Request as <strong>Half-Day Leave</strong> (0.5 Days)
                </label>
              </div>

              {/* Half-day period selector if checked */}
              {isHalfDay && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor={formIds.halfDayPeriod} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Half-Day Slot *
                  </label>
                  <select
                    id={formIds.halfDayPeriod}
                    value={halfDayPeriod}
                    onChange={e => setHalfDayPeriod(e.target.value as 'First Half' | 'Second Half')}
                    className="form-control"
                    style={{ width: '100%' }}
                  >
                    <option value="First Half">First Half (Morning Session)</option>
                    <option value="Second Half">Second Half (Afternoon Session)</option>
                  </select>
                </div>
              )}

              {/* Date Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: isHalfDay ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor={formIds.startDate} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    {isHalfDay ? 'Date *' : 'Start Date *'}
                  </label>
                  <input
                    type="date"
                    id={formIds.startDate}
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value);
                      if (isHalfDay) setEndDate(e.target.value);
                    }}
                    className="form-control"
                    style={{ width: '100%' }}
                    required
                  />
                  {startDate && (
                    <span style={{ fontSize: '0.75rem', color: '#818cf8', marginTop: '0.25rem', display: 'block' }}>
                      {formatIndianDate(startDate)}
                    </span>
                  )}
                </div>

                {!isHalfDay && (
                  <div className="form-group">
                    <label htmlFor={formIds.endDate} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      End Date *
                    </label>
                    <input
                      type="date"
                      id={formIds.endDate}
                      value={endDate}
                      min={startDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="form-control"
                      style={{ width: '100%' }}
                      required
                    />
                    {endDate && (
                      <span style={{ fontSize: '0.75rem', color: '#818cf8', marginTop: '0.25rem', display: 'block' }}>
                        {formatIndianDate(endDate)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Calculated Leave Duration Preview */}
              {calculatedDays !== null && (
                <div
                  style={{
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Clock size={16} className="text-primary" />
                  <span>
                    Computed Duration: <strong>{calculatedDays} working day(s)</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                      (Sundays excluded by institutional policy)
                    </span>
                  </span>
                </div>
              )}

              {/* Reason */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label htmlFor={formIds.reason} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Reason for Leave *
                </label>
                <textarea
                  id={formIds.reason}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', minHeight: '90px', resize: 'vertical' }}
                  placeholder="Provide brief academic, personal, or medical reason (min 5 characters)..."
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', textAlign: 'right', marginTop: '0.2rem' }}>
                  {reason.length} / 1000 characters
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsApplyModalOpen(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-submit-leave"
                  className="btn btn-primary"
                  disabled={actionLoading || calcLoading || !startDate || reason.trim().length < 5}
                >
                  {actionLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: HOD Decision Confirmation */}
      {decisionModal.isOpen && decisionModal.request && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.75rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {decisionModal.action === 'Approved' ? (
                <>
                  <CheckCircle2 size={20} style={{ color: '#10b981' }} /> Confirm Leave Approval
                </>
              ) : (
                <>
                  <XCircle size={20} style={{ color: '#ef4444' }} /> Confirm Leave Rejection
                </>
              )}
            </h3>

            {decisionError && (
              <div
                className="alert alert-danger"
                id="decision-modal-error"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{decisionError}</span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setDecisionError(null)}
                  title="Dismiss"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
              You are about to mark the leave request for <strong>{decisionModal.request.requester_name}</strong> ({decisionModal.request.days_count} days of {decisionModal.request.leave_type_name}) as <strong>{decisionModal.action}</strong>.
            </p>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label htmlFor={formIds.decisionNotes} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Decision Notes / Comments (Optional)
              </label>
              <textarea
                id={formIds.decisionNotes}
                value={decisionModal.notes}
                onChange={e => setDecisionModal({ ...decisionModal, notes: e.target.value })}
                className="form-control"
                style={{ width: '100%', minHeight: '80px' }}
                placeholder={decisionModal.action === 'Approved' ? 'e.g. Approved. Alternate class coverage verified.' : 'e.g. Inadequate staffing on scheduled day.'}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDecisionModal({ isOpen: false, request: null, action: 'Approved', notes: '' })}
                disabled={actionLoading}
              >
                Back
              </button>
              <button
                id="btn-confirm-decision"
                className="btn"
                style={{
                  background: decisionModal.action === 'Approved' ? '#10b981' : '#ef4444',
                  color: '#fff',
                  border: 'none',
                }}
                onClick={handleDecision}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : `Confirm ${decisionModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Cancellation Confirmation */}
      {cancelModal.isOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '16px', maxWidth: '440px', width: '100%', padding: '1.75rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.2rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={20} /> Cancel Leave Request
            </h3>

            {cancelError && (
              <div
                className="alert alert-danger"
                id="cancel-modal-error"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{cancelError}</span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setCancelError(null)}
                  title="Dismiss"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Are you sure you want to cancel this leave request? Any reserved or deducted leave balance will be restored automatically.
            </p>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label htmlFor={formIds.cancelNotes} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Cancellation Reason (Optional)
              </label>
              <input
                type="text"
                id={formIds.cancelNotes}
                value={cancelModal.notes}
                onChange={e => setCancelModal({ ...cancelModal, notes: e.target.value })}
                className="form-control"
                placeholder="Reason for cancellation..."
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setCancelModal({ isOpen: false, requestId: null, notes: '' })}
                disabled={actionLoading}
              >
                Keep Request
              </button>
              <button
                id="btn-confirm-cancel"
                className="btn btn-danger"
                onClick={handleCancelRequest}
                disabled={actionLoading}
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
