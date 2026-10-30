import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  Phone,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Calendar,
  UserCheck,
  X,
  Check,
  AlertTriangle,
  Briefcase,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Plus,
  CheckSquare,
  Sparkles,
} from 'lucide-react';
import { dbService, getCandidateDateApplied } from '../../lib/dbService';
import { Person, CandidateStatus, Gender } from '../../types/database';
import { IncompleteProfilesView } from '../incomplete/IncompleteProfilesView';
import { isPhoneNumber, extractCandidateNameFromEmail, cleanJobTitle } from '../../lib/normalization';

interface CandidatesListViewProps {
  onSelectCandidate: (personId: string) => void;
  initialSearchQuery?: string;
  currentUserCompany?: 'AaraTech' | 'ClinisolTech' | 'Both';
}

const STATUS_OPTIONS: CandidateStatus[] = [
  'New',
  'Open',
  'Assigned',
  'Contacted',
  'Follow-up',
  'Review',
  'Not Interested',
  'Closed',
  'Dead',
];

const PRESET_RECRUITERS = ['Adam', 'Alex', 'Unassigned'];

export const CandidatesListView: React.FC<CandidatesListViewProps> = ({
  onSelectCandidate,
  initialSearchQuery = '',
  currentUserCompany = 'Both',
}) => {
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Table Zoom State (Persisted in localStorage, default 95% to comfortably fit all 12 columns without scroll)
  const [tableZoom, setTableZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aat_table_zoom');
      return saved ? Number(saved) : 95;
    } catch {
      return 95;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('aat_table_zoom', String(tableZoom));
    } catch {}
  }, [tableZoom]);

  // Filter States
  const [search, setSearch] = useState(initialSearchQuery);
  const [selectedCompany, setSelectedCompany] = useState<string>(
    currentUserCompany !== 'Both' ? currentUserCompany : 'All'
  );
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedOwner, setSelectedOwner] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string>('All');
  const [contactFilter, setContactFilter] = useState<'all' | 'missing_phone' | 'missing_email'>('all');
  const [hasResumeOnly, setHasResumeOnly] = useState(false);
  const [hasLinkedInOnly, setHasLinkedInOnly] = useState(false);

  // Date Assigned Filter
  const [datePreset, setDatePreset] = useState<string>('All');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');

  // Quick Assign Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [candidateToAssign, setCandidateToAssign] = useState<Person | null>(null);
  const [selectedAssignOwner, setSelectedAssignOwner] = useState<string>('Adam');
  const [customOwnerText, setCustomOwnerText] = useState<string>('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Tab Switch (Master Completed vs Incomplete Review Queue)
  const [activeTab, setActiveTab] = useState<'completed' | 'incomplete'>('completed');
  const [incompleteCount, setIncompleteCount] = useState(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Batch Candidate Selection & Gender Assignment
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [batchToast, setBatchToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const toggleSelectRow = (candId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(candId)) next.delete(candId);
      else next.add(candId);
      return next;
    });
    setSelectAllMatching(false);
  };

  const toggleSelectAllCurrentPage = () => {
    if (selectedIds.size === candidates.length && candidates.length > 0) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } else {
      setSelectedIds(new Set(candidates.map(c => c.id)));
      setSelectAllMatching(false);
    }
  };

  const handleBatchSetGender = async (newGender: Gender) => {
    if (selectedIds.size === 0 && !selectAllMatching) return;
    setBatchUpdating(true);
    try {
      let count = 0;
      if (selectAllMatching) {
        const res = await dbService.batchUpdateGenderByFilter({
          search,
          company: selectedCompany,
          status: selectedStatus,
          owner: selectedOwner,
          gender: selectedGender,
          contactFilter: contactFilter !== 'all' ? contactFilter : undefined,
          hasResume: hasResumeOnly,
          hasLinkedIn: hasLinkedInOnly,
          dateFrom: customDateFrom || undefined,
          dateTo: customDateTo || undefined,
        }, newGender);
        count = res.updatedCount;
      } else {
        const res = await dbService.batchUpdateGender(Array.from(selectedIds), newGender);
        count = res.updatedCount;
      }
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      setBatchToast({
        type: 'success',
        message: `Successfully set gender to ${newGender} for ${count} candidate profile${count !== 1 ? 's' : ''}!`,
      });
      setTimeout(() => setBatchToast(null), 4000);
      await fetchCandidates();
    } catch (err: any) {
      setBatchToast({
        type: 'error',
        message: err?.message || 'Failed to update gender in batch.',
      });
      setTimeout(() => setBatchToast(null), 4000);
    } finally {
      setBatchUpdating(false);
    }
  };

  const handleBatchAutoDetectGender = async () => {
    setBatchUpdating(true);
    try {
      const ids = selectAllMatching ? undefined : (selectedIds.size > 0 ? Array.from(selectedIds) : undefined);
      const res = await dbService.batchAutoDetectGender(ids);
      setSelectedIds(new Set());
      setSelectAllMatching(false);

      let toastMsg = '';
      if (res.updatedCount > 0) {
        toastMsg = `Smart Gender Detection complete! Updated ${res.updatedCount} profile(s): ${res.maleCount} ♂ Male, ${res.femaleCount} ♀ Female. (Database now: ${res.totalMale} ♂ Male, ${res.totalFemale} ♀ Female, ${res.totalUnspecified} Unspecified)`;
      } else {
        toastMsg = `Smart Gender Detection complete! All profiles up to date: ${res.totalMale} ♂ Male, ${res.totalFemale} ♀ Female already categorized. (${res.totalUnspecified} neutral/unspecified remaining)`;
      }

      setBatchToast({
        type: 'success',
        message: toastMsg,
      });
      setTimeout(() => setBatchToast(null), 6000);
      await fetchCandidates();
    } catch (err: any) {
      setBatchToast({
        type: 'error',
        message: err?.message || 'Failed to auto-detect gender.',
      });
      setTimeout(() => setBatchToast(null), 4000);
    } finally {
      setBatchUpdating(false);
    }
  };

  const handleSingleSetGender = async (candId: string, newGender: Gender) => {
    try {
      await dbService.updateCandidateProfile(candId, { gender: newGender });
      setCandidates(prev => prev.map(c => c.id === candId ? { ...c, gender: newGender } : c));
    } catch (err: any) {
      console.error('Failed to update candidate gender:', err);
    }
  };

  const fetchIncompleteBadge = () => {
    const count = dbService.getIncompleteCount(
      currentUserCompany !== 'Both' ? currentUserCompany : undefined
    );
    setIncompleteCount(count);
  };

  useEffect(() => {
    fetchIncompleteBadge();
  }, [currentUserCompany]);

  useEffect(() => {
    setSearch(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    fetchCandidates();
  }, [
    search,
    selectedCompany,
    selectedStatus,
    selectedOwner,
    selectedGender,
    contactFilter,
    hasResumeOnly,
    hasLinkedInOnly,
    datePreset,
    customDateFrom,
    customDateTo,
    currentPage,
    pageSize,
  ]);

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    setCurrentPage(1);
    const today = new Date().toISOString().split('T')[0];

    if (preset === 'All') {
      setCustomDateFrom('');
      setCustomDateTo('');
    } else if (preset === 'Today') {
      setCustomDateFrom(today);
      setCustomDateTo(today);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setCustomDateFrom(d.toISOString().split('T')[0]);
      setCustomDateTo(today);
    } else if (preset === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setCustomDateFrom(d.toISOString().split('T')[0]);
      setCustomDateTo(today);
    } else if (preset === '2026') {
      setCustomDateFrom('2026-01-01');
      setCustomDateTo('2026-12-31');
    } else if (preset === '2025') {
      setCustomDateFrom('2025-01-01');
      setCustomDateTo('2025-12-31');
    }
  };

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const { candidates: data, totalCount: count } = await dbService.getCandidates({
        page: currentPage,
        pageSize,
        search,
        company: selectedCompany,
        status: selectedStatus,
        owner: selectedOwner,
        gender: selectedGender,
        contactFilter: contactFilter !== 'all' ? contactFilter : undefined,
        hasResume: hasResumeOnly,
        hasLinkedIn: hasLinkedInOnly,
        dateFrom: customDateFrom || undefined,
        dateTo: customDateTo || undefined,
      });
      setCandidates(data);
      setTotalCount(count);
      fetchIncompleteBadge();
    } catch (err) {
      console.error('Failed to load candidate list:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedCompany('All');
    setSelectedStatus('All');
    setSelectedOwner('All');
    setSelectedGender('All');
    setContactFilter('all');
    setHasResumeOnly(false);
    setHasLinkedInOnly(false);
    setDatePreset('All');
    setCustomDateFrom('');
    setCustomDateTo('');
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    setCurrentPage(1);
  };

  const [clearSuccess, setClearSuccess] = useState(false);

  const handleClearAllData = async () => {
    if (
      window.confirm(
        'Are you sure you want to CLEAR all candidate data and start completely fresh? All existing people, imports, applications, and recruiter feedback will be permanently wiped.'
      )
    ) {
      await dbService.clearAllData();
      setCandidates([]);
      setTotalCount(0);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 4000);
    }
  };

  const openAssignModal = (cand: Person) => {
    setCandidateToAssign(cand);
    setSelectedAssignOwner(cand.current_owner && cand.current_owner !== 'Unassigned' ? cand.current_owner : 'Adam');
    setCustomOwnerText('');
    setAssignModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateToAssign) return;

    const finalOwner = selectedAssignOwner === 'Other' ? (customOwnerText.trim() || 'Unassigned') : selectedAssignOwner;
    setAssignLoading(true);
    try {
      await dbService.updateOwner(candidateToAssign.id, finalOwner, 'Admin Recruiter');
      setAssignModalOpen(false);
      setCandidateToAssign(null);
      await fetchCandidates();
    } catch (err) {
      console.error('Failed to update owner:', err);
    } finally {
      setAssignLoading(false);
    }
  };

  const exportCurrentTableToCsv = () => {
    const headers = [
      'Person ID',
      'Date Assigned',
      'Full Name',
      'Role',
      'Gender',
      'Primary Email',
      'Secondary Email',
      'All Emails',
      'Primary Phone',
      'Secondary Phone',
      'All Phones',
      'Location',
      'Preferred Location',
      'Current Status',
      'Current Owner',
      'Applications Count',
      'Recruiter Feedback Count',
      'Last Activity',
    ];

    const rows = candidates.map((c) => {
      const role = cleanJobTitle(c.applications?.[0]?.job_title || c.current_title || c.headline || 'Data Analyst');
      return [
        c.person_id,
        getCandidateDateApplied(c) || '',
        `"${c.full_name}"`,
        `"${role}"`,
        c.gender || 'Unspecified',
        c.primary_email || '',
        c.secondary_email || '',
        `"${(c.emails || []).map((e) => e.email).join('; ')}"`,
        c.primary_phone || '',
        c.secondary_phone || '',
        `"${(c.phones || []).map((p) => p.phone_original).join('; ')}"`,
        `"${c.location || ''}"`,
        `"${c.preferred_location || ''}"`,
        c.current_status,
        c.current_owner || '',
        c.applications?.length || 0,
        c.recruiter_contacts?.length || 0,
        c.last_activity_at,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute(
      'download',
      `master_candidates_export_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Collect any other dynamically present owners from candidate profiles
  const additionalOwners = Array.from(
    new Set(
      candidates
        .map((c) => c.current_owner)
        .filter((o): o is string => Boolean(o && o !== 'Unassigned' && o !== 'Adam' && o !== 'Alex'))
    )
  );

  return (
    <div className="p-4 md:p-6 w-full max-w-[1850px] mx-auto space-y-5">
      {/* Top Database Mode Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
            activeTab === 'completed'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Master Database (Completed)</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              activeTab === 'completed'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {totalCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('incomplete')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
            activeTab === 'incomplete'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Incomplete Profiles (Needs Review)</span>
          {incompleteCount > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                activeTab === 'incomplete'
                  ? 'bg-white/20 text-white'
                  : 'bg-rose-100 text-rose-700 border border-rose-200'
              }`}
            >
              {incompleteCount} pending
            </span>
          )}
        </button>
      </div>

      {activeTab === 'incomplete' ? (
        <IncompleteProfilesView
          currentUserCompany={currentUserCompany}
          onCandidatePromoted={() => {
            fetchCandidates();
            fetchIncompleteBadge();
          }}
          onNavigateCompleted={() => setActiveTab('completed')}
        />
      ) : (
        <>
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Master Candidate Database
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Displaying {totalCount.toLocaleString()} consolidated master person profiles with complete historical traceability.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleClearAllData}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                title="Wipe database to 0 candidates and start completely fresh"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Clear Database (Fresh Start)</span>
              </button>

              <button
                onClick={exportCurrentTableToCsv}
                className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

      {clearSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>All candidate data has been permanently cleared (0 records). The database is clean and ready for fresh uploads.</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          {/* Search inside table */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search candidate name, email, phone, or P-ID..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Company Filter */}
          <div>
            <select
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Companies</option>
              <option value="AaraTech">AaraTech</option>
              <option value="ClinisolTech">ClinisolTech</option>
            </select>
          </div>

          {/* Date Assigned Filter Preset */}
          <div>
            <select
              value={datePreset}
              onChange={(e) => handleDatePresetChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Dates Assigned</option>
              <option value="Today">Assigned: Today</option>
              <option value="7days">Assigned: Past 7 Days</option>
              <option value="30days">Assigned: Past 30 Days</option>
              <option value="2026">Assigned: Year 2026</option>
              <option value="2025">Assigned: Year 2025</option>
              <option value="Custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Recruiter / Owner Filter (Adam, Alex, Unassigned) */}
          <div>
            <select
              value={selectedOwner}
              onChange={(e) => {
                setSelectedOwner(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Owners</option>
              <option value="Unassigned">Unassigned Only</option>
              <option value="Adam">Adam</option>
              <option value="Alex">Alex</option>
              {additionalOwners.map((own) => (
                <option key={own} value={own}>
                  {own}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {datePreset === 'Custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50/60 border border-blue-200/60 rounded-lg text-xs animate-fade-in">
            <div className="flex items-center gap-1.5 text-blue-900 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Date Assigned Range:</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-600">From:</label>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => {
                  setCustomDateFrom(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-slate-600">To:</label>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => {
                  setCustomDateTo(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {(customDateFrom || customDateTo) && (
              <button
                onClick={() => {
                  setCustomDateFrom('');
                  setCustomDateTo('');
                  setDatePreset('All');
                }}
                className="text-blue-700 hover:text-blue-900 font-medium underline text-xs ml-auto"
              >
                Clear Date Filter
              </button>
            )}
          </div>
        )}

        {/* Secondary Filters row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={hasResumeOnly}
                onChange={(e) => {
                  setHasResumeOnly(e.target.checked);
                  setCurrentPage(1);
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Has Resume Link</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={hasLinkedInOnly}
                onChange={(e) => {
                  setHasLinkedInOnly(e.target.checked);
                  setCurrentPage(1);
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Has LinkedIn Profile</span>
            </label>

            {/* Gender filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Gender:</span>
              <select
                value={selectedGender}
                onChange={(e) => {
                  setSelectedGender(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 focus:outline-none"
              >
                <option value="All">All Genders</option>
                <option value="Male">♂ Male</option>
                <option value="Female">♀ Female</option>
                <option value="Unspecified">Unspecified</option>
              </select>
            </div>

            {/* Quick Button to Select All Profiles to Assign Gender */}
            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set(candidates.map((c) => c.id)));
                  setSelectAllMatching(true);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors border cursor-pointer ${
                  selectAllMatching
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
                }`}
                title={`Select all ${totalCount} matching profiles to bulk set Male or Female`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>
                  {selectAllMatching
                    ? `✓ All ${totalCount} Profiles Selected`
                    : `Select All (${totalCount}) to Set Male/Female`}
                </span>
              </button>
            )}

            {/* Quick Button to Run Smart Gender Auto-Detection across all candidates */}
            {totalCount > 0 && (
              <button
                type="button"
                disabled={batchUpdating}
                onClick={handleBatchAutoDetectGender}
                className="px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition-colors border cursor-pointer bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-700 hover:from-purple-100 hover:to-indigo-100 border-indigo-200 shadow-2xs"
                title="Automatically detect Male / Female for all profiles using advanced first-name lexicons and recruiter notes"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auto-Detect Gender (All)</span>
              </button>
            )}
            {/* Contact Status filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Contact:</span>
              <select
                value={contactFilter}
                onChange={(e) => {
                  setContactFilter(e.target.value as 'all' | 'missing_phone' | 'missing_email');
                  setCurrentPage(1);
                }}
                className={`px-2 py-1 border rounded text-xs focus:outline-none font-medium ${
                  contactFilter === 'missing_phone'
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : contactFilter === 'missing_email'
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <option value="all">All Contacts</option>
                <option value="missing_phone">⚠️ Missing Phone</option>
                <option value="missing_email">✉️ Missing Email</option>
              </select>
            </div>
          </div>

          {(search ||
            selectedCompany !== 'All' ||
            selectedStatus !== 'All' ||
            selectedOwner !== 'All' ||
            selectedGender !== 'All' ||
            contactFilter !== 'all' ||
            hasResumeOnly ||
            hasLinkedInOnly ||
            datePreset !== 'All' ||
            customDateFrom ||
            customDateTo) && (
            <button
              onClick={resetFilters}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Candidates Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table View & Zoom Controls Toolbar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <span className="text-slate-500">Layout:</span>
            <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
              Full Width Adaptive (No Horizontal Scroll)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-medium mr-1">Table Zoom:</span>
            <button
              type="button"
              onClick={() => setTableZoom((z) => Math.max(z - 10, 70))}
              className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
              title="Zoom Out Table (Smaller Font &amp; Spacing)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTableZoom(95)}
              className="px-2 py-1 rounded-md bg-white border border-slate-200 font-mono font-bold text-[11px] text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs min-w-[44px] text-center cursor-pointer"
              title="Click to reset zoom to default (95%)"
            >
              {tableZoom}%
            </button>
            <button
              type="button"
              onClick={() => setTableZoom((z) => Math.min(z + 10, 130))}
              className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
              title="Zoom In Table (Larger Font &amp; Spacing)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTableZoom(85)}
              className="px-2.5 py-1 ml-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
              title="Fit all 12 columns perfectly onto laptop/desktop display without scrolling"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Fit Screen (85%)</span>
            </button>
          </div>
        </div>

        {/* Batch Operation Toast Notification */}
        {batchToast && (
          <div
            className={`px-4 py-2.5 border-b text-xs font-medium flex items-center justify-between ${
              batchToast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{batchToast.message}</span>
            </div>
            <button
              onClick={() => setBatchToast(null)}
              className="font-bold text-sm hover:opacity-75 cursor-pointer ml-3"
            >
              ×
            </button>
          </div>
        )}

        {/* Batch Selection & Gender Assignment Action Bar */}
        {(selectedIds.size > 0 || selectAllMatching) && (
          <div className="px-4 py-3 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-b-2 border-blue-500 flex flex-wrap items-center justify-between gap-3 text-xs animate-fade-in shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] shadow-xs">
                  {selectAllMatching ? totalCount : selectedIds.size}
                </span>
                <span>
                  {selectAllMatching
                    ? `All ${totalCount} matching profiles selected across database`
                    : `${selectedIds.size} profile${selectedIds.size > 1 ? 's' : ''} selected on this page`}
                </span>
              </div>

              {!selectAllMatching && totalCount > candidates.length && (
                <button
                  type="button"
                  onClick={() => setSelectAllMatching(true)}
                  className="text-blue-700 hover:text-blue-900 font-semibold underline text-xs cursor-pointer ml-1"
                >
                  Select all {totalCount} matching profiles in database
                </button>
              )}

              {selectAllMatching && (
                <button
                  type="button"
                  onClick={() => setSelectAllMatching(false)}
                  className="text-slate-600 hover:text-slate-900 font-medium underline text-xs cursor-pointer ml-1"
                >
                  Limit to current page ({selectedIds.size})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600 text-[11px] mr-1">Bulk Set Gender:</span>
              <button
                type="button"
                disabled={batchUpdating}
                onClick={() => handleBatchSetGender('Male')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Assign Male to all selected profiles"
              >
                <span>♂</span>
                <span>Set Male</span>
              </button>

              <button
                type="button"
                disabled={batchUpdating}
                onClick={() => handleBatchSetGender('Female')}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Assign Female to all selected profiles"
              >
                <span>♀</span>
                <span>Set Female</span>
              </button>

              <button
                type="button"
                disabled={batchUpdating}
                onClick={handleBatchAutoDetectGender}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:from-purple-800 active:to-indigo-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Smart auto-detect Male or Female using candidate names and screening notes"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Detect</span>
              </button>

              <button
                type="button"
                disabled={batchUpdating}
                onClick={() => handleBatchSetGender('Unspecified')}
                className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-lg text-xs transition-all disabled:opacity-50 cursor-pointer"
                title="Reset to Unspecified"
              >
                <span>⚪ Unspecified</span>
              </button>

              <div className="h-4 w-px bg-slate-300 mx-1" />

              <button
                type="button"
                disabled={batchUpdating}
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectAllMatching(false);
                }}
                className="px-2 py-1 text-slate-500 hover:text-slate-800 font-medium text-xs hover:underline cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <div style={{ zoom: `${tableZoom}%` }} className="transition-all duration-150">
            <table className="w-full text-left text-xs text-slate-600 border-collapse table-auto">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      title={
                        candidates.length > 0 && selectedIds.size === candidates.length
                          ? 'Deselect all on this page'
                          : 'Select all on this page'
                      }
                      checked={
                        candidates.length > 0 &&
                        (selectedIds.size === candidates.length || selectAllMatching)
                      }
                      onChange={toggleSelectAllCurrentPage}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                    />
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Person ID</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Date Assigned</th>
                  <th className="py-2.5 px-3">Candidate Name</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Role</th>
                  <th className="py-2.5 px-3">Emails</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Phones</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Apps &amp; Company</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Recruiter Feedback</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Owner</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400">
                      Loading candidate database records...
                    </td>
                  </tr>
                ) : candidates.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-slate-500">
                      <div className="max-w-md mx-auto space-y-2">
                        <div className="font-bold text-slate-700 text-sm">No Candidate Records in Database</div>
                        <p className="text-xs text-slate-400">
                          {datePreset !== 'All'
                            ? 'No candidates match the selected date assigned range. Try selecting "All Dates Assigned" or clearing filters.'
                            : 'The database is clean and ready. Upload your historical XLSX/CSV files or paste data in Ingest Campaign Data to begin populating profiles.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  candidates.map((cand) => {
                    const hasAara = cand.applications?.some((a) => a.company === 'AaraTech');
                    const hasClini = cand.applications?.some((a) => a.company === 'ClinisolTech');
                    const dateApplied = getCandidateDateApplied(cand);
                    const formattedDate = formatDateDisplay(dateApplied);
                    let role = cleanJobTitle(cand.applications?.[0]?.job_title || cand.current_title || cand.headline || 'Data Analyst');

                    const isPhoneAsName = isPhoneNumber(cand.full_name);
                    const displayName = isPhoneAsName
                      ? (cand.primary_email ? extractCandidateNameFromEmail(cand.primary_email) : null) || 'Candidate'
                      : cand.full_name;

                    const displayOwner = cand.current_owner && (cand.current_owner.length > 25 || /^(he is|she is|female candidate|4 years|2 years|\d+\s*years|opt|f1)/i.test(cand.current_owner))
                      ? 'Adam'
                      : (cand.current_owner || 'Unassigned');

                    const isRowSelected = selectedIds.has(cand.id) || selectAllMatching;

                    return (
                      <tr key={cand.id} className={`transition-colors ${isRowSelected ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50/70'}`}>
                        {/* 0. Row Selection Checkbox */}
                        <td
                          className="py-2.5 px-3 text-center align-middle w-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={() => toggleSelectRow(cand.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                          />
                        </td>

                        {/* 1. Person ID */}
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap font-mono font-bold text-xs text-blue-600">
                          {cand.person_id}
                        </td>

                        {/* 2. Date Applied */}
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap text-xs">
                          {formattedDate ? (
                            <span className="inline-flex items-center gap-1.5 font-medium bg-slate-50 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{formattedDate}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </td>

                        {/* 3. Candidate Name */}
                        <td className="py-2.5 px-3 align-middle">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 whitespace-nowrap">
                              {displayName}
                            </span>
                            <select
                              value={cand.gender || 'Unspecified'}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleSingleSetGender(cand.id, e.target.value as Gender);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border cursor-pointer focus:outline-none transition-colors ${
                                cand.gender === 'Male'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                  : cand.gender === 'Female'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                              }`}
                              title="Click to change candidate gender"
                            >
                              <option value="Male">♂ Male</option>
                              <option value="Female">♀ Female</option>
                              <option value="Unspecified">⚪ Unspecified</option>
                            </select>
                          </div>
                          {cand.linkedin_url && (
                            <a
                              href={
                                cand.linkedin_url.startsWith('http')
                                  ? cand.linkedin_url
                                  : `https://${cand.linkedin_url}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                            >
                              <span>LinkedIn</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </td>

                        {/* 4. Role / Job Title */}
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap text-xs">
                          {role !== '—' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                              <Briefcase className="w-3 h-3 mr-1 text-indigo-500 shrink-0" />
                              <span>{role}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* 5. Multiple Emails */}
                        <td className="py-2.5 px-3 align-middle text-xs">
                          <div className="space-y-0.5 max-w-[210px]">
                            {cand.emails && cand.emails.length > 0 ? (
                              cand.emails.map((e) => (
                                <div
                                  key={e.id}
                                  className="flex items-center gap-1 truncate text-slate-700"
                                >
                                  <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate" title={e.email}>
                                    {e.email}
                                  </span>
                                  {e.is_primary && (
                                    <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-medium shrink-0">
                                      Pri
                                    </span>
                                  )}
                                </div>
                              ))
                            ) : cand.primary_email ? (
                              <div className="flex items-center gap-1 truncate text-slate-700">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate" title={cand.primary_email}>
                                  {cand.primary_email}
                                </span>
                              </div>
                            ) : cand.secondary_email ? (
                              <div className="flex items-center gap-1 truncate text-slate-700">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate" title={cand.secondary_email}>
                                  {cand.secondary_email}
                                </span>
                              </div>
                            ) : (
                              <span className="text-rose-500 font-medium italic text-[11px]">No email</span>
                            )}
                          </div>
                        </td>

                        {/* 6. Multiple Phones */}
                        <td className="py-2.5 px-3 align-middle text-xs font-mono whitespace-nowrap">
                          <div className="space-y-0.5">
                            {cand.phones && cand.phones.length > 0 ? (
                              cand.phones.map((p) => (
                                <div
                                  key={p.id}
                                  className="flex items-center gap-1 text-slate-700"
                                >
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{p.phone_original}</span>
                                </div>
                              ))
                            ) : cand.primary_phone ? (
                              <div className="flex items-center gap-1 text-slate-700">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{cand.primary_phone}</span>
                              </div>
                            ) : isPhoneAsName ? (
                              <div className="flex items-center gap-1 text-slate-700">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{cand.full_name}</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectCandidate(cand.id);
                                }}
                                title="No phone number on record. Click to open candidate profile and add contact details."
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                              >
                                <Phone className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                <span>Missing phone</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 7. Location */}
                        <td className="py-2.5 px-3 align-middle text-xs text-slate-600 whitespace-nowrap">
                          {cand.location || 'United States'}
                        </td>

                        {/* 8. Apps & Company Origin */}
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700">
                              {cand.applications?.length || 0} applied
                            </span>
                            <div>
                              {hasAara && hasClini ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  Dual: Aara &amp; Clini
                                </span>
                              ) : hasAara ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                  AaraTech
                                </span>
                              ) : hasClini ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  ClinisolTech
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        {/* 9. Recruiter Feedback */}
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap text-xs">
                          {cand.recruiter_contacts && cand.recruiter_contacts.length > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {cand.recruiter_contacts.length} feedback
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* 10. Operational Status */}
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              cand.current_status === 'Open'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : cand.current_status === 'Review'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : cand.current_status === 'Contacted'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : cand.current_status === 'Follow-up'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : cand.current_status === 'Not Interested' ||
                                  cand.current_status === 'Closed'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {cand.current_status}
                          </span>
                        </td>

                        {/* 11. Owner with Quick-Assign Click */}
                        <td className="py-2.5 px-3 align-middle whitespace-nowrap text-xs">
                          <button
                            type="button"
                            onClick={() => openAssignModal(cand)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                              displayOwner && displayOwner !== 'Unassigned'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
                            }`}
                            title="Click to assign or change recruiter owner"
                          >
                            <UserCheck className="w-3 h-3 shrink-0" />
                            <span>{displayOwner}</span>
                          </button>
                        </td>

                        {/* 12. Actions */}
                        <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                          <button
                            onClick={() => onSelectCandidate(cand.id)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Server-side Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>
              Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} to{' '}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount.toLocaleString()} candidates
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Assign Owner Modal */}
      {assignModalOpen && candidateToAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Assign Recruiter Owner</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {candidateToAssign.full_name} ({candidateToAssign.person_id})
                </p>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select Recruiter:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_RECRUITERS.map((rec) => (
                    <button
                      key={rec}
                      type="button"
                      onClick={() => {
                        setSelectedAssignOwner(rec);
                        setCustomOwnerText('');
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        selectedAssignOwner === rec
                          ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{rec}</span>
                      {selectedAssignOwner === rec && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Or Custom Recruiter Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe, Rachel Green..."
                  value={customOwnerText}
                  onChange={(e) => {
                    setCustomOwnerText(e.target.value);
                    if (e.target.value) {
                      setSelectedAssignOwner('Other');
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                >
                  {assignLoading ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
