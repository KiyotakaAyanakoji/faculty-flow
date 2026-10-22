/**
 * Phase 7 Email Notification Types and Constants
 */

export const NOTIFICATION_EVENTS = {
  // Task Management
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_REASSIGNED: 'TASK_REASSIGNED',
  TASK_CANCELLED: 'TASK_CANCELLED',

  // Leave Management
  LEAVE_SUBMITTED: 'LEAVE_SUBMITTED',
  LEAVE_PENDING_APPROVAL: 'LEAVE_PENDING_APPROVAL',
  LEAVE_APPROVED: 'LEAVE_APPROVED',
  LEAVE_REJECTED: 'LEAVE_REJECTED',
  LEAVE_CANCELLED: 'LEAVE_CANCELLED',

  // Academic Calendar & Events
  EVENT_INVITATION: 'EVENT_INVITATION',
  EVENT_UPDATED: 'EVENT_UPDATED',
  EVENT_CANCELLED: 'EVENT_CANCELLED',

  // Handovers
  HANDOVER_CREATED: 'HANDOVER_CREATED',
  HANDOVER_STATUS_UPDATED: 'HANDOVER_STATUS_UPDATED',
} as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

export type NotificationStatus = 'Pending' | 'Processing' | 'Sent' | 'Failed';

export interface EnqueueNotificationParams {
  idempotencyKey: string;
  eventType: NotificationEvent;
  recipientEmail: string;
  recipientName?: string | null;
  recipientId?: number | null;
  subject?: string;
  templateId: string;
  payload: Record<string, any>;
}

export interface EmailNotificationRecord {
  id: number;
  idempotency_key: string;
  event_type: string;
  recipient_email: string;
  recipient_name: string | null;
  recipient_id: number | null;
  subject: string;
  template_id: string;
  payload: Record<string, any>;
  status: NotificationStatus;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | Date | null;
  locked_at: string | Date | null;
  locked_by: string | null;
  error_message: string | null;
  sent_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}
