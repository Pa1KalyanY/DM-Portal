import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  Coffee,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  FileText,
  Users,
  CheckSquare,
  Play,
  Briefcase
} from 'lucide-react';
import { MarketingService, INITIAL_MARKETING_TEAM } from '../../services/marketingService';
import { formatDateDisplay } from '../../shared/dateFormat';

import {
  MarketingTask,
  ContentPost,
  AttendanceRecord,
  DailyReport,
  MarketingMember,
  TaskStatus,
  ApprovalStatus,
} from '../../types/marketing';

interface DmPortalHomeProps {
  onNavigate: (section: string) => void;
}

export const DmPortalHomeView: React.FC<DmPortalHomeProps> = ({ onNavigate }) => {
  const [teamMembers, setTeamMembers] = useState<MarketingMember[]>(INITIAL_MARKETING_TEAM);
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [members, t, p, a, r] = await Promise.all([
          MarketingService.getMembers().catch(() => INITIAL_MARKETING_TEAM),
          Promise.resolve(MarketingService.getTasks('All')),
          Promise.resolve(MarketingService.getContentPosts('All')),
          Promise.resolve(MarketingService.getAllAttendance('All')),
          Promise.resolve(MarketingService.getDailyReports('All')),
        ]);
        if (isMounted) {
          setTeamMembers(members);
          setTasks(t);
          setPosts(p);
          setAttendance(a);
          setReports(r);
        }
      } catch (err) {
        console.error('Failed to load portal home data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('marketing-data-updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('marketing-data-updated', handleUpdate);
    };
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  // Tasks Analysis
  const overdueTasks = tasks.filter((t) => t.status !== 'Completed' && t.dueDate && t.dueDate < todayStr);
  const tasksDueToday = tasks.filter((t) => t.status !== 'Completed' && t.dueDate === todayStr);
  const inProgressTasks = tasks.filter((t) => t.status === 'In Progress');
  const completedTasks = tasks.filter((t) => t.status === 'Completed');

  // Content Analysis
  const pendingApprovalPosts = posts.filter((p) => p.approvalStatus === 'Under Review' || p.approvalStatus === 'Draft');
  const scheduledPosts = posts.filter((p) => p.approvalStatus === 'Approved' || p.approvalStatus === 'Published');

  // Attendance Analysis
  const activeCheckIns = attendance.filter((a) => !a.checkOutTime);
  const currentlyOnBreak = attendance.filter((a) => a.breaks.some((b) => !b.endTime));

  return (
    <div className="space-y-6">
      {/* Top Banner: Shared DM Portal Operations Context */}
      <div className="card-premium p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge-info">
                Shared DM Portal Operations
              </span>
              <span className="text-[#8995A8]">•</span>
              <span className="text-xs font-medium text-[#65738B]">Cross-Company Marketing Team</span>
            </div>
            <h1 className="text-xl font-bold text-[#18243A] tracking-tight">
              Digital Marketing &amp; Team Operations
            </h1>
            <p className="text-xs text-[#65738B] max-w-2xl">
              Real-time shared operations overview: Active team attendance, task deadlines, content approvals, and daily reports across all marketing workflows.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('marketing')}
              className="btn-primary"
            >
              <Sparkles className="w-4 h-4" />
              <span>Marketing Workspace</span>
            </button>
            <button
              onClick={() => onNavigate('recruitment-overview')}
              className="btn-secondary"
            >
              <Briefcase className="w-4 h-4 text-[#3659D9]" />
              <span>Open Recruitment Workspace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operations Metric Cards (Pure White Content Surfaces with Restrained Status Accents) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-medium">
            <span>Checked In Now</span>
            <Clock className="w-4 h-4 text-[#16836B]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {activeCheckIns.length} <span className="text-xs font-normal text-[#8995A8]">/ 5</span>
          </div>
          <p className="text-[11px] text-[#16836B] mt-0.5 font-medium">
            {currentlyOnBreak.length > 0 ? `${currentlyOnBreak.length} currently on break` : 'All at desk'}
          </p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Overdue Tasks</span>
            <AlertTriangle className="w-4 h-4 text-[#C44750]" />
          </div>
          <div className="text-2xl font-bold text-[#C44750] mt-2 tabular-nums">
            {overdueTasks.length}
          </div>
          <p className="text-[11px] text-[#C44750] mt-0.5 font-medium">Requires immediate action</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Tasks Due Today</span>
            <Calendar className="w-4 h-4 text-[#A66B19]" />
          </div>
          <div className="text-2xl font-bold text-[#A66B19] mt-2 tabular-nums">
            {tasksDueToday.length}
          </div>
          <p className="text-[11px] text-[#A66B19] mt-0.5 font-medium">Due before EOD</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>In Progress Tasks</span>
            <TrendingUp className="w-4 h-4 text-[#3659D9]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {inProgressTasks.length}
          </div>
          <p className="text-[11px] text-[#3659D9] mt-0.5 font-medium">Active team workload</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Pending Approvals</span>
            <FileText className="w-4 h-4 text-[#4A63C7]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {pendingApprovalPosts.length}
          </div>
          <p className="text-[11px] text-[#4A63C7] mt-0.5 font-medium">Content awaiting review</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>EOD Reports</span>
            <CheckCircle2 className="w-4 h-4 text-[#16836B]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {reports.length}
          </div>
          <p className="text-[11px] text-[#16836B] mt-0.5 font-medium">Submitted reports</p>
        </div>
      </div>

      {/* Main Grid: Tasks & Content Calendar / Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Tasks due today & Overdue tasks */}
        <div className="lg:col-span-2 space-y-6">
          {/* Urgent Tasks */}
          <div className="card-premium p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                  <span>Tasks Due Today &amp; Overdue</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tasks requiring immediate progress and resolution across marketing deliverables
                </p>
              </div>
              <button
                onClick={() => onNavigate('marketing')}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>All Tasks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {overdueTasks.length === 0 && tasksDueToday.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">All caught up!</p>
                <p className="text-[11px] text-slate-400">No overdue tasks or tasks due today across the marketing team.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {overdueTasks.map((t) => {
                  const assignee = teamMembers.find((m) => m.id === t.assignedToId);
                  return (
                    <div
                      key={t.id}
                      className="p-3 rounded-lg border border-rose-200/90 bg-rose-50/30 flex items-start justify-between gap-3 hover:bg-rose-50/50 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="badge-fail">
                            Overdue
                          </span>
                          {t.company && t.company !== 'Shared' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {t.company}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {t.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{t.description}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>Assignee: <strong className="text-slate-800">{assignee?.name || 'Unassigned'}</strong></span>
                          <span>Due: <strong className="text-rose-600 font-mono">{t.dueDate}</strong></span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-rose-200 text-rose-700 shrink-0">
                        {t.priority} Priority
                      </span>
                    </div>
                  );
                })}

                {tasksDueToday.map((t) => {
                  const assignee = teamMembers.find((m) => m.id === t.assignedToId);
                  return (
                    <div
                      key={t.id}
                      className="p-3 rounded-lg border border-amber-200/90 bg-amber-50/30 flex items-start justify-between gap-3 hover:bg-amber-50/50 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="badge-review">
                            Due Today
                          </span>
                          {t.company && t.company !== 'Shared' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {t.company}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {t.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{t.description}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>Assignee: <strong className="text-slate-800">{assignee?.name || 'Unassigned'}</strong></span>
                          <span>Status: <strong className="text-amber-700">{t.status}</strong></span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-700 shrink-0">
                        {t.priority} Priority
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Content Pipeline & Approvals */}
          <div className="card-premium p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Content Calendar &amp; Approvals</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Social media updates, blog articles, and scheduled releases across marketing channels
                </p>
              </div>
              <button
                onClick={() => onNavigate('marketing')}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Open Calendar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {posts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No content scheduled yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {posts.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2 hover:bg-slate-50 hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {p.channel}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        p.approvalStatus === 'Approved'
                          ? 'badge-pass'
                          : p.approvalStatus === 'Published'
                          ? 'badge-info'
                          : 'badge-review'
                      }`}>
                        {p.approvalStatus}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 line-clamp-1">{p.title}</h3>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{p.content}</p>
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 flex items-center justify-between">
                      <span>Scheduled: {formatDateDisplay(p.scheduledFor, 'N/A')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Attendance Status & Work Reports */}
        <div className="space-y-6">
          {/* Team Attendance Snapshot */}
          <div className="card-premium p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Attendance Status</span>
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                5 Team Members
              </span>
            </div>

            <div className="space-y-2">
              {teamMembers.map((m) => {
                const att = attendance.find((a) => a.memberId === m.id && !a.checkOutTime);
                const onBreak = att?.breaks.some((b) => !b.endTime);

                return (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                        {m.avatarInitials}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 leading-tight">{m.name}</div>
                        <div className="text-[10px] text-slate-400">{m.designation}</div>
                      </div>
                    </div>
                    <div>
                      {onBreak ? (
                        <span className="badge-review">
                          On Break
                        </span>
                      ) : att ? (
                        <span className="badge-pass">
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                          Offline
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Work Reports & Blockers */}
          <div className="card-premium p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>Recent Daily Reports</span>
              </h3>
              <button
                onClick={() => onNavigate('marketing')}
                className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
              >
                Submit EOD
              </button>
            </div>

            {reports.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No EOD reports logged yet today.</p>
            ) : (
              <div className="space-y-2">
                {reports.slice(0, 3).map((r) => {
                  const reporter = teamMembers.find((m) => m.id === r.memberId);
                  return (
                    <div
                      key={r.id}
                      className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 space-y-1.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">{reporter?.name || 'Team Member'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{r.reportDate || r.date}</span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        <strong className="text-slate-700">Completed:</strong> {r.tasksCompleted || 'N/A'}
                      </div>
                      {r.blockers && (
                        <div className="text-[11px] text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">
                          <strong>Blocker:</strong> {r.blockers}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
