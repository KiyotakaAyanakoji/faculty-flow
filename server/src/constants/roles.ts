export const ROLES = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  HOD: 'HOD',
  PROFESSOR: 'PROFESSOR',
  ASSISTANT_PROFESSOR: 'ASSISTANT_PROFESSOR',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ALL_ROLES: Role[] = [
  ROLES.SYSTEM_ADMIN,
  ROLES.HOD,
  ROLES.PROFESSOR,
  ROLES.ASSISTANT_PROFESSOR,
];

export const TASK_CATEGORIES = {
  TEACHING: 'Teaching',
  RESEARCH: 'Research',
  GRADING: 'Grading',
  MEETINGS: 'Meetings',
  ADMINISTRATIVE: 'Administrative',
} as const;

export type TaskCategory = typeof TASK_CATEGORIES[keyof typeof TASK_CATEGORIES];

export const ALL_TASK_CATEGORIES: TaskCategory[] = [
  TASK_CATEGORIES.TEACHING,
  TASK_CATEGORIES.RESEARCH,
  TASK_CATEGORIES.GRADING,
  TASK_CATEGORIES.MEETINGS,
  TASK_CATEGORIES.ADMINISTRATIVE,
];

export const TASK_PRIORITIES = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
} as const;

export type TaskPriority = typeof TASK_PRIORITIES[keyof typeof TASK_PRIORITIES];

export const ALL_TASK_PRIORITIES: TaskPriority[] = [
  TASK_PRIORITIES.LOW,
  TASK_PRIORITIES.MEDIUM,
  TASK_PRIORITIES.HIGH,
];

export const TASK_STATUSES = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
} as const;

export type TaskStatus = typeof TASK_STATUSES[keyof typeof TASK_STATUSES];

export const ALL_TASK_STATUSES: TaskStatus[] = [
  TASK_STATUSES.PENDING,
  TASK_STATUSES.IN_PROGRESS,
  TASK_STATUSES.COMPLETED,
];

export const SYLLABUS_STATUSES = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
} as const;

export type SyllabusStatus = typeof SYLLABUS_STATUSES[keyof typeof SYLLABUS_STATUSES];

export const ALL_SYLLABUS_STATUSES: SyllabusStatus[] = [
  SYLLABUS_STATUSES.DRAFT,
  SYLLABUS_STATUSES.IN_PROGRESS,
  SYLLABUS_STATUSES.COMPLETED,
];

export const HANDOVER_STATUSES = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
} as const;

export type HandoverStatus = typeof HANDOVER_STATUSES[keyof typeof HANDOVER_STATUSES];

export const ALL_HANDOVER_STATUSES: HandoverStatus[] = [
  HANDOVER_STATUSES.PENDING,
  HANDOVER_STATUSES.ACCEPTED,
  HANDOVER_STATUSES.REJECTED,
  HANDOVER_STATUSES.COMPLETED,
];

export const EVENT_CATEGORIES = {
  EXAM: 'Exam',
  MEETING: 'Meeting',
  HOLIDAY: 'Holiday',
  SUBMISSION: 'Submission',
  CONFERENCE: 'Conference',
  WORKSHOP: 'Workshop',
  CLUB: 'Club',
} as const;

export type EventCategory = typeof EVENT_CATEGORIES[keyof typeof EVENT_CATEGORIES];

export const ALL_EVENT_CATEGORIES: EventCategory[] = [
  EVENT_CATEGORIES.EXAM,
  EVENT_CATEGORIES.MEETING,
  EVENT_CATEGORIES.HOLIDAY,
  EVENT_CATEGORIES.SUBMISSION,
  EVENT_CATEGORIES.CONFERENCE,
  EVENT_CATEGORIES.WORKSHOP,
  EVENT_CATEGORIES.CLUB,
];

export const PARTICIPANT_STATUSES = {
  INVITED: 'Invited',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  TENTATIVE: 'Tentative',
} as const;

export type ParticipantStatus = typeof PARTICIPANT_STATUSES[keyof typeof PARTICIPANT_STATUSES];

export const ALL_PARTICIPANT_STATUSES: ParticipantStatus[] = [
  PARTICIPANT_STATUSES.INVITED,
  PARTICIPANT_STATUSES.ACCEPTED,
  PARTICIPANT_STATUSES.DECLINED,
  PARTICIPANT_STATUSES.TENTATIVE,
];

