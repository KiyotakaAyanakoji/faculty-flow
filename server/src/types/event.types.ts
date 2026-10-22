import { EventCategory, ParticipantStatus } from '../constants/roles.js';

export interface EventParticipant {
  id: number;
  eventId: number;
  userId: number;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  status: ParticipantStatus;
  createdAt: string;
}

export interface EventDocument {
  id: number;
  eventId: number;
  fileIdentifier: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploaderId: number;
  uploaderName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicEvent {
  id: number;
  title: string;
  description: string | null;
  category: EventCategory;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location: string | null;
  meetingLink: string | null;
  departmentId: number | null;
  departmentName?: string | null;
  departmentCode?: string | null;
  creatorId: number;
  creatorName?: string;
  creatorEmail?: string;
  participants?: EventParticipant[];
  documents?: EventDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  category: EventCategory;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  location?: string | null;
  meetingLink?: string | null;
  departmentId?: number | null;
  participantIds?: number[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  category?: EventCategory;
  startTime?: string;
  endTime?: string;
  isAllDay?: boolean;
  location?: string | null;
  meetingLink?: string | null;
  participantIds?: number[];
}
