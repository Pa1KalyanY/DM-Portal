import React, { useState, useEffect } from 'react';
import {
  Clock,
  Coffee,
  CheckCircle2,
  Calendar,
  FileText,
  Users,
  AlertTriangle,
  Plus,
  Play,
  Square,
  Send,
  Sparkles,
  TrendingUp,
  Sliders,
  ThumbsUp,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import {
  MarketingService,
  INITIAL_MARKETING_TEAM,
} from '../../services/marketingService';
import {
  MarketingMember,
  AttendanceRecord,
  MarketingTask,
  ContentPost,
  DailyReport,
  MarketingPortalSettings,
  CompanyTag,
  BreakType,
  TaskPriority,
  TaskStatus,
  ApprovalStatus,
  SocialChannel,
} from '../../types/marketing';

import {
  readNavigationStateFromUrl,
  readPersistedBackupState,
  syncNavigationToUrlAndStorage,
} from '../../shared/navigationState';

export const MarketingWorkspaceView: React.FC = () => {
  const [activeTab, setActiveTabState] = useState<'attendance' | 'tasks' | 'content' | 'reports' | 'team'>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.mktTab) return urlState.mktTab;
    const backup = readPersistedBackupState();
    if (backup.mktTab) return backup.mktTab;
    return 'attendance';
  });

  const [companyTagFilter, setCompanyTagFilterState] = useState<'All' | 'AaraTech' | 'ClinisolTech' | 'Shared'>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.mktFilter) return urlState.mktFilter;
    const backup = readPersistedBackupState();
    if (backup.mktFilter) return backup.mktFilter;
    return 'All';
  });

  // Members
  const [teamMembers, setTeamMembers] = useState<MarketingMember[]>(INITIAL_MARKETING_TEAM);
  const [currentMember, setCurrentMemberState] = useState<MarketingMember>(() => {
    const urlState = readNavigationStateFromUrl();
    const backup = readPersistedBackupState();
    const targetId = urlState.mktMemberId || backup.mktMemberId;
    if (targetId) {
      const found = INITIAL_MARKETING_TEAM.find(m => m.id === targetId);
      if (found) return found;
    }
    return INITIAL_MARKETING_TEAM[0];
  });

  const setActiveTab = (tab: 'attendance' | 'tasks' | 'content' | 'reports' | 'team') => {
    setActiveTabState(tab);
    syncNavigationToUrlAndStorage({
      section: 'marketing',
      company: 'AaraTech',
      mktTab: tab,
      mktFilter: companyTagFilter,
      mktMemberId: currentMember.id,
    }, 'push');
  };

  const setCompanyTagFilter = (filter: 'All' | 'AaraTech' | 'ClinisolTech' | 'Shared') => {
    setCompanyTagFilterState(filter);
    syncNavigationToUrlAndStorage({
      section: 'marketing',
      company: 'AaraTech',
      mktTab: activeTab,
      mktFilter: filter,
      mktMemberId: currentMember.id,
    }, 'replace');
  };

  const setCurrentMember = (member: MarketingMember) => {
    setCurrentMemberState(member);
    syncNavigationToUrlAndStorage({
      section: 'marketing',
      company: 'AaraTech',
      mktTab: activeTab,
      mktFilter: companyTagFilter,
      mktMemberId: member.id,
    }, 'replace');
  };

  // Sync state to URL on mount
  useEffect(() => {
    syncNavigationToUrlAndStorage({
      section: 'marketing',
      company: 'AaraTech',
      mktTab: activeTab,
      mktFilter: companyTagFilter,
      mktMemberId: currentMember.id,
    }, 'replace');
  }, []);

  // Attendance & Breaks
  const [activeAttendance, setActiveAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [breakTimer, setBreakTimer] = useState<number>(0);
  const [clockInNotes, setClockInNotes] = useState('');

  // Tasks
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    company: 'Shared' as CompanyTag,
    assignedToId: INITIAL_MARKETING_TEAM[0].id,
    priority: 'Medium' as TaskPriority,
    status: 'In Progress' as TaskStatus,
    dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
  });

  // Content
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [postForm, setPostForm] = useState({
    title: '',
    content: '',
    company: 'Shared' as CompanyTag,
    channel: 'LinkedIn' as SocialChannel,
    scheduledFor: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16),
  });

  // Daily Reports
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [reportForm, setReportForm] = useState({
    company: 'Shared' as CompanyTag,
    tasksCompleted: '',
    inProgressTasks: '',
    blockers: '',
    keyLearnings: '',
    hoursWorked: 8.0,
  });
  const [reportSuccessMsg, setReportSuccessMsg] = useState(false);

  // Settings
  const [settings, setSettings] = useState<MarketingPortalSettings>(() =>
    MarketingService.getPortalSettings()
  );

  // Refresh data across the shared marketing workspace
  const refreshData = async () => {
    const members = await MarketingService.getMembers();
    setTeamMembers(members);

    const att = MarketingService.getActiveAttendance(currentMember.id);
    setActiveAttendance(att);
    setAttendanceList(MarketingService.getAllAttendance('All'));

    const tagFilter = companyTagFilter === 'All' ? 'All' : (companyTagFilter as any);
    setTasks(MarketingService.getTasks(tagFilter));
    setPosts(MarketingService.getContentPosts(tagFilter));
    setReports(MarketingService.getDailyReports(tagFilter));
    setSettings(MarketingService.getPortalSettings());
  };

  useEffect(() => {
    refreshData();

    const handleMarketingUpdate = () => {
      refreshData();
    };

    window.addEventListener('marketing-data-updated', handleMarketingUpdate);
    return () => {
      window.removeEventListener('marketing-data-updated', handleMarketingUpdate);
    };
  }, [currentMember, companyTagFilter]);

  // Live timer for active break
  useEffect(() => {
    const activeBreak = activeAttendance?.breaks.find((b) => !b.endTime);
    if (!activeBreak) {
      setBreakTimer(0);
      return;
    }

    const interval = setInterval(() => {
      const start = new Date(activeBreak.startTime).getTime();
      const diffSecs = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setBreakTimer(diffSecs);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeAttendance]);

  // Handlers
  const handleClockIn = async () => {
    await MarketingService.clockIn(currentMember, 'Shared', clockInNotes);
    setClockInNotes('');
    refreshData();
  };

  const handleClockOut = async () => {
    if (!activeAttendance) return;
    if (confirm('Are you sure you want to clock out for today?')) {
      await MarketingService.clockOut(activeAttendance.id);
      refreshData();
    }
  };

  const handleStartBreak = async (type: BreakType) => {
    if (!activeAttendance) return;
    await MarketingService.startBreak(activeAttendance.id, type);
    refreshData();
  };

  const handleEndBreak = async () => {
    if (!activeAttendance) return;
    await MarketingService.endBreak(activeAttendance.id);
    refreshData();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const assignee = teamMembers.find((m) => m.id === taskForm.assignedToId);
    await MarketingService.createTask({
      company: taskForm.company,
      title: taskForm.title,
      description: taskForm.description,
      assignedToId: taskForm.assignedToId,
      assignedToName: assignee?.name || 'Unassigned',
      priority: taskForm.priority,
      status: taskForm.status,
      dueDate: taskForm.dueDate,
    });
    setShowNewTaskModal(false);
    setTaskForm({
      title: '',
      description: '',
      company: 'Shared',
      assignedToId: teamMembers[0].id,
      priority: 'Medium',
      status: 'In Progress',
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    });
    refreshData();
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    await MarketingService.createContentPost({
      company: postForm.company,
      authorId: currentMember.id,
      authorName: currentMember.name,
      title: postForm.title,
      content: postForm.content,
      channel: postForm.channel,
      scheduledFor: postForm.scheduledFor,
    });
    setShowNewPostModal(false);
    setPostForm({
      title: '',
      content: '',
      company: 'Shared',
      channel: 'LinkedIn',
      scheduledFor: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16),
    });
    refreshData();
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    await MarketingService.submitDailyReport({
      memberId: currentMember.id,
      memberName: currentMember.name,
      company: reportForm.company,
      reportDate: new Date().toISOString().split('T')[0],
      tasksCompleted: reportForm.tasksCompleted,
      inProgressTasks: reportForm.inProgressTasks,
      blockers: reportForm.blockers,
      keyLearnings: reportForm.keyLearnings,
      hoursWorked: reportForm.hoursWorked,
    });
    setReportSuccessMsg(true);
    setTimeout(() => setReportSuccessMsg(false), 3000);
    setReportForm({
      company: 'Shared',
      tasksCompleted: '',
      inProgressTasks: '',
      blockers: '',
      keyLearnings: '',
      hoursWorked: 8.0,
    });
    refreshData();
  };


  const activeBreak = activeAttendance?.breaks.find((b) => !b.endTime);
  const activeBreakMinutes = Math.floor(breakTimer / 60);
  const isBreakExceeded =
    activeBreak &&
    ((activeBreak.breakType === 'Lunch' && activeBreakMinutes > 45) ||
      (activeBreak.breakType === 'Tea Break' && activeBreakMinutes > 15));

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero (Clean 2026 Light Theme) */}
      <div className="card-premium p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shadow-2xs">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  Digital Marketing Operations
                  <span className="badge-info">
                    Shared DM Portal
                  </span>
                </h1>
                <p className="text-slate-500 text-xs mt-0.5">
                  Operations &amp; Team Workload: Attendance, Break Compliance, Campaign Tasks, Content Calendar, and EOD Reporting.
                </p>
              </div>
            </div>
          </div>

          {/* Member Switcher */}
          <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg">
            <Users className="w-4 h-4 text-slate-500" />
            <div className="text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Active Member</span>
              <select
                value={currentMember.id}
                onChange={(e) => {
                  const m = teamMembers.find((item) => item.id === e.target.value);
                  if (m) setCurrentMember(m);
                }}
                className="bg-transparent text-slate-900 font-semibold focus:outline-none cursor-pointer"
              >
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id} className="text-slate-900">
                    {m.name} ({m.designation})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-[#3659D9] text-white shadow-xs'
                : 'text-[#65738B] hover:text-[#18243A] hover:bg-[#F1F4F9]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Attendance &amp; Breaks</span>
            {activeAttendance && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-[#3659D9] text-white shadow-xs'
                : 'text-[#65738B] hover:text-[#18243A] hover:bg-[#F1F4F9]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Task Management ({tasks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'content'
                ? 'bg-[#3659D9] text-white shadow-xs'
                : 'text-[#65738B] hover:text-[#18243A] hover:bg-[#F1F4F9]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Content Calendar &amp; Approvals ({posts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-[#3659D9] text-white shadow-xs'
                : 'text-[#65738B] hover:text-[#18243A] hover:bg-[#F1F4F9]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Daily Reports ({reports.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'team'
                ? 'bg-[#3659D9] text-white shadow-xs'
                : 'text-[#65738B] hover:text-[#18243A] hover:bg-[#F1F4F9]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Team &amp; Policy Config</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ATTENDANCE & BREAKS */}
      {activeTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Control Panel */}
          <div className="lg:col-span-1 card-premium p-5 space-y-5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Live Attendance Tracker</span>
            </h3>

            {!activeAttendance ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-slate-900 font-bold text-sm">Not Checked In Today</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Clock in to start tracking your working hours across marketing operations.
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Optional check-in notes (e.g. Remote / Office)..."
                  value={clockInNotes}
                  onChange={(e) => setClockInNotes(e.target.value)}
                  className="w-full bg-white border border-[#E0E6EF] rounded-lg px-3 py-2 text-xs text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9]"
                />
                <button
                  onClick={handleClockIn}
                  className="btn-primary w-full !py-2.5"
                >
                  <Play className="w-4 h-4" />
                  <span>Clock In Now</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Clocked In Status Card */}
                <div className="bg-[#E6F5F1] border border-[#A3DCD0] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#16836B] uppercase">
                      <span className="w-2 h-2 rounded-full bg-[#16836B] animate-ping" />
                      Active Session
                    </span>
                    <span className="text-xs text-[#16836B] font-medium">
                      In: {new Date(activeAttendance.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[#18243A] text-sm font-bold mt-2">{currentMember.name}</p>
                  <p className="text-xs text-[#65738B]">{activeAttendance.company || 'Shared'} Session</p>
                </div>

                {/* Break Controls */}
                <div className="bg-[#F7F9FC] border border-[#E0E6EF] rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-[#18243A] uppercase tracking-wider flex items-center gap-1.5">
                    <Coffee className="w-3.5 h-3.5 text-[#A66B19]" />
                    <span>Break Management</span>
                  </h4>

                  {activeBreak ? (
                    <div className="space-y-3">
                      <div className="bg-[#FEF6E9] border border-[#F8D8A8] rounded-lg p-3 text-center">
                        <span className="text-xs text-[#A66B19] font-semibold">Currently on {activeBreak.breakType}</span>
                        <div className="text-2xl font-mono font-bold text-[#A66B19] mt-1">
                          {Math.floor(breakTimer / 60)
                            .toString()
                            .padStart(2, '0')}
                          :{(breakTimer % 60).toString().padStart(2, '0')}
                        </div>
                        {isBreakExceeded && (
                          <div className="flex items-center justify-center gap-1.5 text-[#C44750] text-xs font-bold mt-2">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Exceeded policy limit!</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleEndBreak}
                        className="btn-primary w-full !py-2"
                      >
                        Resume Work (End Break)
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleStartBreak('Lunch')}
                        className="btn-secondary !py-2 !px-3 !text-xs"
                      >
                        <Coffee className="w-3 h-3 text-[#3659D9]" />
                        <span>Lunch Break</span>
                      </button>
                      <button
                        onClick={() => handleStartBreak('Tea Break')}
                        className="btn-secondary !py-2 !px-3 !text-xs"
                      >
                        <Coffee className="w-3 h-3 text-[#3659D9]" />
                        <span>Tea Break</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Clock Out Button */}
                <button
                  onClick={handleClockOut}
                  className="btn-destructive w-full !py-2.5"
                >
                  <Square className="w-3.5 h-3.5 text-[#C44750]" />
                  <span>Clock Out for Today</span>
                </button>
              </div>
            )}
          </div>

          {/* Today's Attendance Table */}
          <div className="lg:col-span-2 card-premium p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Shared Workspace Attendance Records</span>
            </h3>

            {attendanceList.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No attendance records logged yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200/80">
                <table className="w-full text-xs text-left table-premium">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Member</th>
                      <th className="py-2.5 px-3">Check In</th>
                      <th className="py-2.5 px-3">Check Out</th>
                      <th className="py-2.5 px-3">Breaks Taken</th>
                      <th className="py-2.5 px-3 text-right">Total Hours</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceList.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3 font-mono text-slate-800">{a.workDate}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{a.memberName}</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {new Date(a.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {a.checkOutTime
                            ? new Date(a.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Active'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {a.breaks.length > 0 ? `${a.breaks.length} break(s)` : 'None'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {a.totalHours ? `${a.totalHours} hrs` : '--'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              a.checkOutTime
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {a.checkOutTime ? 'Completed' : 'Working'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TASK MANAGEMENT (Light Theme) */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Campaign Task Board</h3>
              <p className="text-slate-500 text-xs mt-0.5">Track digital marketing deliverables and assignments across all shared channels.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                {(['All', 'AaraTech', 'ClinisolTech', 'Shared'] as const).map((tagVal) => (
                  <button
                    key={tagVal}
                    type="button"
                    onClick={() => setCompanyTagFilter(tagVal)}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      companyTagFilter === tagVal
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tagVal === 'All' ? 'All Tags' : tagVal}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowNewTaskModal(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Task</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(['Backlog', 'In Progress', 'Review', 'Completed'] as TaskStatus[]).map((status) => {
              const colTasks = tasks.filter((t) => t.status === status);
              return (
                <div key={status} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{status}</span>
                    <span className="text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[550px]">
                    {colTasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-white border border-slate-200 hover:border-blue-300 rounded-lg p-3 space-y-2 shadow-2xs transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-semibold text-slate-900 leading-tight">{task.title}</h4>
                          <div className="flex items-center gap-1 shrink-0">
                            {task.company && task.company !== 'Shared' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                                {task.company}
                              </span>
                            )}
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${
                                task.priority === 'Urgent'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : task.priority === 'High'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </div>
                        </div>
                        {task.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2">{task.description}</p>
                        )}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-medium text-slate-700">{task.assignedToName}</span>
                          <span>Due {task.dueDate}</span>
                        </div>
                        <div className="pt-1 flex items-center gap-1 justify-end">
                          {status !== 'Completed' && (
                            <button
                              onClick={() => {
                                const next: Record<TaskStatus, TaskStatus> = {
                                  Backlog: 'In Progress',
                                  'In Progress': 'Review',
                                  Review: 'Completed',
                                  Completed: 'Completed',
                                };
                                MarketingService.updateTaskStatus(task.id, next[status]);
                                refreshData();
                              }}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold"
                            >
                              Move Next &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: CONTENT CALENDAR & APPROVALS (Light Theme) */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Social &amp; Campaign Pipeline</h3>
              <p className="text-slate-500 text-xs mt-0.5">Manage post drafts, scheduled updates, and leadership approvals across marketing channels.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                {(['All', 'AaraTech', 'ClinisolTech', 'Shared'] as const).map((tagVal) => (
                  <button
                    key={tagVal}
                    type="button"
                    onClick={() => setCompanyTagFilter(tagVal)}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      companyTagFilter === tagVal
                        ? 'bg-white text-blue-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tagVal === 'All' ? 'All Tags' : tagVal}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowNewPostModal(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Draft Post</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-700 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 flex items-center gap-1">
                      <span>{post.channel}</span>
                      {post.company && post.company !== 'Shared' && (
                        <span className="text-[9px] font-semibold text-slate-600 bg-white px-1 rounded border border-slate-200">
                          {post.company}
                        </span>
                      )}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        post.approvalStatus === 'Approved' || post.approvalStatus === 'Published'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : post.approvalStatus === 'Under Review'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {post.approvalStatus}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 mt-2">{post.title}</h4>
                  <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-3 rounded-lg leading-relaxed whitespace-pre-wrap border border-slate-100">
                    {post.content}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>By: <strong className="text-slate-800">{post.authorName}</strong></span>
                    <span>Sched: {new Date(post.scheduledFor).toLocaleDateString()}</span>
                  </div>

                  {post.approvalStatus === 'Under Review' && (
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={async () => {
                          await MarketingService.updatePostApproval(post.id, 'Approved', currentMember);
                          refreshData();
                        }}
                        className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded text-xs font-semibold shadow-xs"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    </div>
                  )}

                  {post.approvalStatus === 'Approved' && (
                    <button
                      onClick={async () => {
                        await MarketingService.updatePostApproval(post.id, 'Published', currentMember);
                        refreshData();
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded text-xs font-semibold shadow-xs"
                    >
                      Publish to {post.channel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DAILY REPORTS (Light Theme) */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* EOD Form */}
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Submit Daily Report (EOD)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Summarize your daily deliverables and blockers across operations.
            </p>

            {reportSuccessMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Report submitted successfully!</span>
              </div>
            )}

            <form onSubmit={handleSubmitReport} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Company Tag</label>
                <select
                  value={reportForm.company}
                  onChange={(e) => setReportForm({ ...reportForm, company: e.target.value as CompanyTag })}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="Shared">Shared Workspace</option>
                  <option value="AaraTech">AaraTech</option>
                  <option value="ClinisolTech">ClinisolTech</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tasks Completed</label>
                <textarea
                  required
                  rows={3}
                  value={reportForm.tasksCompleted}
                  onChange={(e) => setReportForm({ ...reportForm, tasksCompleted: e.target.value })}
                  placeholder="- Finished LinkedIn updates&#10;- Audited SEO keywords"
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">In Progress Tasks</label>
                <textarea
                  rows={2}
                  value={reportForm.inProgressTasks}
                  onChange={(e) => setReportForm({ ...reportForm, inProgressTasks: e.target.value })}
                  placeholder="- Webinar slide deck..."
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Blockers / Dependencies</label>
                <input
                  type="text"
                  value={reportForm.blockers}
                  onChange={(e) => setReportForm({ ...reportForm, blockers: e.target.value })}
                  placeholder="None or waiting on design asset..."
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Hours Logged</label>
                <input
                  type="number"
                  step="0.5"
                  value={reportForm.hoursWorked}
                  onChange={(e) => setReportForm({ ...reportForm, hoursWorked: parseFloat(e.target.value) || 8 })}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span>Submit Report</span>
              </button>
            </form>
          </div>

          {/* Historical Reports Feed */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Workspace Daily Reports Feed</h3>

            {reports.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No daily reports recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <div key={r.id} className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{r.memberName}</span>
                      <span className="text-slate-500">{r.reportDate} &bull; {r.hoursWorked || 8} hrs</span>
                    </div>

                    <div className="text-xs space-y-1">
                      <div className="text-emerald-700 font-semibold">Completed:</div>
                      <p className="text-slate-700 whitespace-pre-wrap pl-2">{r.tasksCompleted}</p>
                    </div>

                    {r.inProgressTasks && (
                      <div className="text-xs space-y-1 pt-1">
                        <div className="text-amber-700 font-semibold">In Progress:</div>
                        <p className="text-slate-700 whitespace-pre-wrap pl-2">{r.inProgressTasks}</p>
                      </div>
                    )}

                    {r.blockers && (
                      <div className="text-xs text-rose-700 pt-1">
                        <span className="font-semibold">Blocker:</span> {r.blockers}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: TEAM & POLICY CONFIG (Light Theme) */}
      {activeTab === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Roster */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>5-Member Marketing Roster</span>
            </h3>
            <p className="text-xs text-slate-500">
              Authorized digital marketing team with multi-company access to AaraTech &amp; ClinisolTech.
            </p>

            <div className="space-y-2.5">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                      {member.avatarInitials || member.name[0]}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{member.name}</h4>
                      <p className="text-[11px] text-slate-500">{member.designation} &bull; {member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {member.companyAccess.map((c) => (
                      <span key={c} className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Configurable Policy */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              <span>Workspace Policy Rules</span>
            </h3>
            <p className="text-xs text-slate-500">
              Adjust company policy limits without modifying source code.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Lunch Break Limit (Minutes)
                </label>
                <input
                  type="number"
                  value={settings.maxDailyBreakMinutes}
                  onChange={(e) => {
                    const updated = { ...settings, maxDailyBreakMinutes: parseInt(e.target.value) || 60 };
                    setSettings(updated);
                    MarketingService.savePortalSettings(updated);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Standard Daily Work Requirement (Hours)
                </label>
                <input
                  type="number"
                  value={settings.standardWorkHoursPerDay}
                  onChange={(e) => {
                    const updated = { ...settings, standardWorkHoursPerDay: parseInt(e.target.value) || 8 };
                    setSettings(updated);
                    MarketingService.savePortalSettings(updated);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
                <span className="font-bold block">Policy Enforcement Active:</span>
                Breaks exceeding configured thresholds trigger visual compliance alerts on the live tracker.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal (Light Theme) */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Create Campaign Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">Title</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">Description</label>
                <textarea
                  rows={2}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-600 block mb-1 font-semibold">Company Tag</label>
                  <select
                    value={taskForm.company}
                    onChange={(e) => setTaskForm({ ...taskForm, company: e.target.value as CompanyTag })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Shared">Shared</option>
                    <option value="AaraTech">AaraTech</option>
                    <option value="ClinisolTech">ClinisolTech</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1 font-semibold">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as TaskPriority })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1 font-semibold">Due Date</label>
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Post Modal (Light Theme) */}
      {showNewPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Draft Social / Campaign Post</h3>
            <form onSubmit={handleCreatePost} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-600 block mb-1 font-semibold">Company Tag</label>
                  <select
                    value={postForm.company}
                    onChange={(e) => setPostForm({ ...postForm, company: e.target.value as CompanyTag })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Shared">Shared</option>
                    <option value="AaraTech">AaraTech</option>
                    <option value="ClinisolTech">ClinisolTech</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1 font-semibold">Channel</label>
                  <select
                    value={postForm.channel}
                    onChange={(e) => setPostForm({ ...postForm, channel: e.target.value as SocialChannel })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Twitter">Twitter / X</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Blog">Technical Blog</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1 font-semibold">Schedule For</label>
                  <input
                    type="datetime-local"
                    value={postForm.scheduledFor}
                    onChange={(e) => setPostForm({ ...postForm, scheduledFor: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">Post Title / Topic</label>
                <input
                  type="text"
                  required
                  value={postForm.title}
                  onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                  placeholder="e.g. Hiring Senior Full Stack Developers"
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1 font-semibold">Copy / Content</label>
                <textarea
                  required
                  rows={4}
                  value={postForm.content}
                  onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                  placeholder="Write the full post text here..."
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewPostModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
