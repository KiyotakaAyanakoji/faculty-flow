export type HandoverStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Completed';

export interface Handover {
  id: number;
  title: string;
  notes: string;
  responseNotes: string | null;
  status: HandoverStatus;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: number;
    fullName: string;
    email: string;
    role: string;
  };
  recipient: {
    id: number;
    fullName: string;
    email: string;
    role: string;
  };
  department: {
    id: number;
    name: string;
    code: string;
  };
  task: {
    id: number;
    title: string;
    status: string;
    category: string;
  } | null;
}
