import { Request, Response } from 'express';
import fs from 'fs/promises';
import { pool } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import {
  createEventSchema,
  updateEventSchema,
  eventQuerySchema,
} from '../validators/event.validators.js';
import {
  getSafeFilePath,
  deleteStoredFile,
} from '../services/storage.service.js';
import { enqueueNotification, NOTIFICATION_EVENTS } from '../services/email/index.js';

function parseId(param: string | string[] | undefined): number {
  const val = Array.isArray(param) ? param[0] : param;
  return parseInt(String(val), 10);
}

export function toMySqlDateTime(dateInput: string | Date): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date value');
  }
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function formatIso(d: any): string {
  if (!d) return '';
  return new Date(d).toISOString();
}

/**
 * Lists academic events accessible to the authenticated user.
 * - Non-admins see events for their department + institute-wide events (department_id IS NULL).
 * - System admins can view all events or filter by department.
 */
export async function listEvents(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parseResult = eventQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { startDate, endDate, category, search, departmentId } = parseResult.data;

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    // Department isolation
    if (user.role === ROLES.SYSTEM_ADMIN) {
      if (departmentId) {
        conditions.push('(e.department_id = ? OR e.department_id IS NULL)');
        params.push(departmentId);
      }
    } else {
      conditions.push('(e.department_id = ? OR e.department_id IS NULL)');
      params.push(user.departmentId);
    }

    // Category filter
    if (category) {
      conditions.push('e.category = ?');
      params.push(category);
    }

    // Date range filter
    if (startDate) {
      conditions.push('e.end_time >= ?');
      params.push(toMySqlDateTime(startDate));
    }
    if (endDate) {
      conditions.push('e.start_time <= ?');
      params.push(toMySqlDateTime(endDate));
    }

    // Search filter
    if (search && search.trim()) {
      conditions.push('(e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)');
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.category,
        e.start_time AS startTime,
        e.end_time AS endTime,
        e.is_all_day AS isAllDay,
        e.location,
        e.meeting_link AS meetingLink,
        e.department_id AS departmentId,
        d.name AS departmentName,
        d.code AS departmentCode,
        e.creator_id AS creatorId,
        u.full_name AS creatorName,
        u.email AS creatorEmail,
        e.created_at AS createdAt,
        e.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) AS participantCount,
        (SELECT COUNT(*) FROM event_documents ed WHERE ed.event_id = e.id) AS documentCount
      FROM academic_events e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.creator_id = u.id
      ${whereClause}
      ORDER BY e.start_time ASC
    `;

    const [events] = await pool.query<any[]>(query, params);

    res.json({
      events: events.map(e => ({
        ...e,
        startTime: formatIso(e.startTime),
        endTime: formatIso(e.endTime),
        createdAt: formatIso(e.createdAt),
        updatedAt: formatIso(e.updatedAt),
        isAllDay: Boolean(e.isAllDay),
      })),
      total: events.length,
    });
  } catch (error: any) {
    console.error('Error fetching academic events:', error);
    res.status(500).json({ error: 'Failed to retrieve academic events' });
  }
}

/**
 * Retrieves a single academic event by ID, including its participants and document attachments.
 */
export async function getEventById(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid event ID' });
    return;
  }

  try {
    const [events] = await pool.query<any[]>(
      `SELECT 
        e.id,
        e.title,
        e.description,
        e.category,
        e.start_time AS startTime,
        e.end_time AS endTime,
        e.is_all_day AS isAllDay,
        e.location,
        e.meeting_link AS meetingLink,
        e.department_id AS departmentId,
        d.name AS departmentName,
        d.code AS departmentCode,
        e.creator_id AS creatorId,
        u.full_name AS creatorName,
        u.email AS creatorEmail,
        e.created_at AS createdAt,
        e.updated_at AS updatedAt
      FROM academic_events e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.creator_id = u.id
      WHERE e.id = ?`,
      [eventId]
    );

    if (events.length === 0) {
      res.status(404).json({ error: 'Academic event not found' });
      return;
    }

    const event = events[0];

    // Department isolation
    if (
      event.departmentId !== null &&
      user.role !== ROLES.SYSTEM_ADMIN &&
      event.departmentId !== user.departmentId
    ) {
      res.status(403).json({
        error: 'Forbidden: You do not have access to academic events from another department',
      });
      return;
    }

    // Fetch participants
    const [participants] = await pool.query<any[]>(
      `SELECT 
        ep.id,
        ep.event_id AS eventId,
        ep.user_id AS userId,
        ep.status,
        ep.created_at AS createdAt,
        u.full_name AS userName,
        u.email AS userEmail,
        u.role AS userRole
      FROM event_participants ep
      JOIN users u ON ep.user_id = u.id
      WHERE ep.event_id = ?
      ORDER BY u.full_name ASC`,
      [eventId]
    );

    // Fetch documents
    const [documents] = await pool.query<any[]>(
      `SELECT 
        ed.id,
        ed.event_id AS eventId,
        ed.file_identifier AS fileIdentifier,
        ed.original_name AS originalName,
        ed.mime_type AS mimeType,
        ed.file_size AS fileSize,
        ed.uploader_id AS uploaderId,
        ed.created_at AS createdAt,
        u.full_name AS uploaderName
      FROM event_documents ed
      JOIN users u ON ed.uploader_id = u.id
      WHERE ed.event_id = ?
      ORDER BY ed.created_at DESC`,
      [eventId]
    );

    res.json({
      ...event,
      startTime: formatIso(event.startTime),
      endTime: formatIso(event.endTime),
      createdAt: formatIso(event.createdAt),
      updatedAt: formatIso(event.updatedAt),
      isAllDay: Boolean(event.isAllDay),
      participants: participants.map(p => ({
        ...p,
        createdAt: formatIso(p.createdAt),
      })),
      documents: documents.map(d => ({
        ...d,
        createdAt: formatIso(d.createdAt),
      })),
    });
  } catch (error: any) {
    console.error('Error fetching event details:', error);
    res.status(500).json({ error: 'Failed to retrieve event details' });
  }
}

/**
 * Creates a new academic event with optional participants in a database transaction.
 */
export async function createEvent(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Authorization check
  if (user.role === ROLES.ASSISTANT_PROFESSOR) {
    res.status(403).json({
      error: 'Forbidden: Assistant Professors are not authorized to create academic events',
    });
    return;
  }

  const parseResult = createEventSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed for event creation',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const data = parseResult.data;

  // Determine department ID based on role
  let targetDepartmentId: number | null = null;
  if (user.role === ROLES.SYSTEM_ADMIN) {
    targetDepartmentId = data.departmentId ?? null;
  } else {
    // Non-admin can only create events for their own department
    targetDepartmentId = user.departmentId ?? null;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Validate participants if any
    const participantIds = Array.from(new Set(data.participantIds || []));
    if (participantIds.length > 0) {
      const [eligibleRows] = await connection.query<any[]>(
        `SELECT id, department_id, is_active FROM users WHERE id IN (?)`,
        [participantIds]
      );

      if (eligibleRows.length !== participantIds.length) {
        await connection.rollback();
        res.status(400).json({
          error: 'One or more selected participants could not be found',
        });
        return;
      }

      for (const row of eligibleRows) {
        if (!row.is_active) {
          await connection.rollback();
          res.status(400).json({
            error: `Participant ID ${row.id} is inactive and cannot be invited to events`,
          });
          return;
        }

        // Department isolation for participants
        if (targetDepartmentId !== null && row.department_id !== targetDepartmentId) {
          await connection.rollback();
          res.status(403).json({
            error: `Forbidden: Participant ID ${row.id} belongs to a different department`,
          });
          return;
        }
      }
    }

    // Insert academic event
    const [result] = await connection.query<any>(
      `INSERT INTO academic_events 
        (title, description, category, start_time, end_time, is_all_day, location, meeting_link, department_id, creator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.description || null,
        data.category,
        toMySqlDateTime(data.startTime),
        toMySqlDateTime(data.endTime),
        data.isAllDay ? 1 : 0,
        data.location || null,
        data.meetingLink || null,
        targetDepartmentId,
        user.id,
      ]
    );

    const newEventId = result.insertId;

    // Insert participants if specified
    if (participantIds.length > 0) {
      const participantValues = participantIds.map(uid => [newEventId, uid, 'Invited']);
      await connection.query(
        `INSERT INTO event_participants (event_id, user_id, status) VALUES ?`,
        [participantValues]
      );

      // Phase 7: Enqueue event invitation notifications
      const [participantUsers] = await connection.query<any[]>(
        'SELECT id, email, full_name FROM users WHERE id IN (?)',
        [participantIds]
      );
      for (const p of participantUsers) {
        await enqueueNotification(
          {
            idempotencyKey: `event-invite-${newEventId}-${p.id}`,
            eventType: NOTIFICATION_EVENTS.EVENT_INVITATION,
            recipientEmail: p.email,
            recipientName: p.full_name,
            recipientId: p.id,
            templateId: NOTIFICATION_EVENTS.EVENT_INVITATION,
            payload: {
              title: data.title,
              category: data.category,
              startTime: formatIso(data.startTime),
              endTime: formatIso(data.endTime),
              location: data.location || 'Campus / Online',
              creatorName: user.fullName || 'Event Organizer',
            },
          },
          connection
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      message: 'Academic event created successfully',
      eventId: newEventId,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating academic event:', error);
    res.status(500).json({ error: 'Failed to create academic event' });
  } finally {
    connection.release();
  }
}

/**
 * Updates an academic event and its participant list transactionally.
 */
export async function updateEvent(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid event ID' });
    return;
  }

  const parseResult = updateEventSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed for event update',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const data = parseResult.data;
  const connection = await pool.getConnection();

  try {
    // 1. Fetch existing event
    const [existing] = await connection.query<any[]>(
      `SELECT * FROM academic_events WHERE id = ?`,
      [eventId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Academic event not found' });
      return;
    }

    const currentEvent = existing[0];

    // Authorization check: Must be Creator or HOD of the department (or System Admin)
    const isCreator = currentEvent.creator_id === user.id;
    const isDepartmentHOD =
      user.role === ROLES.HOD && currentEvent.department_id === user.departmentId;
    const isAdmin = user.role === ROLES.SYSTEM_ADMIN;

    if (!isCreator && !isDepartmentHOD && !isAdmin) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to edit this academic event',
      });
      return;
    }

    await connection.beginTransaction();

    // 2. Validate participant list if provided
    if (data.participantIds !== undefined) {
      const participantIds = Array.from(new Set(data.participantIds));

      if (participantIds.length > 0) {
        const [eligibleRows] = await connection.query<any[]>(
          `SELECT id, department_id, is_active FROM users WHERE id IN (?)`,
          [participantIds]
        );

        if (eligibleRows.length !== participantIds.length) {
          await connection.rollback();
          res.status(400).json({
            error: 'One or more selected participants could not be found',
          });
          return;
        }

        for (const row of eligibleRows) {
          if (!row.is_active) {
            await connection.rollback();
            res.status(400).json({
              error: `Participant ID ${row.id} is inactive and cannot be invited to events`,
            });
            return;
          }

          if (currentEvent.department_id !== null && row.department_id !== currentEvent.department_id) {
            await connection.rollback();
            res.status(403).json({
              error: `Forbidden: Participant ID ${row.id} belongs to a different department`,
            });
            return;
          }
        }
      }

      // Sync participants: Delete current and re-insert new
      await connection.query(`DELETE FROM event_participants WHERE event_id = ?`, [eventId]);
      if (participantIds.length > 0) {
        const participantValues = participantIds.map(uid => [eventId, uid, 'Invited']);
        await connection.query(
          `INSERT INTO event_participants (event_id, user_id, status) VALUES ?`,
          [participantValues]
        );
      }
    }

    // 3. Update event fields
    const updates: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      values.push(data.category);
    }
    if (data.startTime !== undefined) {
      updates.push('start_time = ?');
      values.push(toMySqlDateTime(data.startTime));
    }
    if (data.endTime !== undefined) {
      updates.push('end_time = ?');
      values.push(toMySqlDateTime(data.endTime));
    }
    if (data.isAllDay !== undefined) {
      updates.push('is_all_day = ?');
      values.push(data.isAllDay ? 1 : 0);
    }
    if (data.location !== undefined) {
      updates.push('location = ?');
      values.push(data.location);
    }
    if (data.meetingLink !== undefined) {
      updates.push('meeting_link = ?');
      values.push(data.meetingLink || null);
    }

    if (updates.length > 0) {
      values.push(eventId);
      await connection.query(
        `UPDATE academic_events SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      // Phase 7: If schedule or location changed, notify participants
      const scheduleChanged = data.startTime !== undefined || data.endTime !== undefined || data.location !== undefined;
      if (scheduleChanged) {
        const [pUsers] = await connection.query<any[]>(
          `SELECT u.id, u.email, u.full_name 
           FROM event_participants ep 
           JOIN users u ON ep.user_id = u.id 
           WHERE ep.event_id = ?`,
          [eventId]
        );
        for (const p of pUsers) {
          await enqueueNotification(
            {
              idempotencyKey: `event-updated-${eventId}-${p.id}`,
              eventType: NOTIFICATION_EVENTS.EVENT_UPDATED,
              recipientEmail: p.email,
              recipientName: p.full_name,
              recipientId: p.id,
              templateId: NOTIFICATION_EVENTS.EVENT_UPDATED,
              payload: {
                title: data.title || currentEvent.title,
                startTime: data.startTime ? formatIso(data.startTime) : formatIso(currentEvent.start_time),
                location: data.location !== undefined ? data.location : currentEvent.location,
              },
            },
            connection
          );
        }
      }
    }

    await connection.commit();

    res.json({ message: 'Academic event updated successfully' });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error updating academic event:', error);
    res.status(500).json({ error: 'Failed to update academic event' });
  } finally {
    connection.release();
  }
}

/**
 * Deletes an academic event and purges any associated stored physical files.
 */
export async function deleteEvent(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid event ID' });
    return;
  }

  try {
    const [existing] = await pool.query<any[]>(
      `SELECT * FROM academic_events WHERE id = ?`,
      [eventId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Academic event not found' });
      return;
    }

    const currentEvent = existing[0];

    // Authorization check: Must be Creator or HOD of department (or System Admin)
    const isCreator = currentEvent.creator_id === user.id;
    const isDepartmentHOD =
      user.role === ROLES.HOD && currentEvent.department_id === user.departmentId;
    const isAdmin = user.role === ROLES.SYSTEM_ADMIN;

    if (!isCreator && !isDepartmentHOD && !isAdmin) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to delete this academic event',
      });
      return;
    }

    // Retrieve participants to notify before deletion
    const [pUsers] = await pool.query<any[]>(
      `SELECT u.id, u.email, u.full_name 
       FROM event_participants ep 
       JOIN users u ON ep.user_id = u.id 
       WHERE ep.event_id = ?`,
      [eventId]
    );

    // Retrieve documents to clean up storage files
    const [docs] = await pool.query<any[]>(
      `SELECT file_identifier FROM event_documents WHERE event_id = ?`,
      [eventId]
    );

    // Delete event (foreign keys CASCADE to participants and documents)
    await pool.query(`DELETE FROM academic_events WHERE id = ?`, [eventId]);

    // Enqueue cancellation notifications for participants
    for (const p of pUsers) {
      await enqueueNotification({
        idempotencyKey: `event-cancelled-${eventId}-${p.id}`,
        eventType: NOTIFICATION_EVENTS.EVENT_CANCELLED,
        recipientEmail: p.email,
        recipientName: p.full_name,
        recipientId: p.id,
        templateId: NOTIFICATION_EVENTS.EVENT_CANCELLED,
        payload: {
          title: currentEvent.title,
        },
      });
    }

    // Unlink physical files
    for (const doc of docs) {
      await deleteStoredFile(doc.file_identifier);
    }

    res.json({ message: 'Academic event and associated documents deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting academic event:', error);
    res.status(500).json({ error: 'Failed to delete academic event' });
  }
}

/**
 * Attaches a secure PDF document to an academic event.
 */
export async function uploadEventDocument(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid event ID' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No PDF file was uploaded' });
    return;
  }

  try {
    // 1. Fetch event
    const [events] = await pool.query<any[]>(
      `SELECT * FROM academic_events WHERE id = ?`,
      [eventId]
    );

    if (events.length === 0) {
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});
      res.status(404).json({ error: 'Academic event not found' });
      return;
    }

    const event = events[0];

    // Department isolation
    if (
      event.department_id !== null &&
      user.role !== ROLES.SYSTEM_ADMIN &&
      event.department_id !== user.departmentId
    ) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(403).json({
        error: 'Forbidden: You cannot upload documents to events outside your department',
      });
      return;
    }

    // Role permission: HOD, Creator, or Participant
    const isCreator = event.creator_id === user.id;
    const isDepartmentHOD =
      user.role === ROLES.HOD && event.department_id === user.departmentId;
    const isAdmin = user.role === ROLES.SYSTEM_ADMIN;

    const [participantRows] = await pool.query<any[]>(
      `SELECT id FROM event_participants WHERE event_id = ? AND user_id = ?`,
      [eventId, user.id]
    );
    const isParticipant = participantRows.length > 0;

    if (!isCreator && !isDepartmentHOD && !isAdmin && !isParticipant) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(403).json({
        error: 'Forbidden: You must be the creator, HOD, or a participant to upload documents',
      });
      return;
    }

    // 2. Insert document record
    const [result] = await pool.query<any>(
      `INSERT INTO event_documents 
        (event_id, file_identifier, original_name, mime_type, file_size, uploader_id)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        user.id,
      ]
    );

    res.status(201).json({
      message: 'PDF document uploaded successfully',
      document: {
        id: result.insertId,
        eventId,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploaderId: user.id,
      },
    });
  } catch (error: any) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    console.error('Error saving event document:', error);
    res.status(500).json({ error: 'Failed to save event document' });
  }
}

