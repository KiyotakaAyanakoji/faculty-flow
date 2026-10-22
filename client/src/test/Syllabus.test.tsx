import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Phase 4 Frontend Tests - Syllabus Tracking & Management', () => {
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

  const mockSyllabuses = [
    {
      id: 201,
      departmentId: 1,
      courseCode: 'CS301',
      courseName: 'Operating Systems & Concurrency',
      academicYear: '2026-2027',
      semester: 'Semester 5',
      totalUnits: 5,
      completedUnits: 3,
      completionPercentage: 60,
      status: 'In Progress',
      units: [
        { unitNumber: 1, title: 'Kernel Architecture', status: 'Completed' },
        { unitNumber: 2, title: 'Processes & Threads', status: 'Completed' },
        { unitNumber: 3, title: 'Concurrency & Deadlocks', status: 'Completed' },
        { unitNumber: 4, title: 'Memory Management', status: 'In Progress' },
        { unitNumber: 5, title: 'File Systems', status: 'Pending' },
      ],
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
      department: { id: 1, name: 'Computer Science and Engineering', code: 'CS' },
      faculty: { id: 3, fullName: 'Dr. Ada Lovelace', email: 'prof.cs@facultyflow.local', role: 'PROFESSOR' },
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

        if (url.includes('/api/syllabus')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              syllabuses: mockSyllabuses,
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
                syllabusOverview: { totalCourses: 1, inProgress: 1, completed: 0, draft: 0, averageCompletionPercentage: 60 },
                handoversCount: { pending: 0, total: 0 },
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

  it('navigates to Syllabus tab and renders course progress, instructor, and units', async () => {
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
      expect(screen.getByRole('button', { name: /Syllabus/i })).toBeInTheDocument();
    });

    // Navigate to Syllabus tab
    fireEvent.click(screen.getByRole('button', { name: /Syllabus/i }));

    // Verify syllabus content
    await waitFor(() => {
      expect(screen.getByText(/Department Course Syllabuses & Progress Tracking/i)).toBeInTheDocument();
      expect(screen.getByText('CS301')).toBeInTheDocument();
      expect(screen.getByText('Operating Systems & Concurrency')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
      expect(screen.getByText('Dr. Ada Lovelace')).toBeInTheDocument();
    });

    // Verify Add Course Syllabus button is available for HOD
    expect(screen.getByRole('button', { name: /Add Course Syllabus/i })).toBeInTheDocument();
  });

  it('opens Add Course Syllabus modal and displays input fields', async () => {
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
      expect(screen.getByRole('button', { name: /Syllabus/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Syllabus/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Course Syllabus/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Course Syllabus/i }));

    // Verify modal appeared
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Add Course Syllabus/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Course Code/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Course Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Academic Year/i)).toBeInTheDocument();
    });
  });
});
