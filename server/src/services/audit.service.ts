import { pool } from '../config/database.js';

export async function logAuditEvent(params: {
  actorId?: number | null;
  action: string;
  targetType?: string;
  targetId?: number | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.actorId || null,
        params.action,
        params.targetType || null,
        params.targetId || null,
        params.details ? JSON.stringify(params.details) : null,
        params.ipAddress || null,
      ]
    );
  } catch (err) {
    // Audit logging should not crash the primary operational request
    console.error('[Audit Log Error] Failed to write audit event:', err);
  }
}
