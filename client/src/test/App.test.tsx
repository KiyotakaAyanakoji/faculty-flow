import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

describe('Frontend Smoke Tests - Faculty Flow 2.0 Client', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
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
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders application header and title', async () => {
    render(<App />);
    const heading = screen.getByRole('heading', {
      name: /Academic Operations & Faculty Portal/i,
    });
    expect(heading).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Healthy \(v2\.0\)/i)).toBeInTheDocument();
    });
  });

  it('renders architecture cards for client, server, and database', async () => {
    render(<App />);
    expect(screen.getByText('Client Application')).toBeInTheDocument();
    expect(screen.getByText('Server Application')).toBeInTheDocument();
    expect(screen.getByText('Database & Migrations')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Healthy \(v2\.0\)/i)).toBeInTheDocument();
    });
  });

  it('renders HealthCard component and displays healthy status', async () => {
    render(<App />);

    expect(screen.getByText(/System Status & Connectivity/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Healthy \(v2\.0\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    });
  });
});
