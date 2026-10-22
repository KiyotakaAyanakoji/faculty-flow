import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Phase 4 Frontend Tests - Faculty Work Handovers', () => {
  const mockHodUser = {
    id: 2,
    email: 'hod.cs@facultyflow.local',
    fullName: 'Dr. Sarah Connor (HOD CS)',
    role: 'HOD',
    departmentId: 1,
    departmentName: 'Computer Science and Engineering',
    departmentCode: 'CS',
    canAssignWork: true,
    isActive: true,
  };

  const mockHandovers = [
    {
      id: 301,
      title: 'Lab Session 4 Coverage',
      notes: 'Please cover process scheduling practical exam for Section B.',
      responseNotes: null,
      status: 'Pending',
      dueDate: '2026-11-20',
      completedAt: null,
      createdAt: '2026-10-18T10:00:00Z',
      updatedAt: '2026-10-18T10:00:00Z',
      sender: { id: 3, fullName: 'Dr. Ada Lovelace', email: 'prof.cs@facultyflow.local', role: 'PROFESSOR' },
      recipient: { id: 4, fullName: 'Claude Shannon', email: 'asst.cs@facultyflow.local', role: 'ASSISTANT_PROFESSOR' },
      department: { id: 1, name: 'Computer Science and Engineering', code: 'CS' },
      task: { id: 101, title: 'OS Practical Examination', status: 'In Progress', category: 'Teaching' },
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
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              user: mockHodUser,
              accessToken: 'mock_token',
            }),
          });
        }

        if (url.includes('/api/handovers')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              handovers: mockHandovers,
              pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
            }),
          });
        }

        if (url.includes('/api/users')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              users: [
                { id: 3, fullName: 'Dr. Ada Lovelace', role: 'PROFESSOR', departmentId: 1, isActive: true },
                { id: 4, fullName: 'Claude Shannon', role: 'ASSISTANT_PROFESSOR', departmentId: 1, isActive: true },
              ],
            }),
          });
        }

        if (url.includes('/api/tasks')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              tasks: [
                { id: 101, title: 'OS Practical Examination', category: 'Teaching' },
              ],
            }),
          });
        }

        if (url.includes('/api/dashboard')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              dashboard: {
                role: 'HOD',
                department: { id: 1, name: 'Computer Science and Engineering', code: 'CS' },
                taskMetrics: { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0, upcoming: 0, byPriority: {}, byCategory: {} },
                facultyWorkload: [],
                syllabusOverview: { totalCourses: 0, inProgress: 0, completed: 0, draft: 0, averageCompletionPercentage: 0 },
                handoversCount: { pending: 1, total: 1 },
              },
            }),
          });
        }

        if (url.includes('/api/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'ok',
              service: 'Faculty Flow 2.0 API',
              database: { status: 'connected' },
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

  it('navigates to Handovers tab and renders sender, recipient, and linked task', async () => {
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

    // Wait for login
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Handovers$/i })).toBeInTheDocument();
    });

    // Navigate to Handovers tab
    fireEvent.click(screen.getByRole('button', { name: /^Handovers$/i }));

    // Verify handovers view
    await waitFor(() => {
      expect(screen.getByText(/Faculty Academic Handovers & Continuity/i)).toBeInTheDocument();
      expect(screen.getByText('Lab Session 4 Coverage')).toBeInTheDocument();
      expect(screen.getByText('Dr. Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('Claude Shannon')).toBeInTheDocument();
      expect(screen.getByText(/OS Practical Examination/i)).toBeInTheDocument();
    });

    // Verify Initiate Handover button exists
    expect(screen.getByRole('button', { name: /Initiate Handover/i })).toBeInTheDocument();
  });

  it('opens Initiate Handover modal and renders form inputs', async () => {
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
      expect(screen.getByRole('button', { name: /^Handovers$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Handovers$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Initiate Handover/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Initiate Handover/i }));

    // Verify modal appeared
    await waitFor(() => {
      expect(screen.getByText('Initiate Academic Handover')).toBeInTheDocument();
      expect(screen.getByLabelText(/Recipient Faculty Member/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Handover Title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Context, Guidelines & Deliverables/i)).toBeInTheDocument();
    });
  });
});
