import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Database, Server, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

interface HealthResponse {
  status: 'ok' | 'degraded' | string;
  service: string;
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    status: 'connected' | 'disconnected' | string;
    message: string;
    error?: string;
  };
}

export const HealthCard: React.FC = () => {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showJson, setShowJson] = useState<boolean>(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const endpoint = apiUrl.endsWith('/') ? `${apiUrl}health` : `${apiUrl}/health`;
      
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });

      const responseTime = Math.round(performance.now() - start);
      setLatency(responseTime);

      if (!res.ok) {
        throw new Error(`Server responded with HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
      setLastChecked(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reach API server';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="health-card" id="health-card">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge">
            <Activity className="icon-pulse" size={22} />
          </div>
          <div>
            <h2 className="card-title">System Status & Connectivity</h2>
            <p className="card-subtitle">Real-time health verification across micro-services</p>
          </div>
        </div>

        <button
          id="btn-refresh-health"
          className="refresh-btn"
          onClick={fetchHealth}
          disabled={loading}
          title="Re-run health check"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>{loading ? 'Testing...' : 'Check Now'}</span>
        </button>
      </div>

      <div className="status-grid">
        {/* Backend API Service */}
        <div className="status-item">
          <div className="status-item-header">
            <Server size={18} className="item-icon" />
            <span className="item-label">Express Backend</span>
          </div>
          <div className="status-item-body">
            {loading ? (
              <span className="badge checking">Verifying...</span>
            ) : error ? (
              <span className="badge offline">
                <XCircle size={14} /> Offline
              </span>
            ) : (
              <span className="badge online">
                <CheckCircle2 size={14} /> Healthy (v2.0)
              </span>
            )}
            <span className="item-meta">
              {latency !== null && !error ? `${latency}ms latency` : 'Target: /api/health'}
            </span>
          </div>
        </div>

        {/* MySQL Database Service */}
        <div className="status-item">
          <div className="status-item-header">
            <Database size={18} className="item-icon" />
            <span className="item-label">MySQL Database</span>
          </div>
          <div className="status-item-body">
            {loading ? (
              <span className="badge checking">Verifying...</span>
            ) : data?.database?.status === 'connected' ? (
              <span className="badge online">
                <CheckCircle2 size={14} /> Connected
              </span>
            ) : (
              <span className="badge degraded">
                <AlertTriangle size={14} /> Standby / Not Connected
              </span>
            )}
            <span className="item-meta">
              {data?.database.message || (error ? 'Backend unreachable' : 'Pool configured')}
            </span>
          </div>
        </div>

        {/* Runtime Environment */}
        <div className="status-item">
          <div className="status-item-header">
            <Clock size={18} className="item-icon" />
            <span className="item-label">Runtime</span>
          </div>
          <div className="status-item-body">
            <span className="badge neutral">
              {data ? data.environment.toUpperCase() : 'DEV'}
            </span>
            <span className="item-meta">
              {data ? `Uptime: ${formatUptime(data.uptime)}` : 'Node.js + TS'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert-box error" id="health-error-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>API Connection Warning:</strong> {error}. Ensure backend is running via{' '}
            <code>npm run dev:server</code>.
          </div>
        </div>
      )}

      {lastChecked && (
        <div className="card-footer">
          <span className="last-checked">
            Last ping: {lastChecked.toLocaleTimeString()}
          </span>
          <button
            className="toggle-json-btn"
            id="btn-toggle-json"
            onClick={() => setShowJson(!showJson)}
          >
            {showJson ? 'Hide Details' : 'View Payload'}
          </button>
        </div>
      )}

      {showJson && data && (
        <pre className="json-viewer" id="health-json-viewer">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};