/**
 * Downloads/streams a secure PDF document attached to an event.
 */
export async function downloadEventDocument(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  const docId = parseId(req.params.docId);

  if (isNaN(eventId) || isNaN(docId)) {
    res.status(400).json({ error: 'Invalid event or document ID' });
    return;
  }

  try {
    // 1. Verify event and department access
    const [events] = await pool.query<any[]>(
      `SELECT * FROM academic_events WHERE id = ?`,
      [eventId]
    );

    if (events.length === 0) {
      res.status(404).json({ error: 'Academic event not found' });
      return;
    }

    const event = events[0];

    if (
      event.department_id !== null &&
      user.role !== ROLES.SYSTEM_ADMIN &&
      event.department_id !== user.departmentId
    ) {
      res.status(403).json({
        error: 'Forbidden: You cannot access documents from another department',
      });
      return;
    }

    // 2. Fetch document record
    const [docs] = await pool.query<any[]>(
      `SELECT * FROM event_documents WHERE id = ? AND event_id = ?`,
      [docId, eventId]
    );

    if (docs.length === 0) {
      res.status(404).json({ error: 'Document not found for this event' });
      return;
    }

    const document = docs[0];
    const safeFilePath = getSafeFilePath(document.file_identifier);

    // Verify physical file exists
    try {
      await fs.access(safeFilePath);
    } catch {
      res.status(404).json({ error: 'Physical document file not found in storage' });
      return;
    }

    // Safe download streaming
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.original_name)}"`
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    res.sendFile(safeFilePath);
  } catch (error: any) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download event document' });
  }
}

