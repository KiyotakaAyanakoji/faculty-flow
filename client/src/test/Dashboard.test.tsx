import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Phase 4 Frontend Tests - Role-Specific Dashboards', () => {
  const mockAdminUser = {
    id: 1,
    email: 'admin@facultyflow.local',
    fullName: 'Dr. Arthur Vance (System Admin)',
    role: 'SYSTEM_ADMIN',
    departmentId: null,
    canAssignWork: false,
    isActive: true,
  };

  const mockAdminDashboard = {
    role: 'SYSTEM_ADMIN',
    users: {
      total: 8,
      active: 7,
      inactive: 1,
      byRole: {
        SYSTEM_ADMIN: 1,
        HOD: 2,
        PROFESSOR: 2,
        ASSISTANT_PROFESSOR: 3,
      },
    },
    departments: [
      { id: 1, name: 'Computer Science and Engineering', code: 'CS', facultyCount: 4 },
      { id: 2, name: 'Mechanical Engineering', code: 'MECH', facultyCount: 3 },
    ],
    recentAuditLogs: [
      {
        id: 1,
        action: 'USER_LOGIN',
        actorName: 'Dr. Arthur Vance',
        targetType: 'SESSION',
        createdAt: new Date().toISOString(),
      },
    ],
  };

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

  const mockHodDashboard = {
    role: 'HOD',
    department: { id: 1, name: 'Computer Science and Engineering', code: 'CS' },
    taskMetrics: {
      total: 12,
      pending: 4,
      inProgress: 5,
      completed: 3,
      overdue: 2,
      upcoming: 3,
      byPriority: { Low: 2, Medium: 6, High: 4 },
      byCategory: { Teaching: 4, Research: 2, Grading: 3, Meetings: 2, Administrative: 1 },
    },
    facultyWorkload: [
      {
        facultyId: 3,
        fullName: 'Dr. Ada Lovelace',
        email: 'prof.cs@facultyflow.local',
        role: 'PROFESSOR',
        pendingTasks: 2,
        inProgressTasks: 2,
        completedTasks: 1,
        overdueTasks: 1,
        totalTasks: 5,
      },
    ],
    syllabusOverview: {
      totalCourses: 4,
      inProgress: 3,
      completed: 1,
      draft: 0,
      averageCompletionPercentage: 58.5,
    },
    handoversCount: {
      pending: 2,
      total: 5,
    },
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
          const body = JSON.parse(_options?.body || '{}');
          const isHod = body.email.includes('hod');
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              user: isHod ? mockHodUser : mockAdminUser,
              accessToken: 'mock_token',
            }),
          });
        }

        if (url.includes('/api/dashboard')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              dashboard: url.includes('admin') ? mockAdminDashboard : mockHodDashboard,
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

  it('renders HOD Command Center with workload distribution, overdue alerts, and syllabus stats', async () => {
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

    // Verify HOD dashboard displays
    await waitFor(() => {
      expect(screen.getByText(/HOD Command Center/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Tasks/i)).toBeInTheDocument();
      expect(screen.getByText(/Overdue Deadlines/i)).toBeInTheDocument();
      expect(screen.getByText(/Department Faculty Workload Distribution/i)).toBeInTheDocument();
      expect(screen.getByText('Dr. Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByText('58.5%')).toBeInTheDocument();
    });
  });
});
