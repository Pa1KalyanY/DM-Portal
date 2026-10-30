import {
  MarketingMember,
  AttendanceRecord,
  BreakRecord,
  MarketingTask,
  ContentPost,
  DailyReport,
  MarketingCompanySettings,
  MarketingPortalSettings,
  CompanyTag,
  BreakType,
  CompanyName,
  TaskStatus,
  ApprovalStatus,
} from '../types/marketing';
import { getSupabaseClient } from './supabase';
import { generateUuid } from '../shared/uuid';

const STORAGE_KEYS = {
  MEMBERS: 'aat_mkt_members_v1',
  ATTENDANCE: 'aat_mkt_attendance_v1',
  TASKS: 'aat_mkt_tasks_v1',
  POSTS: 'aat_mkt_posts_v1',
  REPORTS: 'aat_mkt_reports_v1',
  SETTINGS: 'aat_mkt_settings_v1',
  PORTAL_SETTINGS: 'aat_mkt_portal_settings_v1',
  ACTIVE_SESSION: 'aat_mkt_active_session_v1',
};


// 5 Dedicated Marketing Team Members with Dual-Company Access
export const INITIAL_MARKETING_TEAM: MarketingMember[] = [
  {
    id: 'mkt-001',
    name: 'Sarah Jenkins',
    email: 'sarah.j@aaratech.com',
    designation: 'Marketing Lead',
    companyAccess: ['AaraTech', 'ClinisolTech'],
    isActive: true,
    avatarInitials: 'SJ',
  },
  {
    id: 'mkt-002',
    name: 'David Chen',
    email: 'david.c@aaratech.com',
    designation: 'Content Strategist',
    companyAccess: ['AaraTech', 'ClinisolTech'],
    isActive: true,
    avatarInitials: 'DC',
  },
  {
    id: 'mkt-003',
    name: 'Priya Sharma',
    email: 'priya.s@clinisoltech.com',
    designation: 'Social Media Manager',
    companyAccess: ['AaraTech', 'ClinisolTech'],
    isActive: true,
    avatarInitials: 'PS',
  },
  {
    id: 'mkt-004',
    name: 'Marcus Vance',
    email: 'marcus.v@aaratech.com',
    designation: 'SEO & Performance Specialist',
    companyAccess: ['AaraTech', 'ClinisolTech'],
    isActive: true,
    avatarInitials: 'MV',
  },
  {
    id: 'mkt-005',
    name: 'Elena Rostova',
    email: 'elena.r@clinisoltech.com',
    designation: 'Creative Designer',
    companyAccess: ['AaraTech', 'ClinisolTech'],
    isActive: true,
    avatarInitials: 'ER',
  },
];

export const DEFAULT_SETTINGS: Record<CompanyName, MarketingCompanySettings> = {
  AaraTech: {
    company: 'AaraTech',
    maxDailyBreakMinutes: 60,
    allowedBreakTypes: ['Lunch', 'Tea Break', 'Personal', 'Other'],
    requireEodReport: true,
    standardWorkHoursPerDay: 8,
  },
  ClinisolTech: {
    company: 'ClinisolTech',
    maxDailyBreakMinutes: 60,
    allowedBreakTypes: ['Lunch', 'Tea Break', 'Personal', 'Other'],
    requireEodReport: true,
    standardWorkHoursPerDay: 8,
  },
};

export const DEFAULT_PORTAL_SETTINGS: MarketingPortalSettings = {
  maxDailyBreakMinutes: 60,
  allowedBreakTypes: ['Lunch', 'Tea Break', 'Personal', 'Other'],
  requireEodReport: true,
  standardWorkHoursPerDay: 8,
};


