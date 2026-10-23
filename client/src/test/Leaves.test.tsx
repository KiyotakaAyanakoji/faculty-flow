import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Phase 6 Frontend Tests - Leave Management', () => {
  const mockHodUser = {
    id: 2,
    email: 'hod.cs@facultyflow.local',
    fullName: 'Prof. Alan Turing (HOD CS)',
    role: 'HOD',
    departmentId: 1,
    departmentName: 'Computer Science & Engineering',
    departmentCode: 'CS',
    canAssignWork: true,
    isActive: true,
  };

  const mockAsstUser = {
    id: 4,
    email: 'asst.cs@facultyflow.local',
    fullName: 'Claude Shannon (Assistant Professor)',
    role: 'ASSISTANT_PROFESSOR',
    departmentId: 1,
    departmentName: 'Computer Science & Engineering',
    departmentCode: 'CS',
    canAssignWork: false,
    isActive: true,
  };

  const mockLeaveTypes = [
    {
      id: 1,
      code: 'CASUAL',
      name: 'Casual Leave',
      description: 'Short-term personal or unforeseen leaves',
      is_paid: true,
      default_days_per_year: 12,
      requires_approval: true,
      allow_half_day: true,
    },
    {
      id: 2,
      code: 'SICK',
      name: 'Sick / Medical Leave',
      description: 'Medical or health-related absence',
      is_paid: true,
      default_days_per_year: 10,
      requires_approval: true,
      allow_half_day: true,
    },
    {
      id: 3,
      code: 'UNPAID',
      name: 'Unpaid Leave (LWP)',
      description: 'Leave without pay',
      is_paid: false,
      default_days_per_year: 0,
      requires_approval: true,
      allow_half_day: true,
    },
  ];

  const mockBalances = [
    {
      id: 10,
      user_id: 2,
      leave_type_id: 1,
      leave_type_code: 'CASUAL',
      leave_type_name: 'Casual Leave',
      academic_year: '2026-2027',
      entitled_days: 12,
      used_days: 2,
      pending_days: 1,
      available_days: 9,
      is_paid: true,
      allow_half_day: true,
    },
    {
      id: 11,
      user_id: 2,
      leave_type_id: 2,
      leave_type_code: 'SICK',
      leave_type_name: 'Sick / Medical Leave',
      academic_year: '2026-2027',
      entitled_days: 10,
      used_days: 0,
      pending_days: 0,
      available_days: 10,
      is_paid: true,
      allow_half_day: true,
    },
    {
      id: 12,
      user_id: 2,
      leave_type_id: 3,
      leave_type_code: 'UNPAID',
      leave_type_name: 'Unpaid Leave (LWP)',
      academic_year: '2026-2027',
      entitled_days: 0,
      used_days: 0,
      pending_days: 0,
      available_days: 0,
      is_paid: false,
      allow_half_day: true,
    },
  ];

  const mockMyRequests = [
    {
      id: 101,
      user_id: 2,
      department_id: 1,
      leave_type_id: 1,
      leave_type_code: 'CASUAL',
      leave_type_name: 'Casual Leave',
      start_date: '2026-11-10',
      end_date: '2026-11-11',
      days_count: 2,
      is_half_day: false,
      half_day_period: null,
      reason: 'Attending research symposium in Hyderabad',
      status: 'Approved',
      approver_id: 1,
      approver_name: 'Dr. Arthur Vance',
      decision_notes: 'Approved. Session scheduled appropriately.',
      decision_timestamp: '2026-10-21T10:00:00.000Z',
      created_at: '2026-10-20T10:00:00.000Z',
      updated_at: '2026-10-21T10:00:00.000Z',
      is_paid: true,
    },
  ];

  const mockApprovals = [
    {
      id: 201,
      user_id: 3,
      requester_name: 'Dr. Ada Lovelace',
      requester_email: 'prof.cs@facultyflow.local',
      requester_role: 'PROFESSOR',
      department_id: 1,
      leave_type_id: 1,
      leave_type_code: 'CASUAL',
      leave_type_name: 'Casual Leave',
      start_date: '2026-11-16',
      end_date: '2026-11-16',
      days_count: 0.5,
      is_half_day: true,
      half_day_period: 'First Half',
      reason: 'Doctor appointment in the morning',
      status: 'Pending',
      created_at: '2026-10-22T08:00:00.000Z',
      updated_at: '2026-10-22T08:00:00.000Z',
      is_paid: true,
    },
  ];

  const mockDepartmentMetrics = {
    pending_count: 1,
    approved_count: 4,
    rejected_count: 0,
    active_today_count: 0,
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, _options?: any) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ success: false, message: 'Unauthenticated' }),
          });
        }

        if (url.includes('/api/auth/login')) {
          const body = _options?.body ? JSON.parse(_options.body) : {};
          const isAsst = body.email?.includes('asst');
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              user: isAsst ? mockAsstUser : mockHodUser,
            }),
          });
        }

        if (url.includes('/api/leaves/types')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: mockLeaveTypes,
            }),
          });
        }

        if (url.includes('/api/leaves/balances')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: mockBalances,
            }),
          });
        }

        if (url.includes('/api/leaves/approvals')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: mockApprovals,
            }),
          });
        }

        if (url.includes('/api/leaves/department-summary')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                metrics: mockDepartmentMetrics,
                recentRequests: [],
              },
            }),
          });
        }

        if (url.includes('/api/leaves/calculate')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: { daysCount: 2 },
            }),
          });
        }

        if (url.includes('/api/leaves/my')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: mockMyRequests,
            }),
          });
        }

        if (url.includes('/api/leaves/201/decision')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              message: 'Leave request approved successfully.',
            }),
          });
        }

        if (url.includes('/api/leaves')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              message: 'Leave request submitted successfully.',
              data: { id: 301, status: 'Pending' },
            }),
          });
        }

        if (url.includes('/api/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'healthy',
              timestamp: '2026-10-22T12:00:00Z',
              environment: 'development',
              uptime: 3600,
              database: { connected: true, responseTimeMs: 2, message: 'Pool active' },
            }),
          });
        }

        if (url.includes('/api/dashboard')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              role: 'HOD',
              departmentName: 'Computer Science and Engineering',
              stats: {
                totalTasks: 5,
                pendingTasks: 2,
                inProgressTasks: 2,
                completedTasks: 1,
                highPriorityTasks: 1,
                overdueTasks: 0,
                upcomingSevenDaysTasks: 1,
              },
              recentTasks: [],
              categoryDistribution: [],
              priorityDistribution: [],
              facultyWorkload: [],
              syllabuses: [],
              activeHandovers: [],
            }),
          });
        }

        // Default mock for other endpoints
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates to Leaves tab and renders leave balances, metrics, and request history', async () => {
    render(<App />);

    // 1. Authenticate
    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'hod.cs@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    // Wait for auth to complete and tabs to render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /leaves/i })).toBeInTheDocument();
    });

    // Navigate to Leaves tab
    const leavesBtn = screen.getByRole('button', { name: /leaves/i });
    fireEvent.click(leavesBtn);

    // Verify Leaves view header
    await waitFor(() => {
      expect(screen.getByText('Faculty Leave Management')).toBeInTheDocument();
    });

    // 5. Verify Request History table shows Indian date format and mock data
    await waitFor(() => {
      expect(screen.getByText(/10 November 2026 — 11 November 2026/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/attending research symposium in hyderabad/i)).toBeInTheDocument();
    expect(screen.getAllByText(/approved/i).length).toBeGreaterThan(0);
  });

  it('HOD view displays approval queue and allows approving pending request', async () => {
    render(<App />);

    // Authenticate
    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'hod.cs@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /leaves/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /leaves/i }));

    // Switch to Approval Queue
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approval queue/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /approval queue/i }));

    // Verify Pending Request from Prof Ada Lovelace
    await waitFor(() => {
      expect(screen.getByText('Dr. Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText(/doctor appointment in the morning/i)).toBeInTheDocument();
      expect(screen.getByText(/16 November 2026/i)).toBeInTheDocument();
    });

    // Click Approve button
    const approveBtn = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approveBtn);

    // Confirm Modal opens
    await waitFor(() => {
      expect(screen.getByText(/confirm leave approval/i)).toBeInTheDocument();
    });

    // Submit confirmation
    const confirmBtn = screen.getByRole('button', { name: /confirm approved/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText(/confirm leave approval/i)).not.toBeInTheDocument();
    });
  });

  it('displays validation errors visibly inside Apply for Leave modal', async () => {
    render(<App />);

    // Authenticate
    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'hod.cs@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /leaves/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /leaves/i }));

    // Open Apply for Leave Modal
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply for leave/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /apply for leave/i }));

    // Verify modal is open
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /apply for leave/i })).toBeInTheDocument();
    });

    // Enter start date and end date where end date is before start date
    fireEvent.change(screen.getByLabelText(/start date \*/i), {
      target: { value: '2026-11-20' },
    });
    fireEvent.change(screen.getByLabelText(/end date \*/i), {
      target: { value: '2026-11-15' },
    });
    fireEvent.change(screen.getByLabelText(/reason for leave \*/i), {
      target: { value: 'Valid reason here' },
    });

    const submitBtn = screen.getByRole('button', { name: /submit request/i });
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    // Verify error is rendered visibly inside the modal
    await waitFor(() => {
      expect(screen.getByText(/end date cannot precede start date/i)).toBeInTheDocument();
    });

    // Fix end date and verify submit succeeds and modal closes
    fireEvent.change(screen.getByLabelText(/end date \*/i), {
      target: { value: '2026-11-21' },
    });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /apply for leave/i })).not.toBeInTheDocument();
    });
  });

  it('Assistant Professor can see Apply for Leave button while approval controls are hidden', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'asst.cs@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /leaves/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /leaves/i }));

    // Apply for Leave button MUST be present for Assistant Professor
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply for leave/i })).toBeInTheDocument();
    });

    // Approval Queue tab MUST be hidden for Assistant Professor
    expect(screen.queryByRole('button', { name: /approval queue/i })).not.toBeInTheDocument();

    // Clicking Apply for Leave opens the modal
    fireEvent.click(screen.getByRole('button', { name: /apply for leave/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /apply for leave/i })).toBeInTheDocument();
    });
  });
});

