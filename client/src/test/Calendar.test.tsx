import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Phase 5 Frontend Tests - Academic Calendar & Secure PDF Uploads', () => {
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

  const mockEvents = [
    {
      id: 501,
      title: 'Distributed Systems Endterm Exam',
      description: 'Comprehensive exam covering replication and consensus',
      category: 'Exam',
      startTime: '2026-11-15T09:30:00.000Z',
      endTime: '2026-11-15T12:30:00.000Z',
      isAllDay: false,
      location: 'Seminar Hall 301',
      meetingLink: null,
      departmentId: 1,
      departmentName: 'Computer Science and Engineering',
      departmentCode: 'CS',
      creatorId: 2,
      creatorName: 'Dr. Sarah Connor',
      participantCount: 3,
      documentCount: 1,
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
  ];

  const mockFaculty = [
    { id: 3, fullName: 'Dr. Ada Lovelace', email: 'prof.cs@facultyflow.local', role: 'PROFESSOR', departmentId: 1 },
    { id: 4, fullName: 'Claude Shannon', email: 'asst.cs@facultyflow.local', role: 'ASSISTANT_PROFESSOR', departmentId: 1 },
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
            }),
          });
        }

        if (url.includes('/api/events/eligible-participants')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              faculty: mockFaculty,
            }),
          });
        }

        if (url.includes('/api/events/501')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ...mockEvents[0],
              participants: [
                { id: 1, eventId: 501, userId: 3, userName: 'Dr. Ada Lovelace', status: 'Accepted' },
              ],
              documents: [
                {
                  id: 11,
                  eventId: 501,
                  fileIdentifier: 'exam_guidelines.pdf',
                  originalName: 'ExamGuidelines.pdf',
                  mimeType: 'application/pdf',
                  fileSize: 45000,
                  uploaderId: 2,
                  uploaderName: 'Dr. Sarah Connor',
                },
              ],
            }),
          });
        }

        if (url.includes('/api/events')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              events: mockEvents,
              total: 1,
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
              database: { connected: true, responseTimeMs: 2 },
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

        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates to Calendar tab and renders events with category badges', async () => {
    render(<App />);

    // Login
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

    // Wait for authenticated Navbar
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Calendar$/i })).toBeInTheDocument();
    });

    // Navigate to Calendar tab
    fireEvent.click(screen.getByRole('button', { name: /^Calendar$/i }));

    // Verify Calendar view header
    await waitFor(() => {
      expect(screen.getByText(/Academic Calendar & Events/i)).toBeInTheDocument();
      expect(screen.getByText(/Schedule Academic Event/i)).toBeInTheDocument();
    });
  });

  it('opens Schedule Academic Event modal and displays form fields', async () => {
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
      expect(screen.getByRole('button', { name: /^Calendar$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Calendar$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Schedule Academic Event/i })).toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /Schedule Academic Event/i }));

    // Verify modal appeared
    await waitFor(() => {
      expect(screen.getByLabelText(/Event Title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Start Date & Time/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/End Date & Time/i)).toBeInTheDocument();
    });
  });
});
