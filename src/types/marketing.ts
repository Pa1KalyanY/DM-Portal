// Digital Marketing Type Definitions for Unified Platform
import { CompanyName } from './masterDatabase';
export type { CompanyName };

export type CompanyTag = CompanyName | 'Shared';

export type BreakType = 'Lunch' | 'Tea Break' | 'Personal' | 'Other';
export type AttendanceStatus = 'Present' | 'Late' | 'Half-day' | 'Absent';
export type TaskPriority = 'Urgent' | 'High' | 'Medium' | 'Low';
export type TaskStatus = 'Backlog' | 'In Progress' | 'Review' | 'Completed';
export type ApprovalStatus = 'Draft' | 'Under Review' | 'Changes Requested' | 'Approved' | 'Published' | 'Rejected';
export type SocialChannel = 'LinkedIn' | 'Twitter' | 'Instagram' | 'Facebook' | 'Blog';

export interface MarketingMember {
  id: string;
  name: string;
  email: string;
  designation: string;
  companyAccess: CompanyName[];
  isActive: boolean;
  avatarInitials?: string;
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  memberName: string;
  company: CompanyTag;
  workDate: string; // YYYY-MM-DD
  checkInTime: string; // ISO String
  checkOutTime?: string | null;
  checkOut?: string | null; // Compatibility alias
  totalHours?: number;
  status: AttendanceStatus;
  notes?: string;
  breaks: BreakRecord[];
}

export interface BreakRecord {
  id: string;
  attendanceId: string;
  breakType: BreakType;
  startTime: string; // ISO String
  endTime?: string | null;
  durationMinutes?: number;
}

export interface MarketingTask {
  id: string;
  company: CompanyTag;
  title: string;
  description: string;
  assignedToId: string;
  assignedToName: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface ContentPost {
  id: string;
  company: CompanyTag;
  channel: SocialChannel;
  title: string;
  content: string;
  mediaUrls?: string[];
  scheduledFor: string; // ISO string
  approvalStatus: ApprovalStatus;
  status?: ApprovalStatus | string; // Compatibility alias
  authorId: string;
  authorName: string;
  reviewerId?: string | null;
  reviewerName?: string | null;
  reviewerFeedback?: string | null;
  publishedAt?: string | null;
  livePostUrl?: string | null;
  createdAt: string;
}

export interface DailyReport {
  id: string;
  memberId: string;
  memberName: string;
  company: CompanyTag;
  reportDate: string; // YYYY-MM-DD
  date?: string; // Compatibility alias
  tasksCompleted: string;
  inProgressTasks: string;
  blockers: string;
  keyLearnings?: string;
  hoursWorked?: number;
  createdAt: string;
}

export interface MarketingCompanySettings {
  company: CompanyName;
  maxDailyBreakMinutes: number; // e.g. 60
  allowedBreakTypes: BreakType[];
  requireEodReport: boolean;
  standardWorkHoursPerDay: number; // e.g. 8
}

export interface MarketingPortalSettings {
  maxDailyBreakMinutes: number; // e.g. 60
  allowedBreakTypes: BreakType[];
  requireEodReport: boolean;
  standardWorkHoursPerDay: number; // e.g. 8
}

