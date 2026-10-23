import { Request, Response } from 'express';
import { pool } from '../config/database.js';
import {
  createPersonalEventSchema,
  updatePersonalEventSchema,
  personalEventQuerySchema,
} from '../validators/personal-event.validators.js';

function parseId(param: string | string[] | undefined): number {
  const val = Array.isArray(param) ? param[0] : param;
  return parseInt(String(val), 10);
}

/**
 * Lists personal events belonging strictly to the authenticated user.
 * Personal events are isolated from other faculty, HODs, and admins.
 */
export async function listPersonalEvents(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parseResult = personalEventQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { startDate, endDate } = parseResult.data;

  try {
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [user.id];

    if (startDate) {
      conditions.push('event_date >= ?');
      params.push(startDate.slice(0, 10));
    }

    if (endDate) {
      conditions.push('event_date <= ?');
      params.push(endDate.slice(0, 10));
    }

    const query = `
      SELECT 
        id,
        user_id AS userId,
        title,
        description,
        DATE_FORMAT(event_date, '%Y-%m-%d') AS eventDate,
        TIME_FORMAT(start_time, '%H:%i') AS startTime,
        TIME_FORMAT(end_time, '%H:%i') AS endTime,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM personal_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY event_date ASC, start_time ASC
    `;

    const [rows] = await pool.query<any[]>(query, params);

    res.json({
      success: true,
      events: rows.map(r => ({
        id: r.id,
        userId: r.userId,
        title: r.title,
        description: r.description,
        eventDate: r.eventDate,
        startTime: r.startTime,
        endTime: r.endTime || null,
        isPersonal: true,
        category: 'Personal',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total: rows.length,
    });
  } catch (error: any) {
    console.error('Error fetching personal events:', error);
    res.status(500).json({ error: 'Failed to retrieve personal events' });
  }
}

/**
 * Fetches a single personal event by ID with strict ownership verification.
 */
export async function getPersonalEventById(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid personal event ID' });
    return;
  }

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT 
        id,
        user_id AS userId,
        title,
        description,
        DATE_FORMAT(event_date, '%Y-%m-%d') AS eventDate,
        TIME_FORMAT(start_time, '%H:%i') AS startTime,
        TIME_FORMAT(end_time, '%H:%i') AS endTime,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM personal_events
      WHERE id = ?`,
      [eventId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Personal event not found' });
      return;
    }

    const event = rows[0];

    // Strict ownership enforcement: Cannot view other users' personal events
    if (event.userId !== user.id) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to view this personal event',
      });
      return;
    }

    res.json({
      success: true,
      event: {
        id: event.id,
        userId: event.userId,
        title: event.title,
        description: event.description,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime || null,
        isPersonal: true,
        category: 'Personal',
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error fetching personal event details:', error);
    res.status(500).json({ error: 'Failed to retrieve personal event details' });
  }
}

/**
 * Creates a personal calendar event for the authenticated user.
 */
export async function createPersonalEvent(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parseResult = createPersonalEventSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed for personal event',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const data = parseResult.data;

  try {
    const [result] = await pool.query<any>(
      `INSERT INTO personal_events 
        (user_id, title, description, event_date, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        data.title,
        data.description || null,
        data.eventDate,
        data.startTime ? data.startTime : null,
        data.endTime || null,
      ]
    );

    const newId = result.insertId;

    res.status(201).json({
      success: true,
      message: 'Personal event created successfully',
      event: {
        id: newId,
        userId: user.id,
        title: data.title,
        description: data.description || null,
        eventDate: data.eventDate,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        isPersonal: true,
        category: 'Personal',
      },
    });
  } catch (error: any) {
    console.error('Error creating personal event:', error);
    res.status(500).json({ error: 'Failed to create personal event' });
  }
}

/**
 * Updates a personal calendar event with strict ownership verification.
 */
export async function updatePersonalEvent(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid personal event ID' });
    return;
  }

  const parseResult = updatePersonalEventSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed for personal event update',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const data = parseResult.data;

  try {
    // 1. Fetch existing event
    const [existing] = await pool.query<any[]>(
      `SELECT * FROM personal_events WHERE id = ?`,
      [eventId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Personal event not found' });
      return;
    }

    const currentEvent = existing[0];

    // Strict ownership: only creator can update
    if (currentEvent.user_id !== user.id) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to update this personal event',
      });
      return;
    }

    // 2. Perform updates
    const updates: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description || null);
    }
    if (data.eventDate !== undefined) {
      updates.push('event_date = ?');
      values.push(data.eventDate);
    }
    if (data.startTime !== undefined) {
      updates.push('start_time = ?');
      values.push(data.startTime ? data.startTime : null);
    }
    if (data.endTime !== undefined) {
      updates.push('end_time = ?');
      values.push(data.endTime || null);
    }

    if (updates.length > 0) {
      values.push(eventId);
      await pool.query(
        `UPDATE personal_events SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // 3. Fetch updated event
    const [updatedRows] = await pool.query<any[]>(
      `SELECT 
        id,
        user_id AS userId,
        title,
        description,
        DATE_FORMAT(event_date, '%Y-%m-%d') AS eventDate,
        TIME_FORMAT(start_time, '%H:%i') AS startTime,
        TIME_FORMAT(end_time, '%H:%i') AS endTime,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM personal_events
      WHERE id = ?`,
      [eventId]
    );

    res.json({
      success: true,
      message: 'Personal event updated successfully',
      event: {
        ...updatedRows[0],
        isPersonal: true,
        category: 'Personal',
      },
    });
  } catch (error: any) {
    console.error('Error updating personal event:', error);
    res.status(500).json({ error: 'Failed to update personal event' });
  }
}

/**
 * Deletes a personal calendar event with strict ownership verification.
 */
export async function deletePersonalEvent(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const eventId = parseId(req.params.id);
  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid personal event ID' });
    return;
  }

  try {
    // 1. Fetch existing event
    const [existing] = await pool.query<any[]>(
      `SELECT * FROM personal_events WHERE id = ?`,
      [eventId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Personal event not found' });
      return;
    }

    const currentEvent = existing[0];

    // Strict ownership: only creator can delete
    if (currentEvent.user_id !== user.id) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to delete this personal event',
      });
      return;
    }

    await pool.query(`DELETE FROM personal_events WHERE id = ?`, [eventId]);

    res.json({
      success: true,
      message: 'Personal event deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting personal event:', error);
    res.status(500).json({ error: 'Failed to delete personal event' });
  }
}