// Seed Tasks
const INITIAL_TASKS: MarketingTask[] = [
  {
    id: 'task-001',
    company: 'AaraTech',
    title: 'Q4 Talent Outreach Campaign Launch',
    description: 'Prepare LinkedIn sponsored updates and copy for senior AI engineering roles.',
    assignedToId: 'mkt-001',
    assignedToName: 'Sarah Jenkins',
    priority: 'Urgent',
    status: 'In Progress',
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-002',
    company: 'AaraTech',
    title: 'Technical Case Study: Cloud Migration Services',
    description: 'Draft 1,200-word engineering case study highlighting microservices architecture.',
    assignedToId: 'mkt-002',
    assignedToName: 'David Chen',
    priority: 'High',
    status: 'Backlog',
    dueDate: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-003',
    company: 'ClinisolTech',
    title: 'Clinical Data Management Webinar Promotion',
    description: 'Create multi-channel promotion banner set and landing page announcement.',
    assignedToId: 'mkt-003',
    assignedToName: 'Priya Sharma',
    priority: 'High',
    status: 'In Progress',
    dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-004',
    company: 'ClinisolTech',
    title: 'Biostatistician Hiring Infographic',
    description: 'Design clinical research talent landscape graphic for LinkedIn carousel.',
    assignedToId: 'mkt-005',
    assignedToName: 'Elena Rostova',
    priority: 'Medium',
    status: 'Review',
    dueDate: new Date(Date.now() + 86400000 * 1).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Seed Content Posts
const INITIAL_POSTS: ContentPost[] = [
  {
    id: 'post-001',
    company: 'AaraTech',
    channel: 'LinkedIn',
    title: 'Navigating Modern Cloud Architecture in 2026',
    content: 'Cloud infrastructure continues to evolve with hybrid AI deployment models. How is your engineering team optimizing cost and latency? Read our insights.',
    scheduledFor: new Date(Date.now() + 86400000 * 1).toISOString(),
    approvalStatus: 'Approved',
    authorId: 'mkt-002',
    authorName: 'David Chen',
    reviewerId: 'mkt-001',
    reviewerName: 'Sarah Jenkins',
    reviewerFeedback: 'Looks great! Ready to publish on scheduled slot.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'post-002',
    company: 'ClinisolTech',
    channel: 'LinkedIn',
    title: 'Accelerating Phase III Clinical Trials with Validated EDC Pipelines',
    content: 'Data precision and GxP regulatory compliance drive successful therapeutic breakthroughs. ClinisolTech delivers expert SAS programming and CDISC standards.',
    scheduledFor: new Date(Date.now() + 86400000 * 2).toISOString(),
    approvalStatus: 'Under Review',
    authorId: 'mkt-003',
    authorName: 'Priya Sharma',
    createdAt: new Date().toISOString(),
  },
];

function getStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('marketing-data-updated', { detail: { key } }));
    }
  } catch (e) {
    console.error('Storage write error:', e);
  }
}