/**
 * Deletes an attached event document from MySQL and storage.
 */
export async function deleteEventDocument(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  const docId = parseId(req.params.docId);

  if (isNaN(eventId) || isNaN(docId)) {
    res.status(400).json({ error: 'Invalid event or document ID' });
    return;
  }

  try {
    // 1. Fetch document and event
    const [docs] = await pool.query<any[]>(
      `SELECT ed.*, e.creator_id AS eventCreatorId, e.department_id AS eventDeptId
       FROM event_documents ed
       JOIN academic_events e ON ed.event_id = e.id
       WHERE ed.id = ? AND ed.event_id = ?`,
      [docId, eventId]
    );

    if (docs.length === 0) {
      res.status(404).json({ error: 'Document not found for this event' });
      return;
    }

    const document = docs[0];

    // Authorization: Uploader, Event Creator, or Department HOD
    const isUploader = document.uploader_id === user.id;
    const isEventCreator = document.eventCreatorId === user.id;
    const isDepartmentHOD =
      user.role === ROLES.HOD && document.eventDeptId === user.departmentId;
    const isAdmin = user.role === ROLES.SYSTEM_ADMIN;

    if (!isUploader && !isEventCreator && !isDepartmentHOD && !isAdmin) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to delete this document',
      });
      return;
    }

    // 2. Delete database record
    await pool.query(`DELETE FROM event_documents WHERE id = ?`, [docId]);

    // 3. Remove from storage
    await deleteStoredFile(document.file_identifier);

    res.json({ message: 'Document deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete event document' });
  }
}

/**
 * Returns eligible faculty members in user's department for attendee selection.
 */
export async function getEligibleParticipants(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    let query = `
      SELECT id, full_name AS fullName, email, role, department_id AS departmentId
      FROM users
      WHERE is_active = 1
    `;
    const params: any[] = [];

    if (user.role !== ROLES.SYSTEM_ADMIN) {
      query += ` AND department_id = ?`;
      params.push(user.departmentId);
    }

    query += ` ORDER BY full_name ASC`;

    const [faculty] = await pool.query<any[]>(query, params);
    res.json({ faculty });
  } catch (error: any) {
    console.error('Error fetching eligible participants:', error);
    res.status(500).json({ error: 'Failed to retrieve eligible participants' });
  }
}
