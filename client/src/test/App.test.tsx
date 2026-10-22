import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

describe('Frontend Smoke & Authentication Tests - Faculty Flow 2.0 Client', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, options?: any) => {
        if (url.includes('/api/auth/me')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ success: false, message: 'Unauthenticated' }),
          });
        }

        if (url.includes('/api/auth/login')) {
          const body = JSON.parse(options?.body || '{}');
          if (body.email === 'admin@facultyflow.local') {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                success: true,
                user: {
                  id: 1,
                  email: 'admin@facultyflow.local',
                  fullName: 'Dr. Arthur Vance (System Admin)',
                  role: 'SYSTEM_ADMIN',
                  departmentId: null,
                  canAssignWork: false,
                  isActive: true,
                },
                accessToken: 'mock_jwt_token',
              }),
            });
          }
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({
              success: false,
              error: { message: 'Invalid email or password.' },
            }),
          });
        }

        if (url.includes('/api/auth/logout')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
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

  it('renders application header, architecture cards, and login form when unauthenticated', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('heading', {
        name: /Academic Operations & Faculty Portal/i,
      })
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/Institutional Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Healthy \(v2\.0\)/i)).toBeInTheDocument();
    });
  });

  it('allows logging in with credentials and renders role-aware authenticated navigation', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/Institutional Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    fireEvent.change(emailInput, { target: { value: 'admin@facultyflow.local' } });
    fireEvent.change(passwordInput, { target: { value: 'Password@12345' } });
    fireEvent.submit(screen.getByTestId('login-form'));

    await waitFor(() => {
      expect(screen.getAllByText('Dr. Arthur Vance (System Admin)')[0]).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /User Management/i })).toBeInTheDocument();
      expect(screen.getByTestId('btn-logout')).toBeInTheDocument();
    });
  });

  it('allows user to sign out and returns to public landing screen', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });

    // Login first
    fireEvent.change(screen.getByLabelText(/Institutional Email/i), {
      target: { value: 'admin@facultyflow.local' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'Password@12345' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));

    await waitFor(() => {
      expect(screen.getByTestId('btn-logout')).toBeInTheDocument();
    });

    // Click Sign Out
    const logoutBtn = screen.getByTestId('btn-logout');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByText('Sign In to Faculty Flow')).toBeInTheDocument();
    });
  });
});
