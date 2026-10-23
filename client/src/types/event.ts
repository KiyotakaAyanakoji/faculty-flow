export type EventCategory =
  | 'Exam'
  | 'Meeting'
  | 'Holiday'
  | 'Submission'
  | 'Conference'
  | 'Workshop'
  | 'Club';

export interface IndianHoliday {
  id: number;
  name: string;
  date: string;
  year: number;
  holidayType: 'National Holiday' | 'Gazetted Festival';
  description: string | null;
  sourceKey: string;
}

export type ParticipantStatus = 'Invited' | 'Accepted' | 'Declined' | 'Tentative';

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
  participantCount?: number;
  documentCount?: number;
  participants?: EventParticipant[];
  documents?: EventDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface EligibleFaculty {
  id: number;
  fullName: string;
  email: string;
  role: string;
  departmentId: number;
}

export interface PersonalEvent {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string;
  endTime: string | null;
  isPersonal?: boolean;
  category?: 'Personal';
  createdAt?: string;
  updatedAt?: string;
}