/**
 * Permitted task categories per role:
 * - HOD: All 5 categories (Teaching, Research, Grading, Meetings, Administrative)
 * - Professor: Teaching, Research, Grading, Meetings (Administrative prohibited)
 * - Assistant Professor: Teaching, Research, Grading (only when canAssignWork is enabled; otherwise none)
 * - System Admin: System/administrative role only, cannot allocate academic faculty tasks
 */
export function getPermittedTaskCategories(role: Role, canAssignWork = false): TaskCategory[] {
  switch (role) {
    case ROLES.HOD:
      return [
        TASK_CATEGORIES.TEACHING,
        TASK_CATEGORIES.RESEARCH,
        TASK_CATEGORIES.GRADING,
        TASK_CATEGORIES.MEETINGS,
        TASK_CATEGORIES.ADMINISTRATIVE,
      ];
    case ROLES.PROFESSOR:
      return [
        TASK_CATEGORIES.TEACHING,
        TASK_CATEGORIES.RESEARCH,
        TASK_CATEGORIES.GRADING,
        TASK_CATEGORIES.MEETINGS,
      ];
    case ROLES.ASSISTANT_PROFESSOR:
      return canAssignWork
        ? [TASK_CATEGORIES.TEACHING, TASK_CATEGORIES.RESEARCH, TASK_CATEGORIES.GRADING]
        : [];
    case ROLES.SYSTEM_ADMIN:
      // System Admin manages accounts/departments, not academic faculty allocations
      return [];
    default:
      return [];
  }
}

/**
 * Verifies if an actor can allocate a specific task category
 */
export function canAllocateTaskCategory(
  role: Role,
  canAssignWork: boolean,
  category: TaskCategory
): boolean {
  const permitted = getPermittedTaskCategories(role, canAssignWork);
  return permitted.includes(category);
}

/**
 * Validates cross-department and role hierarchy allocation rules:
 * - Actor and target must belong to the same department
 * - HOD can allocate to Professor and Assistant Professor within their department
 * - Professor can allocate to Assistant Professor within their department
 * - Assistant Professor (if authorized) can allocate to Assistant Professor within their department
 * - System Admin cannot allocate academic work
 */
export function canAllocateToTargetFaculty(
  actor: { role: Role; departmentId: number | null; canAssignWork: boolean },
  target: { role: Role; departmentId: number | null },
  category?: TaskCategory
): { allowed: boolean; reason?: string } {
  // 1. System Admin check
  if (actor.role === ROLES.SYSTEM_ADMIN) {
    return {
      allowed: false,
      reason: 'System Admin accounts manage infrastructure and cannot allocate departmental tasks.',
    };
  }

  // 2. Department match check
  if (!actor.departmentId || !target.departmentId || actor.departmentId !== target.departmentId) {
    return {
      allowed: false,
      reason: 'Cross-department task allocation is strictly prohibited.',
    };
  }

  // 3. Assistant Professor default denial check
  if (actor.role === ROLES.ASSISTANT_PROFESSOR && !actor.canAssignWork) {
    return {
      allowed: false,
      reason: 'Assignment permissions are denied by default for Assistant Professors unless explicitly enabled.',
    };
  }

  // 4. Role hierarchy check
  if (actor.role === ROLES.HOD) {
    // HOD can allocate to any departmental faculty (Professors, Assistant Professors, or self)
  } else if (actor.role === ROLES.PROFESSOR) {
    // Professor can allocate permitted work to eligible Assistant Professors in the same department
    if (target.role !== ROLES.ASSISTANT_PROFESSOR && target.role !== ROLES.PROFESSOR) {
      return {
        allowed: false,
        reason: 'Professors can only allocate work to Assistant Professors or peers.',
      };
    }
  } else if (actor.role === ROLES.ASSISTANT_PROFESSOR) {
    if (target.role !== ROLES.ASSISTANT_PROFESSOR) {
      return {
        allowed: false,
        reason: 'Authorized Assistant Professors can only delegate to fellow Assistant Professors.',
      };
    }
  } else {
    return { allowed: false, reason: 'Unauthorized allocation attempt.' };
  }

  // 5. Category permission check (if explicitly provided for backward compatibility)
  if (category && !canAllocateTaskCategory(actor.role, actor.canAssignWork, category)) {
    return {
      allowed: false,
      reason: `Role '${actor.role}' is not authorized to allocate '${category}' tasks.`,
    };
  }

  return { allowed: true };
}