export const MarketingService = {
  // Members
  async getMembers(): Promise<MarketingMember[]> {
    const local = getStored<MarketingMember[]>(STORAGE_KEYS.MEMBERS, INITIAL_MARKETING_TEAM);
    // Background Supabase sync attempt
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client.from('marketing_members').select('*');
        if (!error && data && data.length > 0) {
          const mapped: MarketingMember[] = data.map((d: any) => ({
            id: d.id,
            name: d.full_name,
            email: d.email,
            designation: d.role,
            companyAccess: (d.allowed_companies as CompanyName[]) || ['AaraTech', 'ClinisolTech'],
            isActive: d.is_active,
            avatarInitials: d.full_name
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase(),
          }));
          setStored(STORAGE_KEYS.MEMBERS, mapped);
          return mapped;
        }
      } catch {
        // Fallback to local
      }
    }
    return local;
  },

  // Active Session & Attendance
  getActiveAttendance(memberId: string): AttendanceRecord | null {
    const all = getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const today = new Date().toISOString().split('T')[0];
    const match = all.find((a) => a.memberId === memberId && a.workDate === today && !a.checkOutTime);
    return match || null;
  },

  getAllAttendance(companyFilter?: CompanyName | 'All' | 'Shared', dateFilter?: string): AttendanceRecord[] {
    const all = getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    return all.filter((a) => {
      const companyMatch =
        !companyFilter || companyFilter === 'All'
          ? true
          : a.company === companyFilter || a.company === 'Shared';
      const dateMatch = dateFilter ? a.workDate === dateFilter : true;
      return companyMatch && dateMatch;
    });
  },

  async clockIn(member: MarketingMember, company: CompanyTag = 'Shared', notes?: string): Promise<AttendanceRecord> {
    const today = new Date().toISOString().split('T')[0];
    const all = getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);

    // Check if already clocked in today
    const existing = all.find((a) => a.memberId === member.id && a.workDate === today && !a.checkOutTime);
    if (existing) {
      return existing;
    }

    const newRecord: AttendanceRecord = {
      id: generateUuid(),
      memberId: member.id,
      memberName: member.name,
      company,
      workDate: today,
      checkInTime: new Date().toISOString(),
      checkOutTime: null,
      status: 'Present',
      notes,
      breaks: [],
    };

    all.unshift(newRecord);
    setStored(STORAGE_KEYS.ATTENDANCE, all);

    // Sync to Supabase in background
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('marketing_attendance').insert({
          id: newRecord.id,
          member_id: member.id,
          company,
          work_date: today,
          check_in_at: newRecord.checkInTime,
          status: 'Active',
          notes,
        });
      } catch {
        // Ignored, local is authoritative
      }
    }

    return newRecord;
  },

  async clockOut(recordId: string): Promise<AttendanceRecord | null> {
    const all = getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const idx = all.findIndex((a) => a.id === recordId);
    if (idx === -1) return null;

    const record = all[idx];
    const now = new Date();
    record.checkOutTime = now.toISOString();

    // End any active break
    record.breaks.forEach((b) => {
      if (!b.endTime) {
        b.endTime = now.toISOString();
        const start = new Date(b.startTime).getTime();
        b.durationMinutes = Math.round((now.getTime() - start) / 60000);
      }
    });

    const checkIn = new Date(record.checkInTime).getTime();
    const totalMs = now.getTime() - checkIn;
    const breakMs = record.breaks.reduce((acc, b) => acc + (b.durationMinutes || 0) * 60000, 0);
    record.totalHours = Math.max(0, parseFloat(((totalMs - breakMs) / 3600000).toFixed(2)));

    all[idx] = record;
    setStored(STORAGE_KEYS.ATTENDANCE, all);

    const client = getSupabaseClient();
    if (client) {
      try {
        await client
          .from('marketing_attendance')
          .update({
            check_out_at: record.checkOutTime,
            total_work_minutes: Math.round(record.totalHours * 60),
            status: 'Completed',
          })
          .eq('id', recordId);
      } catch {}
    }

    return record;
  },

  async startBreak(attendanceId: string, breakType: BreakType): Promise<AttendanceRecord | null> {
    const all = getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const idx = all.findIndex((a) => a.id === attendanceId);
    if (idx === -1) return null;

    const record = all[idx];
    const now = new Date();

    // Prevent overlapping breaks: close any active open break first
    record.breaks.forEach((b) => {
      if (!b.endTime) {
        b.endTime = now.toISOString();
        const start = new Date(b.startTime).getTime();
        b.durationMinutes = Math.max(0, Math.round((now.getTime() - start) / 60000));
      }
    });

    const newBreak: BreakRecord = {
      id: generateUuid(),
      attendanceId,
      breakType,
      startTime: now.toISOString(),
      endTime: null,
      durationMinutes: 0,
    };

    record.breaks.push(newBreak);
    all[idx] = record;
    setStored(STORAGE_KEYS.ATTENDANCE, all);

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('marketing_breaks').insert({
          id: newBreak.id,
          attendance_id: attendanceId,
          member_id: record.memberId,
          break_type: breakType,
          started_at: newBreak.startTime,
        });
      } catch {}
    }

    return record;
  },

  async endBreak(attendanceId: string): Promise<AttendanceRecord | null> {
    const all = getStored<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
    const idx = all.findIndex((a) => a.id === attendanceId);
    if (idx === -1) return null;

    const record = all[idx];
    const now = new Date();
    const activeBreak = record.breaks.find((b) => !b.endTime);

    if (activeBreak) {
      activeBreak.endTime = now.toISOString();
      const start = new Date(activeBreak.startTime).getTime();
      activeBreak.durationMinutes = Math.max(1, Math.round((now.getTime() - start) / 60000));

      all[idx] = record;
      setStored(STORAGE_KEYS.ATTENDANCE, all);

      const client = getSupabaseClient();
      if (client) {
        try {
          await client
            .from('marketing_breaks')
            .update({
              ended_at: activeBreak.endTime,
              duration_minutes: activeBreak.durationMinutes,
            })
            .eq('id', activeBreak.id);
        } catch {}
      }
    }

    return record;
  },

  // Tasks
  getTasks(companyFilter?: CompanyName | 'All' | 'Shared'): MarketingTask[] {
    const all = getStored<MarketingTask[]>(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    if (!companyFilter || companyFilter === 'All') return all;
    return all.filter((t) => t.company === companyFilter || t.company === 'Shared');
  },

  async createTask(task: Omit<MarketingTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<MarketingTask> {
    return this.saveTask(task);
  },

  async saveTask(task: Omit<MarketingTask, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<MarketingTask> {
    const all = getStored<MarketingTask[]>(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const now = new Date().toISOString();

    if (id) {
      const idx = all.findIndex((t) => t.id === id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...task, updatedAt: now };
        setStored(STORAGE_KEYS.TASKS, all);
        return all[idx];
      }
    }

    const newTask: MarketingTask = {
      ...task,
      id: generateUuid(),
      createdAt: now,
      updatedAt: now,
    };
    all.unshift(newTask);
    setStored(STORAGE_KEYS.TASKS, all);
    return newTask;
  },

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const all = getStored<MarketingTask[]>(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const item = all.find((t) => t.id === taskId);
    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
      setStored(STORAGE_KEYS.TASKS, all);
    }
  },

  async deleteTask(taskId: string): Promise<void> {
    const all = getStored<MarketingTask[]>(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    const filtered = all.filter((t) => t.id !== taskId);
    setStored(STORAGE_KEYS.TASKS, filtered);
  },

  // Content Calendar & Posts
  getContentPosts(companyFilter?: CompanyName | 'All' | 'Shared'): ContentPost[] {
    const all = getStored<ContentPost[]>(STORAGE_KEYS.POSTS, INITIAL_POSTS);
    if (!companyFilter || companyFilter === 'All') return all;
    return all.filter((p) => p.company === companyFilter || p.company === 'Shared');
  },

  async createContentPost(
    post: Omit<ContentPost, 'id' | 'createdAt' | 'approvalStatus'> & { approvalStatus?: ApprovalStatus }
  ): Promise<ContentPost> {
    return this.saveContentPost({
      ...post,
      approvalStatus: post.approvalStatus || 'Draft',
    });
  },

  async saveContentPost(post: Omit<ContentPost, 'id' | 'createdAt'>, id?: string): Promise<ContentPost> {
    const all = getStored<ContentPost[]>(STORAGE_KEYS.POSTS, INITIAL_POSTS);
    const now = new Date().toISOString();

    if (id) {
      const idx = all.findIndex((p) => p.id === id);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...post };
        setStored(STORAGE_KEYS.POSTS, all);
        return all[idx];
      }
    }

    const newPost: ContentPost = {
      ...post,
      id: generateUuid(),
      createdAt: now,
    };
    all.unshift(newPost);
    setStored(STORAGE_KEYS.POSTS, all);
    return newPost;
  },

  async updatePostApproval(
    postId: string,
    status: ApprovalStatus,
    reviewer: MarketingMember,
    feedback?: string
  ): Promise<void> {
    const all = getStored<ContentPost[]>(STORAGE_KEYS.POSTS, INITIAL_POSTS);
    const item = all.find((p) => p.id === postId);
    if (item) {
      item.approvalStatus = status;
      item.reviewerId = reviewer.id;
      item.reviewerName = reviewer.name;
      item.reviewerFeedback = feedback || null;
      if (status === 'Published') {
        item.publishedAt = new Date().toISOString();
      }
      setStored(STORAGE_KEYS.POSTS, all);
    }
  },

  // Daily Work Reports
  getDailyReports(companyFilter?: CompanyName | 'All' | 'Shared', dateFilter?: string): DailyReport[] {
    const all = getStored<DailyReport[]>(STORAGE_KEYS.REPORTS, []);
    return all.filter((r) => {
      const matchComp =
        !companyFilter || companyFilter === 'All'
          ? true
          : r.company === companyFilter || r.company === 'Shared';
      const matchDate = dateFilter ? r.reportDate === dateFilter : true;
      return matchComp && matchDate;
    });
  },

  async submitDailyReport(report: Omit<DailyReport, 'id' | 'createdAt'> & { reportDate?: string; date?: string }): Promise<DailyReport> {
    const all = getStored<DailyReport[]>(STORAGE_KEYS.REPORTS, []);
    const reportDate = report.reportDate || report.date || new Date().toISOString().split('T')[0];
    const newReport: DailyReport = {
      ...report,
      reportDate,
      date: reportDate,
      id: generateUuid(),
      createdAt: new Date().toISOString(),
    };
    all.unshift(newReport);
    setStored(STORAGE_KEYS.REPORTS, all);

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('marketing_daily_reports').insert({
          id: newReport.id,
          member_id: newReport.memberId,
          member_name: newReport.memberName,
          company: newReport.company,
          report_date: newReport.reportDate,
          tasks_completed: newReport.tasksCompleted,
          tasks_in_progress: newReport.inProgressTasks,
          blockers: newReport.blockers,
          hours_logged: newReport.hoursWorked,
        });
      } catch {}
    }

    return newReport;
  },

  // Settings
  getPortalSettings(): MarketingPortalSettings {
    return getStored<MarketingPortalSettings>(STORAGE_KEYS.PORTAL_SETTINGS, DEFAULT_PORTAL_SETTINGS);
  },

  savePortalSettings(settings: MarketingPortalSettings): void {
    setStored(STORAGE_KEYS.PORTAL_SETTINGS, settings);
  },

  getCompanySettings(company: CompanyName): MarketingCompanySettings {
    const all = getStored<Record<CompanyName, MarketingCompanySettings>>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    return all[company] || DEFAULT_SETTINGS[company];
  },

  saveCompanySettings(settings: MarketingCompanySettings): void {
    const all = getStored<Record<CompanyName, MarketingCompanySettings>>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    all[settings.company] = settings;
    setStored(STORAGE_KEYS.SETTINGS, all);
  },
};
