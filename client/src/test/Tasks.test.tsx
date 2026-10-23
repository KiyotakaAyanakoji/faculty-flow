import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Phase 3 Frontend Tests - Task Management & Allocation', () => {
  const mockHodUser = {
    id: 2,
    email: 'hod.cs@facultyflow.local',
    fullName: 'Dr. Sarah Connor (HOD CS)',
    role: 'HOD',
    departmentId: 1,
    departmentName: 'Computer Science and Engineering',
    departmentCode: 'CSE',
    canAssignWork: true,
    isActive: true,
  };

  const mockTasks = [
    {
      id: 101,
      title: 'Operating Systems Lab Grading',
      description: 'Grade Mid-Term practicals for Section A and Section B students.',
      category: 'Grading',
      priority: 'High',
      status: 'In Progress',
      dueDate: '2026-11-15',
      creatorId: 2,
      creator: { id: 2, fullName: 'Dr. Sarah Connor (HOD CS)', role: 'HOD' },
      assigneeId: 4,
      assignee: { id: 4, fullName: 'Dr. Miles Dyson (Asst Prof CSE)', role: 'ASSISTANT_PROFESSOR' },
      departmentId: 1,
      department: { id: 1, name: 'Computer Science and Engineering', code: 'CSE' },
      completedAt: null,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-21T11:00:00Z',
    },
    {
      id: 102,
      title: 'Curriculum Committee Meeting',
      description: 'Departmental meeting for updating AI syllabus.',
      category: 'Meetings',
      priority: 'Medium',
      status: 'Pending',
      dueDate: '2026-11-20',
      creatorId: 2,
      creator: { id: 2, fullName: 'Dr. Sarah Connor (HOD CS)', role: 'HOD' },
      assigneeId: 3,
      assignee: { id: 3, fullName: 'Dr. Kyle Reese (Prof CSE)', role: 'PROFESSOR' },
      departmentId: 1,
      department: { id: 1, name: 'Computer Science and Engineering', code: 'CSE' },
      completedAt: null,
      createdAt: '2026-10-20T10:30:00Z',
      updatedAt: '2026-10-20T10:30:00Z',
    },
  ];

  const mockSummary = {
    total: 2,
    pending: 1,
    inProgress: 1,
    completed: 0,
    highPriority: 1,
    byCategory: {
      Teaching: 0,
      Research: 0,
      Grading: 1,
      Meetings: 1,
      Administrative: 0,
    },
  };

  const mockEligibleAssignees = [
    {
      id: 4,
      fullName: 'Dr. Miles Dyson (Asst Prof CSE)',
      email: 'asst.cs@facultyflow.local',
      role: 'ASSISTANT_PROFESSOR',
      departmentCode: 'CSE',
      departmentName: 'Computer Science and Engineering',
      canAssignWork: false,
    },
  ];

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
          const body = JSON.parse(_options?.body || '{}');
          if (body.email === 'asst.cs@facultyflow.local') {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                success: true,
                user: {
                  id: 4,
                  email: 'asst.cs@facultyflow.local',
                  fullName: 'Dr. Miles Dyson (Asst Prof CSE)',
                  role: 'ASSISTANT_PROFESSOR',
                  departmentId: 1,
                  departmentName: 'Computer Science and Engineering',
                  departmentCode: 'CSE',
                  canAssignWork: false,
                  isActive: true,
                },
                accessToken: 'mock_jwt_asst_token',
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              user: mockHodUser,
              accessToken: 'mock_jwt_hod_token',
            }),
          });
        }

        if (url.includes('/api/tasks/summary')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, summary: mockSummary }),
          });
        }

        if (url.includes('/api/tasks/eligible-assignees')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, assignees: mockEligibleAssignees }),
          });
        }

        if (_options?.method === 'PATCH' && url.includes('/status')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              message: 'Task status updated to Completed.',
              task: {
                ...mockTasks[0],
                status: 'Completed',
                completedAt: '2026-10-23T12:00:00Z',
              },
            }),
          });
        }

        if (url.includes('/api/tasks')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              tasks: mockTasks,
              pagination: { total: 2, page: 1, limit: 20, totalPages: 1 },
            }),
          });
        }

        if (url.includes('/api/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'ok',
              service: 'Faculty Flow 2.0 API',
              timestamp: new Date().toISOString(),
              uptime: 42,
              environment: 'test',
              database: {
                status: 'connected',
                message: 'Database connection successful',
              },
            }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders Tasks tab in navigation for departmental faculty and displays task summary and cards', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    // Login as HOD
    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'hod.cs@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    // Wait for login
    await waitFor(() => {
      expect(screen.getAllByText(/Dr\. Sarah Connor/i)[0]).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tasks/i })).toBeInTheDocument();
    });

    // Navigate to Tasks tab
    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));

    // Verify task view header and cards
    await waitFor(() => {
      expect(screen.getByText(/Department Task Management & Workload/i)).toBeInTheDocument();
      expect(screen.getByText('Operating Systems Lab Grading')).toBeInTheDocument();
      expect(screen.getByText('Curriculum Committee Meeting')).toBeInTheDocument();
    });

    // Verify status badges and assignees
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dr\. Miles Dyson/i)[0]).toBeInTheDocument();

    // Verify Create Task button is visible for HOD
    expect(screen.getByRole('button', { name: /Assign New Task/i })).toBeInTheDocument();
  });

  it('opens Create Task modal and populates eligible assignees from API', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    // Login as HOD
    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'hod.cs@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tasks/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Assign New Task/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Assign New Task/i }));

    // Verify modal appeared
    await waitFor(() => {
      expect(screen.getByText('Assign New Departmental Task')).toBeInTheDocument();
      expect(screen.getByLabelText(/Task Title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Assignee/i)).toBeInTheDocument();
      // Verify Category selector is absent
      expect(screen.queryByLabelText(/Category/i)).not.toBeInTheDocument();
    });

    // Verify eligible assignee from API is present in dropdown
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Miles Dyson/i })).toBeInTheDocument();
    });
  });

  it('Batch 1: Category filter and category badges are removed from Task view', async () => {
    render(<App />);

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
      expect(screen.getByRole('button', { name: /Tasks/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));

    await waitFor(() => {
      expect(screen.getByText('Operating Systems Lab Grading')).toBeInTheDocument();
    });

    // Verify obsolete Category dropdown option does NOT exist
    expect(screen.queryByText('Category: All')).not.toBeInTheDocument();
    expect(screen.queryByText('RBAC Matrix')).not.toBeInTheDocument();
  });

  it('Batch 2: Complete Task button appears for assigned faculty and marks task completed', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    // Login as Assistant Professor (id: 4, who is assignee of Operating Systems Lab Grading)
    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'asst.cs@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tasks/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));

    // Verify task is loaded and Complete Task button is visible
    await waitFor(() => {
      expect(screen.getByText('Operating Systems Lab Grading')).toBeInTheDocument();
    });

    const completeBtn = screen.getByRole('button', { name: /Complete Task/i });
    expect(completeBtn).toBeInTheDocument();

    // Click Complete Task
    fireEvent.click(completeBtn);

    // Verify success banner appears
    await waitFor(() => {
      expect(screen.getByText(/Task status updated to Completed/i)).toBeInTheDocument();
    });
  });
});


