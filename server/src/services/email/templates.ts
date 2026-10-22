import { escapeHtml, sanitizeHeader } from './sanitizer.js';
import { NOTIFICATION_EVENTS } from './template-types.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Wraps content in the centralized Faculty Flow 2.0 branded layout
 */
function wrapEmailLayout(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background-color: #f8fafc;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .email-header {
      background: #0f172a;
      padding: 24px 32px;
      border-bottom: 3px solid #6366f1;
    }
    .header-brand {
      color: #ffffff;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0;
    }
    .header-subtitle {
      color: #94a3b8;
      font-size: 13px;
      margin-top: 4px;
      margin-bottom: 0;
    }
    .email-body {
      padding: 32px;
    }
    .email-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: #f8fafc;
      border-radius: 6px;
      overflow: hidden;
    }
    .details-table td {
      padding: 10px 14px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    .details-table td.label {
      width: 32%;
      font-weight: 600;
      color: #64748b;
    }
    .details-table td.value {
      color: #0f172a;
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-primary { background: #e0e7ff; color: #4338ca; }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-danger { background: #fee2e2; color: #b91c1c; }
    .email-footer {
      background: #f8fafc;
      padding: 20px 32px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1 class="header-brand">Faculty Flow 2.0</h1>
      <p class="header-subtitle">Academic Operations & Faculty Portal</p>
    </div>
    <div class="email-body">
      ${contentHtml}
    </div>
    <div class="email-footer">
      <p style="margin: 0;">This is an automated system notification from Faculty Flow 2.0.</p>
      <p style="margin: 4px 0 0 0;">Please log in to your institutional portal to review your assignments.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Centralized template renderer
 */
export function renderEmailTemplate(templateId: string, payload: Record<string, any>): RenderedEmail {
  switch (templateId) {
    // -------------------------------------------------------------------------
    // 1. Task Management
    // -------------------------------------------------------------------------
    case NOTIFICATION_EVENTS.TASK_ASSIGNED: {
      const title = payload.taskTitle || payload.title || 'Untitled Task';
      const subject = sanitizeHeader(`[Faculty Flow] New Task Assigned: ${title}`);
      const category = payload.category || 'General';
      const priority = payload.priority || 'Medium';
      const dueDate = payload.dueDate || 'No deadline';
      const creatorName = payload.creatorName || payload.assignedByName || 'Academic Supervisor';
      const description = payload.description || 'No description provided';

      const html = wrapEmailLayout('New Task Assigned', `
        <h2 class="email-title">New Academic Task Assigned</h2>
        <p>You have been assigned a new academic task by <strong>${escapeHtml(creatorName)}</strong>.</p>
        <table class="details-table">
          <tr><td class="label">Task Title</td><td class="value"><strong>${escapeHtml(title)}</strong></td></tr>
          <tr><td class="label">Category</td><td class="value"><span class="badge badge-primary">${escapeHtml(category)}</span></td></tr>
          <tr><td class="label">Priority</td><td class="value">${escapeHtml(priority)}</td></tr>
          <tr><td class="label">Due Date</td><td class="value">${escapeHtml(dueDate)}</td></tr>
          <tr><td class="label">Assigned By</td><td class="value">${escapeHtml(creatorName)}</td></tr>
          <tr><td class="label">Details</td><td class="value">${escapeHtml(description)}</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - New Task Assigned\n\n` +
        `You have been assigned a new academic task by ${creatorName}.\n\n` +
        `Task: ${title}\n` +
        `Category: ${category}\n` +
        `Priority: ${priority}\n` +
        `Due Date: ${dueDate}\n` +
        `Details: ${description}\n\n` +
        `Log in to Faculty Flow to view and update this task.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.TASK_UPDATED: {
      const title = payload.taskTitle || payload.title || 'Academic Task';
      const subject = sanitizeHeader(`[Faculty Flow] Task Updated: ${title}`);
      const updatedFields = payload.updatedFields || 'Details modified';
      const updatedBy = payload.updatedBy || payload.updatedByName || 'Supervisor';

      const html = wrapEmailLayout('Task Details Updated', `
        <h2 class="email-title">Task Details Updated</h2>
        <p>An assigned task has been updated by <strong>${escapeHtml(updatedBy)}</strong>.</p>
        <table class="details-table">
          <tr><td class="label">Task Title</td><td class="value"><strong>${escapeHtml(title)}</strong></td></tr>
          <tr><td class="label">Updated Fields</td><td class="value">${escapeHtml(updatedFields)}</td></tr>
          <tr><td class="label">Modified By</td><td class="value">${escapeHtml(updatedBy)}</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Task Updated\n\n` +
        `Task '${title}' has been updated by ${updatedBy}.\n` +
        `Changes: ${updatedFields}\n\n` +
        `Please log in to Faculty Flow to review updated task deliverables.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.TASK_REASSIGNED: {
      const title = payload.taskTitle || payload.title || 'Academic Task';
      const subject = sanitizeHeader(`[Faculty Flow] Task Reassigned: ${title}`);
      const reassignedBy = payload.reassignedBy || payload.reassignedByName || 'Department HOD';
      const dueDate = payload.dueDate || 'No deadline';

      const html = wrapEmailLayout('Task Reassigned', `
        <h2 class="email-title">Academic Task Reassigned to You</h2>
        <p>The following academic task has been reassigned to your responsibility by <strong>${escapeHtml(reassignedBy)}</strong>.</p>
        <table class="details-table">
          <tr><td class="label">Task Title</td><td class="value"><strong>${escapeHtml(title)}</strong></td></tr>
          <tr><td class="label">Reassigned By</td><td class="value">${escapeHtml(reassignedBy)}</td></tr>
          <tr><td class="label">Due Date</td><td class="value">${escapeHtml(dueDate)}</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Task Reassigned\n\n` +
        `The task '${title}' has been reassigned to you by ${reassignedBy}.\n` +
        `Due Date: ${dueDate}\n\n` +
        `Log in to Faculty Flow to review task deliverables.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.TASK_CANCELLED: {
      const title = payload.taskTitle || payload.title || 'Academic Task';
      const subject = sanitizeHeader(`[Faculty Flow] Task Cancelled: ${title}`);
      const cancelledBy = payload.cancelledBy || payload.cancelledByName || 'Task Creator';

      const html = wrapEmailLayout('Task Cancelled', `
        <h2 class="email-title">Task Cancelled</h2>
        <p>The academic task <strong>${escapeHtml(title)}</strong> has been cancelled or removed by <strong>${escapeHtml(cancelledBy)}</strong>.</p>
      `);

      const text = `Faculty Flow 2.0 - Task Cancelled\n\n` +
        `The task '${title}' has been cancelled by ${cancelledBy}.\n` +
        `No further action is required.`;

      return { subject, html, text };
    }

    // -------------------------------------------------------------------------
    // 2. Leave Management
    // -------------------------------------------------------------------------
    case NOTIFICATION_EVENTS.LEAVE_SUBMITTED: {
      const leaveType = payload.leaveTypeName || payload.leaveType || 'Leave';
      const subject = sanitizeHeader(`[Faculty Flow] Leave Request Submitted (${leaveType})`);
      const startDate = payload.startDate;
      const endDate = payload.endDate;
      const daysCount = payload.daysCount;
      const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

      const html = wrapEmailLayout('Leave Request Submitted', `
        <h2 class="email-title">Leave Request Submitted</h2>
        <p>Your leave request has been submitted successfully and entered the department approval queue.</p>
        <table class="details-table">
          <tr><td class="label">Leave Type</td><td class="value"><strong>${escapeHtml(leaveType)}</strong></td></tr>
          <tr><td class="label">Dates</td><td class="value">${escapeHtml(dateRange)}</td></tr>
          <tr><td class="label">Duration</td><td class="value">${escapeHtml(daysCount)} working day(s)</td></tr>
          <tr><td class="label">Status</td><td class="value"><span class="badge badge-warning">Pending Approval</span></td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Leave Request Submitted\n\n` +
        `Your leave request for ${leaveType} has been submitted.\n` +
        `Dates: ${dateRange}\n` +
        `Duration: ${daysCount} working day(s)\n` +
        `Status: Pending Approval\n\n` +
        `You will receive an update once your Department HOD reviews your request.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.LEAVE_PENDING_APPROVAL: {
      const requesterName = payload.requesterName || 'Faculty Member';
      const leaveType = payload.leaveTypeName || 'Leave';
      const subject = sanitizeHeader(`[Faculty Flow] Action Required: New Leave Request from ${requesterName}`);
      const startDate = payload.startDate;
      const endDate = payload.endDate;
      const daysCount = payload.daysCount;
      const reason = payload.reason || 'No reason specified';
      const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

      const html = wrapEmailLayout('Leave Request Pending Approval', `
        <h2 class="email-title">New Leave Request Awaiting Decision</h2>
        <p>A departmental faculty member has submitted a leave request that requires your review.</p>
        <table class="details-table">
          <tr><td class="label">Faculty Member</td><td class="value"><strong>${escapeHtml(requesterName)}</strong></td></tr>
          <tr><td class="label">Leave Type</td><td class="value">${escapeHtml(leaveType)}</td></tr>
          <tr><td class="label">Requested Dates</td><td class="value">${escapeHtml(dateRange)}</td></tr>
          <tr><td class="label">Duration</td><td class="value"><strong>${escapeHtml(daysCount)} working day(s)</strong></td></tr>
          <tr><td class="label">Reason</td><td class="value">${escapeHtml(reason)}</td></tr>
        </table>
        <p>Please log in to Faculty Flow to review and decide this request in the HOD Approval Queue.</p>
      `);

      const text = `Faculty Flow 2.0 - Leave Request Pending Approval\n\n` +
        `Faculty member ${requesterName} has submitted a leave request.\n` +
        `Leave Type: ${leaveType}\n` +
        `Dates: ${dateRange} (${daysCount} working days)\n` +
        `Reason: ${reason}\n\n` +
        `Please log in to Faculty Flow to approve or reject this request.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.LEAVE_APPROVED: {
      const leaveType = payload.leaveTypeName || 'Leave';
      const subject = sanitizeHeader(`[Faculty Flow] Leave Request Approved (${leaveType})`);
      const startDate = payload.startDate;
      const endDate = payload.endDate;
      const daysCount = payload.daysCount;
      const approverName = payload.approverName || 'Department HOD';
      const decisionNotes = payload.decisionNotes || 'Approved as requested.';
      const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

      const html = wrapEmailLayout('Leave Request Approved', `
        <h2 class="email-title">Leave Request Approved</h2>
        <p>Your leave request has been reviewed and <strong style="color: #15803d;">Approved</strong> by <strong>${escapeHtml(approverName)}</strong>.</p>
        <table class="details-table">
          <tr><td class="label">Leave Type</td><td class="value">${escapeHtml(leaveType)}</td></tr>
          <tr><td class="label">Dates</td><td class="value">${escapeHtml(dateRange)}</td></tr>
          <tr><td class="label">Duration</td><td class="value">${escapeHtml(daysCount)} working day(s)</td></tr>
          <tr><td class="label">Status</td><td class="value"><span class="badge badge-success">Approved</span></td></tr>
          <tr><td class="label">Decision Notes</td><td class="value">${escapeHtml(decisionNotes)}</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Leave Request Approved\n\n` +
        `Your leave request for ${leaveType} has been Approved by ${approverName}.\n` +
        `Dates: ${dateRange} (${daysCount} working days)\n` +
        `Status: Approved\n` +
        `Decision Notes: ${decisionNotes}\n\n` +
        `Log in to Faculty Flow to view your updated leave balance.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.LEAVE_REJECTED: {
      const leaveType = payload.leaveTypeName || 'Leave';
      const subject = sanitizeHeader(`[Faculty Flow] Leave Request Rejected (${leaveType})`);
      const startDate = payload.startDate;
      const endDate = payload.endDate;
      const approverName = payload.approverName || 'Department HOD';
      const decisionNotes = payload.decisionNotes || 'Request could not be accommodated.';
      const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

      const html = wrapEmailLayout('Leave Request Rejected', `
        <h2 class="email-title">Leave Request Rejected</h2>
        <p>Your leave request has been reviewed and <strong style="color: #b91c1c;">Rejected</strong> by <strong>${escapeHtml(approverName)}</strong>.</p>
        <table class="details-table">
          <tr><td class="label">Leave Type</td><td class="value">${escapeHtml(leaveType)}</td></tr>
          <tr><td class="label">Dates</td><td class="value">${escapeHtml(dateRange)}</td></tr>
          <tr><td class="label">Status</td><td class="value"><span class="badge badge-danger">Rejected</span></td></tr>
          <tr><td class="label">Decision Notes</td><td class="value">${escapeHtml(decisionNotes)}</td></tr>
        </table>
        <p>Any pending leave balance reserved for this request has been restored to your entitlement.</p>
      `);

      const text = `Faculty Flow 2.0 - Leave Request Rejected\n\n` +
        `Your leave request for ${leaveType} (${dateRange}) was Rejected by ${approverName}.\n` +
        `Decision Notes: ${decisionNotes}\n\n` +
        `Any reserved leave days have been released back to your available balance.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.LEAVE_CANCELLED: {
      const leaveType = payload.leaveTypeName || 'Leave';
      const subject = sanitizeHeader(`[Faculty Flow] Leave Request Cancelled (${leaveType})`);
      const startDate = payload.startDate;
      const endDate = payload.endDate;
      const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
      const reason = payload.reason || 'Cancelled by requester';

      const html = wrapEmailLayout('Leave Request Cancelled', `
        <h2 class="email-title">Leave Request Cancelled</h2>
        <p>The leave request for <strong>${escapeHtml(leaveType)}</strong> (${escapeHtml(dateRange)}) has been cancelled.</p>
        <table class="details-table">
          <tr><td class="label">Cancellation Reason</td><td class="value">${escapeHtml(reason)}</td></tr>
          <tr><td class="label">Balance Status</td><td class="value">All reserved or deducted days have been restored.</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Leave Request Cancelled\n\n` +
        `The leave request for ${leaveType} (${dateRange}) has been cancelled.\n` +
        `Reason: ${reason}\n\n` +
        `Any reserved or deducted days have been restored.`;

      return { subject, html, text };
    }

    // -------------------------------------------------------------------------
    // 3. Academic Calendar & Events
    // -------------------------------------------------------------------------
    case NOTIFICATION_EVENTS.EVENT_INVITATION: {
      const title = payload.title || 'Academic Event';
      const subject = sanitizeHeader(`[Faculty Flow] Event Invitation: ${title}`);
      const category = payload.category || 'Meeting';
      const startTime = payload.startTime || 'Scheduled Time';
      const endTime = payload.endTime || '';
      const location = payload.location || 'Campus / Online';
      const creatorName = payload.creatorName || 'Event Organizer';

      const html = wrapEmailLayout('Academic Event Invitation', `
        <h2 class="email-title">Academic Event Invitation</h2>
        <p>You have been added as an attendee to an academic event by <strong>${escapeHtml(creatorName)}</strong>.</p>
        <table class="details-table">
          <tr><td class="label">Event Title</td><td class="value"><strong>${escapeHtml(title)}</strong></td></tr>
          <tr><td class="label">Category</td><td class="value"><span class="badge badge-primary">${escapeHtml(category)}</span></td></tr>
          <tr><td class="label">Schedule</td><td class="value">${escapeHtml(startTime)} ${endTime ? '— ' + escapeHtml(endTime) : ''}</td></tr>
          <tr><td class="label">Location</td><td class="value">${escapeHtml(location)}</td></tr>
          <tr><td class="label">Organizer</td><td class="value">${escapeHtml(creatorName)}</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Event Invitation\n\n` +
        `You have been added to the academic event: ${title}\n` +
        `Category: ${category}\n` +
        `Time: ${startTime} ${endTime ? 'to ' + endTime : ''}\n` +
        `Location: ${location}\n` +
        `Organizer: ${creatorName}\n\n` +
        `Log in to Faculty Flow to view the Academic Calendar.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.EVENT_UPDATED: {
      const title = payload.title || 'Academic Event';
      const subject = sanitizeHeader(`[Faculty Flow] Event Schedule Updated: ${title}`);
      const startTime = payload.startTime || 'Updated Schedule';
      const location = payload.location || 'TBD';

      const html = wrapEmailLayout('Event Schedule Updated', `
        <h2 class="email-title">Academic Event Schedule Updated</h2>
        <p>The schedule or details for <strong>${escapeHtml(title)}</strong> have been updated.</p>
        <table class="details-table">
          <tr><td class="label">Event Title</td><td class="value"><strong>${escapeHtml(title)}</strong></td></tr>
          <tr><td class="label">New Schedule</td><td class="value">${escapeHtml(startTime)}</td></tr>
          <tr><td class="label">Location</td><td class="value">${escapeHtml(location)}</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Event Updated\n\n` +
        `The event '${title}' has been updated.\n` +
        `New Schedule: ${startTime}\n` +
        `Location: ${location}\n\n` +
        `Please check the Academic Calendar in Faculty Flow for latest details.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.EVENT_CANCELLED: {
      const title = payload.title || 'Academic Event';
      const subject = sanitizeHeader(`[Faculty Flow] Event Cancelled: ${title}`);

      const html = wrapEmailLayout('Event Cancelled', `
        <h2 class="email-title">Academic Event Cancelled</h2>
        <p>The academic event <strong>${escapeHtml(title)}</strong> has been cancelled and removed from the institutional calendar.</p>
      `);

      const text = `Faculty Flow 2.0 - Event Cancelled\n\n` +
        `The academic event '${title}' has been cancelled.\n` +
        `No attendance is required.`;

      return { subject, html, text };
    }

    // -------------------------------------------------------------------------
    // 4. Academic Handovers
    // -------------------------------------------------------------------------
    case NOTIFICATION_EVENTS.HANDOVER_CREATED: {
      const title = payload.handoverTitle || payload.title || 'Academic Handover';
      const subject = sanitizeHeader(`[Faculty Flow] Academic Handover Assigned: ${title}`);
      const senderName = payload.senderName || 'Faculty Colleague';
      const notes = payload.notes || 'No handover context provided';
      const dueDate = payload.dueDate || 'No target date';

      const html = wrapEmailLayout('New Academic Handover', `
        <h2 class="email-title">New Academic Handover Assigned to You</h2>
        <p><strong>${escapeHtml(senderName)}</strong> has initiated an academic handover assigned to you.</p>
        <table class="details-table">
          <tr><td class="label">Handover Title</td><td class="value"><strong>${escapeHtml(title)}</strong></td></tr>
          <tr><td class="label">Sender</td><td class="value">${escapeHtml(senderName)}</td></tr>
          <tr><td class="label">Target Date</td><td class="value">${escapeHtml(dueDate)}</td></tr>
          <tr><td class="label">Context & Notes</td><td class="value">${escapeHtml(notes)}</td></tr>
        </table>
        <p>Please log in to Faculty Flow to Accept or Review this handover.</p>
      `);

      const text = `Faculty Flow 2.0 - Academic Handover\n\n` +
        `${senderName} has initiated a handover to you: '${title}'.\n` +
        `Target Date: ${dueDate}\n` +
        `Notes: ${notes}\n\n` +
        `Please log in to Faculty Flow to accept or review the handover.`;

      return { subject, html, text };
    }

    case NOTIFICATION_EVENTS.HANDOVER_STATUS_UPDATED: {
      const title = payload.title || 'Academic Handover';
      const status = payload.status || 'Updated';
      const recipientName = payload.recipientName || 'Recipient';
      const subject = sanitizeHeader(`[Faculty Flow] Handover Status: ${status} (${title})`);
      const notes = payload.responseNotes || 'No response notes';

      const badgeClass = status === 'Accepted' || status === 'Completed' ? 'badge-success' : 'badge-danger';

      const html = wrapEmailLayout('Handover Status Updated', `
        <h2 class="email-title">Academic Handover Status Update</h2>
        <p>Your academic handover <strong>${escapeHtml(title)}</strong> has been marked as <span class="badge ${badgeClass}">${escapeHtml(status)}</span> by <strong>${escapeHtml(recipientName)}</strong>.</p>
        <table class="details-table">
          <tr><td class="label">Handover Title</td><td class="value">${escapeHtml(title)}</td></tr>
          <tr><td class="label">Current Status</td><td class="value"><strong>${escapeHtml(status)}</strong></td></tr>
          <tr><td class="label">Recipient Notes</td><td class="value">${escapeHtml(notes)}</td></tr>
        </table>
      `);

      const text = `Faculty Flow 2.0 - Handover Status Update\n\n` +
        `Your handover '${title}' was marked as ${status} by ${recipientName}.\n` +
        `Notes: ${notes}\n\n` +
        `Log in to Faculty Flow to view the handover details.`;

      return { subject, html, text };
    }

    default: {
      throw new Error(`Unsupported email template: ${templateId}`);
    }
  }
}
