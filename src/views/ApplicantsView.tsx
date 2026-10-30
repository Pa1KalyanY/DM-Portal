import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Sparkles,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  UserCheck,
  UserX,
  Filter,
} from 'lucide-react';
import { Applicant, PaginationParams, NameMatchCategory } from '../types';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { ApplicantDetailModal } from './ApplicantDetailModal';
import { ExportModal } from '../components/ExportModal';
import { GeminiAiModal } from '../components/GeminiAiModal';
import { ReferenceMatcherModal } from '../components/ReferenceMatcherModal';
import { formatGoogleSheetsRow, generateGoogleSheetsTsv } from '../shared/columnMapper';


interface ApplicantsViewProps {
  initialStatus?: string;
  globalSearchQuery?: string;
}

export const ApplicantsView: React.FC<ApplicantsViewProps> = ({
  initialStatus = 'ALL',
  globalSearchQuery = '',
}) => {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Full window & Zoom controls (User Requested: "put full window no to slider left to right... put zoom in or out i wnat to see full table")
  const [zoomLevel, setZoomLevel] = useState<number>(85);
  const [isFullWidth, setIsFullWidth] = useState<boolean>(true);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([]);
  const [selectedApplicantsMap, setSelectedApplicantsMap] = useState<Map<string, Applicant>>(new Map());
  const [isCopyingSelected, setIsCopyingSelected] = useState<boolean>(false);
  const [isSelectingAllMatching, setIsSelectingAllMatching] = useState<boolean>(false);

  // Filters state
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [genderFilter, setGenderFilter] = useState('ALL');
  const [originFilter, setOriginFilter] = useState('ALL');
  const [nameMatchFilter, setNameMatchFilter] = useState<string>('ALL');
  const [search, setSearch] = useState(globalSearchQuery);
  const [jobTitleFilter, setJobTitleFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [hasPhoneFilter, setHasPhoneFilter] = useState(false);
  const [hasLinkedInFilter, setHasLinkedInFilter] = useState(false);

  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isMatcherModalOpen, setIsMatcherModalOpen] = useState(false);
  const [isRescreening, setIsRescreening] = useState(false);

  // Quick Copy states
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [isQuickCopying, setIsQuickCopying] = useState<boolean>(false);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  const handleRescreenAll = async () => {
    try {
      setIsRescreening(true);
      const res = await api.rescreenAllApplicants();
      setCopiedNotification(res.message);
      setTimeout(() => setCopiedNotification(null), 5000);
      fetchApplicants();
    } catch (err: any) {
      alert(`Rescreening failed: ${err.message}`);
    } finally {
      setIsRescreening(false);
    }
  };

  const handleQuickCopySheets = async () => {
    setIsQuickCopying(true);
    try {
      const res = await api.copyGoogleSheetsTsv({
        status: statusFilter,
        gender: genderFilter,
        jobTitle: jobTitleFilter || undefined,
        company: companyFilter || undefined,
      });
      setCopiedNotification(res.message);
      setTimeout(() => setCopiedNotification(null), 4500);
    } catch (err: any) {
      alert(`Could not copy: ${err.message}`);
    } finally {
      setIsQuickCopying(false);
    }
  };

  const handleCopySingleRow = async (applicant: Applicant) => {
    try {
      const row = formatGoogleSheetsRow(applicant);
      const tsv = generateGoogleSheetsTsv([row], false);
      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(tsv);
        copied = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      }
      if (copied) {
        setCopiedRowId(applicant.id);
        setCopiedNotification(`Copied row for ${applicant.fullName} to clipboard (Google Sheets ready)!`);
        setTimeout(() => setCopiedRowId(null), 3000);
        setTimeout(() => setCopiedNotification(null), 4000);
      }
    } catch (err: any) {
      alert(`Could not copy row: ${err.message}`);
    }
  };


  const [isRepairing, setIsRepairing] = useState(false);

  const handleRepairApplicants = async () => {
    setIsRepairing(true);
    try {
      const res = await api.repairApplicants();
      setCopiedNotification(res.message);
      setTimeout(() => setCopiedNotification(null), 5000);
      fetchApplicants();
    } catch (err: any) {
      alert(`Repair failed: ${err.message}`);
    } finally {
      setIsRepairing(false);
    }
  };

  const handleQuickUpdateGender = async (applicantId: string, newGender: 'MALE' | 'FEMALE' | 'UNSPECIFIED') => {
    try {
      await api.updateApplicantGender(applicantId, newGender);
      setApplicants((prev) =>
        prev.map((a) => (a.id === applicantId ? { ...a, gender: newGender } : a))
      );
      setCopiedNotification(
        `Gender modified to ${newGender === 'MALE' ? 'Male (♂)' : newGender === 'FEMALE' ? 'Female (♀)' : 'Unspecified'}`
      );
      setTimeout(() => setCopiedNotification(null), 3000);
    } catch (err: any) {
      alert(`Could not update gender: ${err.message}`);
    }
  };

  // 1-Click Status Change (Add to PASS / Remove from PASS / Mark FAIL)
  const handleQuickStatusChange = async (
    applicantId: string,
    newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    try {
      const res = await api.overrideApplicant(applicantId, newStatus, undefined, 'Recruiter Admin');
      setApplicants((prev) =>
        prev.map((a) => (a.id === applicantId ? res.applicant : a))
      );
      setCopiedNotification(
        newStatus === 'PASS'
          ? `Added ${res.applicant.fullName} to PASS ✓`
          : newStatus === 'MANUAL_REVIEW'
          ? `Removed ${res.applicant.fullName} from PASS (Moved to Manual Review ⚠)`
          : `Marked ${res.applicant.fullName} as FAIL ✗`
      );
      setTimeout(() => setCopiedNotification(null), 3500);
    } catch (err: any) {
      alert(`Could not update status: ${err.message}`);
    }
  };

  // Batch Status Actions (Bulk Add to PASS / Bulk Remove from PASS / Bulk FAIL)
  const handleBatchStatusChange = async (newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW') => {
    if (selectedApplicantIds.length === 0) return;
    try {
      const res = await api.batchOverrideApplicants(selectedApplicantIds, newStatus, undefined, 'Recruiter Admin');
      setCopiedNotification(res.message);
      setTimeout(() => setCopiedNotification(null), 4000);
      setSelectedApplicantIds([]);
      setSelectedApplicantsMap(new Map());
      fetchApplicants();
    } catch (err: any) {
      alert(`Batch update failed: ${err.message}`);
    }
  };

  // Batch Gender Change (User: "also put here gnder chnage ,we will slect all")
  const handleBatchGenderChange = async (newGender: 'MALE' | 'FEMALE' | 'UNSPECIFIED') => {
    if (selectedApplicantIds.length === 0) return;
    try {
      const res = await api.batchUpdateGender(selectedApplicantIds, newGender, 'Recruiter Admin');
      setApplicants((prev) =>
        prev.map((a) => (selectedApplicantIds.includes(a.id) ? { ...a, gender: newGender } : a))
      );
      setCopiedNotification(res.message);
      setTimeout(() => setCopiedNotification(null), 4000);
      setSelectedApplicantIds([]);
      setSelectedApplicantsMap(new Map());
    } catch (err: any) {
      alert(`Batch gender update failed: ${err.message}`);
    }
  };

  // Deduplicate Applicants (User: "only one unique record should be there")
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const handleDeduplicate = async (scope: 'PASS' | 'ALL' = 'ALL') => {
    try {
      setIsDeduplicating(true);
      const res = await api.deduplicateApplicants(scope);
      setCopiedNotification(res.message);
      setTimeout(() => setCopiedNotification(null), 5000);
      fetchApplicants();
    } catch (err: any) {
      alert(`Deduplication failed: ${err.message}`);
    } finally {
      setIsDeduplicating(false);
    }
  };

  // Copy Selected Applications to Clipboard (Google Sheets TSV Format)
  const handleCopySelectedApplicants = async (includeHeaders = false) => {
    if (selectedApplicantIds.length === 0) return;
    setIsCopyingSelected(true);
    try {
      const allCached =
        selectedApplicantIds.length > 0 &&
        selectedApplicantIds.every((id) => selectedApplicantsMap.has(id));

      let tsvText = '';
      let count = selectedApplicantIds.length;

      if (allCached) {
        // Fast local path from selected applicants cache
        const rows = selectedApplicantIds
          .map((id) => selectedApplicantsMap.get(id))
          .filter((a): a is Applicant => Boolean(a))
          .map((a) => formatGoogleSheetsRow(a));
        tsvText = generateGoogleSheetsTsv(rows, includeHeaders);
      } else {
        // Fetch full fidelity data from server for the selected IDs
        const data = await api.getGoogleSheetsData({
          ids: selectedApplicantIds,
          includeHeaders,
        });
        tsvText = includeHeaders ? data.tsvWithHeaders : data.tsvNoHeaders;
        count = data.total;
      }

      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(tsvText);
        copied = true;
      }

      if (!copied) {
        const ta = document.createElement('textarea');
        ta.value = tsvText;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      }

      if (copied) {
        setCopiedNotification(
          `Copied ${count} selected application${count > 1 ? 's' : ''} to clipboard! Paste directly into Google Sheets (Ctrl+V).`
        );
        setTimeout(() => setCopiedNotification(null), 4500);
      } else {
        alert('Could not copy to clipboard. Please check browser permissions.');
      }
    } catch (err: any) {
      alert(`Could not copy selected applications: ${err.message}`);
    } finally {
      setIsCopyingSelected(false);
    }
  };

  // Row selection toggle with persistence in selectedApplicantsMap
  const handleToggleSelect = (applicant: Applicant, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    const id = applicant.id;
    setSelectedApplicantIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
    setSelectedApplicantsMap((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, applicant);
      }
      return next;
    });
  };

  // Cross-page selection calculations
  const currentPageIds = applicants.map((a) => a.id);
  const isAllCurrentPageSelected =
    applicants.length > 0 && currentPageIds.every((id) => selectedApplicantIds.includes(id));
  const isSomeCurrentPageSelected =
    currentPageIds.some((id) => selectedApplicantIds.includes(id)) && !isAllCurrentPageSelected;
  const selectedOnCurrentPageCount = applicants.filter((a) => selectedApplicantIds.includes(a.id)).length;
  const selectedOnOtherPagesCount = selectedApplicantIds.length - selectedOnCurrentPageCount;

  // Select / Deselect all on current page (preserves selections on other pages!)
  const handleSelectAllCurrentPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedApplicantIds((prev) => Array.from(new Set([...prev, ...currentPageIds])));
      setSelectedApplicantsMap((prev) => {
        const next = new Map(prev);
        applicants.forEach((a) => next.set(a.id, a));
        return next;
      });
    } else {
      const currentSet = new Set(currentPageIds);
      setSelectedApplicantIds((prev) => prev.filter((id) => !currentSet.has(id)));
      setSelectedApplicantsMap((prev) => {
        const next = new Map(prev);
        currentPageIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleDeselectAll = () => {
    setSelectedApplicantIds([]);
    setSelectedApplicantsMap(new Map());
  };

  // Select all matching applicants across all pages
  const handleSelectAllAcrossPages = async () => {
    try {
      setIsSelectingAllMatching(true);
      const res = await api.getAllApplicantIds({
        search,
        status: statusFilter,
        gender: genderFilter,
        origin: originFilter,
        nameMatchCategory: nameMatchFilter !== 'ALL' ? (nameMatchFilter as NameMatchCategory) : undefined,
        jobTitle: jobTitleFilter || undefined,
        company: companyFilter || undefined,
        stage: stageFilter || undefined,
        hasEmail: hasEmailFilter || undefined,
        hasPhone: hasPhoneFilter || undefined,
        hasLinkedIn: hasLinkedInFilter || undefined,
      });
      setSelectedApplicantIds(res.ids);
      setSelectedApplicantsMap((prev) => {
        const next = new Map(prev);
        applicants.forEach((a) => next.set(a.id, a));
        return next;
      });
      setCopiedNotification(`Selected all ${res.total} candidates across all pages!`);
      setTimeout(() => setCopiedNotification(null), 3500);
    } catch (err: any) {
      alert(`Could not select all applicants: ${err.message}`);
    } finally {
      setIsSelectingAllMatching(false);
    }
  };

  // Keep local cache fresh when applicants are loaded
  useEffect(() => {
    if (applicants.length > 0 && selectedApplicantIds.length > 0) {
      setSelectedApplicantsMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        applicants.forEach((a) => {
          if (selectedApplicantIds.includes(a.id)) {
            next.set(a.id, a);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [applicants, selectedApplicantIds]);

  // Reset selection ONLY when search or filters change — NEVER on page or pageSize changes!
  useEffect(() => {
    setSelectedApplicantIds([]);
    setSelectedApplicantsMap(new Map());
  }, [
    statusFilter,
    genderFilter,
    originFilter,
    nameMatchFilter,
    search,
    jobTitleFilter,
    companyFilter,
    stageFilter,
    hasEmailFilter,
    hasPhoneFilter,
    hasLinkedInFilter,
  ]);

  useEffect(() => {
    if (initialStatus) {
      setStatusFilter(initialStatus);
      setPage(1);
    }
  }, [initialStatus]);

  useEffect(() => {
    if (globalSearchQuery !== undefined) {
      setSearch(globalSearchQuery);
      setPage(1);
    }
  }, [globalSearchQuery]);

  const fetchApplicants = async () => {
    setLoading(true);
    try {
      const params: PaginationParams = {
        page,
        pageSize,
        search,
        status: statusFilter,
        gender: genderFilter,
        origin: originFilter,
        nameMatchCategory: nameMatchFilter !== 'ALL' ? (nameMatchFilter as NameMatchCategory) : undefined,
        jobTitle: jobTitleFilter || undefined,
        company: companyFilter || undefined,
        stage: stageFilter || undefined,
        hasEmail: hasEmailFilter || undefined,
        hasPhone: hasPhoneFilter || undefined,
        hasLinkedIn: hasLinkedInFilter || undefined,
      };
      const res = await api.getApplicants(params);
      setApplicants(res.data);
      setTotalCount(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Failed to load applicants', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplicants();
  }, [page, pageSize, statusFilter, genderFilter, originFilter, nameMatchFilter, search, jobTitleFilter, companyFilter, stageFilter, hasEmailFilter, hasPhoneFilter, hasLinkedInFilter]);

  const resetFilters = () => {
    setStatusFilter('ALL');
    setGenderFilter('ALL');
    setOriginFilter('ALL');
    setNameMatchFilter('ALL');
    setSearch('');
    setJobTitleFilter('');
    setCompanyFilter('');
    setStageFilter('');
    setHasEmailFilter(false);
    setHasPhoneFilter(false);
    setHasLinkedInFilter(false);
    setPage(1);
  };

  return (
    <div className={`p-3 sm:p-5 transition-all duration-200 mx-auto space-y-4 ${
      isFullWidth ? 'w-full max-w-[99vw] px-2 sm:px-4' : 'max-w-7xl px-4'
    }`}>
      {/* Detail Modal */}
      {selectedApplicant && (
        <ApplicantDetailModal
          applicant={selectedApplicant}
          onClose={() => setSelectedApplicant(null)}
          onUpdated={(updated) => {
            setSelectedApplicant(updated);
            setApplicants((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          }}
        />
      )}

      {/* Multiple Options Export Modal (User Requested Feature) */}
      {isExportModalOpen && (
        <ExportModal
          defaultStatus={statusFilter}
          selectedApplicantIds={selectedApplicantIds}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* Gemini AI Origin & Gender Assistant Modal */}
      <GeminiAiModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onSuccess={fetchApplicants}
      />

      {/* Reference Dataset Matcher & Pattern Filter Modal */}
      <ReferenceMatcherModal
        isOpen={isMatcherModalOpen}
        onClose={() => setIsMatcherModalOpen(false)}
        onMatchesUpdated={fetchApplicants}
      />

      {/* Top Filter Tabs & Export Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Segmented Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            {[
              { id: 'ALL', label: 'All Applicants' },
              { id: 'PASS', label: 'PASS', icon: CheckCircle2, color: 'text-emerald-700' },
              { id: 'FAIL', label: 'FAIL', icon: XCircle, color: 'text-rose-700' },
              { id: 'MANUAL_REVIEW', label: 'MANUAL REVIEW', icon: AlertTriangle, color: 'text-amber-700' },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {Icon && <Icon className={`w-3.5 h-3.5 ${tab.color}`} />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Reference Dataset Matcher */}
            <button
              onClick={() => setIsMatcherModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-bold shadow-xs transition"
              title="Compare names against reference dataset (13,859 names), analyze patterns, adjust similarity threshold & export"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
              <span>Reference Matcher</span>
            </button>

            {/* Google Gemini AI Button */}
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-xs transition"
              title="Open Google Gemini AI Assistant to classify South Asian origin and gender (100% Free)"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>Gemini AI (Free)</span>
            </button>

            {/* Local Re-Screen Button */}
            <button
              onClick={handleRescreenAll}
              disabled={isRescreening}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-800 text-xs font-bold shadow-xs transition"
              title="Re-run South Asian origin & gender classification rules across all applicants"
            >
              {isRescreening ? (
                <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 text-teal-600" />
              )}
              <span>Re-Screen (Local)</span>
            </button>

            {/* Copy Selected Applications for Google Sheets (Visible when applicants are selected) */}
            {selectedApplicantIds.length > 0 && (
              <button
                onClick={() => handleCopySelectedApplicants(false)}
                disabled={isCopyingSelected}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition"
                title="1-Click Copy selected applications for Google Sheets (Ctrl+V into cells)"
              >
                {isCopyingSelected ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy Selected ({selectedApplicantIds.length})</span>
              </button>
            )}

            {/* Quick Copy for Google Sheets (All Filtered) */}
            <button
              onClick={handleQuickCopySheets}
              disabled={isQuickCopying}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
              title="1-Click Copy formatted rows for Google Sheets (Ctrl+V into cells)"
            >
              {isQuickCopying ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>Copy for Google Sheets</span>
            </button>

            {/* Export Center */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition"
              title="Open multiple download formats & gender options"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Center</span>
            </button>

            {/* Auto-Align & Repair */}
            <button
              onClick={handleRepairApplicants}
              disabled={isRepairing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold shadow-xs transition"
              title="Automatically repair multiline cell breaks, stitch fragmented rows, and realign columns"
            >
              {isRepairing ? (
                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
              )}
              <span>Auto-Align & Repair</span>
            </button>
            {/* Deduplicate Applicants Button (User Requested Feature) */}
            <button
              onClick={() => handleDeduplicate(statusFilter === 'PASS' ? 'PASS' : 'ALL')}
              disabled={isDeduplicating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-300 hover:bg-rose-100 text-rose-800 text-xs font-bold shadow-xs transition"
              title="Remove duplicate applicants (keeps only 1 unique record per candidate by email/phone/name)"
            >
              {isDeduplicating ? (
                <div className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-rose-600" />
              )}
              <span>Deduplicate {statusFilter === 'PASS' ? 'PASS List' : 'All'}</span>
            </button>
          </div>
        </div>

        {/* Copy Success Toast Banner */}
        {copiedNotification && (
          <div className="p-3 bg-emerald-600 text-white rounded-lg shadow-sm flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 text-xs font-bold">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-200" />
              <span>{copiedNotification}</span>
            </div>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-semibold">
              Ctrl+V in Google Sheets
            </span>
          </div>
        )}


        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          {/* Search Filter */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, phone, job..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Gender Filter (User Requested Feature) */}
          <div>
            <select
              value={genderFilter}
              onChange={(e) => {
                setGenderFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Genders</option>
              <option value="MALE">Male (♂)</option>
              <option value="FEMALE">Female (♀)</option>
              <option value="UNSPECIFIED">Unspecified</option>
            </select>
          </div>

          {/* Regional Origin Filter (South Asia Heuristic + Review) */}
          <div>
            <select
              value={originFilter}
              onChange={(e) => {
                setOriginFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Origins</option>
              <option value="SOUTH_ASIAN">South Asian (🇮🇳 🇵🇰 🇧🇩 🇳🇵 🇱🇰)</option>
              <option value="MANUAL_REVIEW_ORIGIN">Review Needed (Ambiguous)</option>
            </select>
          </div>

          {/* Reference Dataset Name Match Filter */}
          <div>
            <select
              value={nameMatchFilter}
              onChange={(e) => {
                setNameMatchFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Name Matches</option>
              <option value="STRONG_MATCH">Strong Match</option>
              <option value="POSSIBLE_MATCH">Possible Match</option>
              <option value="NO_MATCH">No Match</option>
            </select>
          </div>

          {/* Job Filter */}
          <div>
            <input
              type="text"
              placeholder="Filter by Job..."
              value={jobTitleFilter}
              onChange={(e) => {
                setJobTitleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Company Filter */}
          <div>
            <input
              type="text"
              placeholder="Current Company..."
              value={companyFilter}
              onChange={(e) => {
                setCompanyFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Contact Toggles */}
          <div className="flex items-center gap-3 py-1 text-[11px] text-slate-600">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={hasEmailFilter}
                onChange={(e) => {
                  setHasEmailFilter(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-0"
              />
              <span>Email</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPhoneFilter}
                onChange={(e) => {
                  setHasPhoneFilter(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-0"
              />
              <span>Phone</span>
            </label>
          </div>

          {/* Reset Filters */}
          <div className="flex justify-end">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Batch Actions Bar (Bulk Add to PASS / Remove from PASS / Mark FAIL / Copy Selected) */}
      {selectedApplicantIds.length > 0 && (
        <div className="sticky top-3 z-30 bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-xs bg-blue-600 px-2.5 py-1 rounded-full">
              {selectedApplicantIds.length}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-200">
                candidate{selectedApplicantIds.length > 1 ? 's' : ''} selected
              </span>
              {selectedOnOtherPagesCount > 0 && (
                <span className="text-[10px] text-blue-300 font-medium">
                  {selectedOnCurrentPageCount} on page {page}, {selectedOnOtherPagesCount} on other page{selectedOnOtherPagesCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 1-Click Copy Selected for Google Sheets */}
            <div className="flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-500 transition shadow-xs overflow-hidden">
              <button
                onClick={() => handleCopySelectedApplicants(false)}
                disabled={isCopyingSelected}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-bold transition hover:bg-indigo-700/40"
                title="1-Click Copy all selected applications for Google Sheets (Ctrl+V into cells)"
              >
                {isCopyingSelected ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy Selected ({selectedApplicantIds.length})</span>
              </button>
              <button
                onClick={() => handleCopySelectedApplicants(true)}
                disabled={isCopyingSelected}
                className="px-2 py-1.5 text-[10px] font-semibold text-indigo-100 hover:text-white border-l border-indigo-400/40 hover:bg-indigo-700/60 transition"
                title="Copy selected applications with column headers (Date, Name, Contact Number, etc.)"
              >
                + Headers
              </button>
            </div>

            <button
              onClick={() => handleBatchStatusChange('PASS')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs"
              title="Add all selected candidates to PASS"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>+ Add Selected to PASS</span>
            </button>

            <button
              onClick={() => handleBatchStatusChange('MANUAL_REVIEW')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-xs"
              title="Remove all selected candidates from PASS (Move to Manual Review)"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Remove from PASS (Send to Review)</span>
            </button>

            <button
              onClick={() => handleBatchStatusChange('FAIL')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-xs"
              title="Mark all selected candidates as FAIL"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Mark FAIL</span>
            </button>

            {/* Batch Gender Controls (User: "also put here gnder chnage ,we will slect all") */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700">
              <span className="text-[11px] font-semibold text-slate-300">Set Gender:</span>
              <button
                onClick={() => handleBatchGenderChange('MALE')}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-2xs"
                title="Change gender of all selected candidates to Male (♂)"
              >
                Male (♂)
              </button>
              <button
                onClick={() => handleBatchGenderChange('FEMALE')}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-600 hover:bg-purple-500 text-white transition shadow-2xs"
                title="Change gender of all selected candidates to Female (♀)"
              >
                Female (♀)
              </button>
              <button
                onClick={() => handleBatchGenderChange('UNSPECIFIED')}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-700 hover:bg-slate-600 text-amber-300 transition shadow-2xs"
                title="Change gender of all selected candidates to Unspecified (?)"
              >
                Unspecified (?)
              </button>
            </div>

            <button
              onClick={handleDeselectAll}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Applicants Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <div>
              Showing <strong className="text-slate-900">{applicants.length}</strong> of{' '}
              <strong className="text-slate-900">{totalCount.toLocaleString()}</strong> applicants
            </div>
            {selectedApplicantIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-[11px]">
                  {selectedApplicantIds.length} selected
                </span>
                <button
                  onClick={() => handleCopySelectedApplicants(false)}
                  disabled={isCopyingSelected}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] transition shadow-2xs"
                  title="Copy selected applications formatted for Google Sheets (Ctrl+V)"
                >
                  <Copy className="w-3 h-3 text-indigo-600" />
                  <span>Copy Selected</span>
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline font-medium"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Zoom Controls (User: "put zoom in or out i wnat to see full table no slider left to right") */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 pl-2 pr-1">Zoom:</span>
              <button
                onClick={() => setZoomLevel((z) => Math.max(60, z - 5))}
                className="p-1 hover:bg-slate-100 rounded text-slate-700 transition"
                title="Zoom Out (-5%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-800 min-w-[34px] text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(125, z + 5))}
                className="p-1 hover:bg-slate-100 rounded text-slate-700 transition"
                title="Zoom In (+5%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-px bg-slate-200 mx-0.5" />
              <button
                onClick={() => {
                  setZoomLevel(85);
                  setIsFullWidth(true);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                  zoomLevel === 85 && isFullWidth
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="Fit full table on screen without horizontal scrolling (85% Zoom + Full Window)"
              >
                Fit Table
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
                  zoomLevel === 100 ? 'bg-slate-200 font-bold text-slate-900' : 'text-slate-500 hover:bg-slate-100'
                }`}
                title="Reset to 100% Zoom"
              >
                100%
              </button>
            </div>

            {/* Full Window Toggle */}
            <button
              onClick={() => setIsFullWidth(!isFullWidth)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition shadow-2xs ${
                isFullWidth
                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title={isFullWidth ? 'Standard width (max 1280px)' : 'Full window width (no horizontal scrolling)'}
            >
              {isFullWidth ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Full Window ✓</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Full Window</span>
                </>
              )}
            </button>

            {/* Rows Per Page */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs font-semibold focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Banner when all items on current page are selected and more exist across pages */}
        {isAllCurrentPageSelected && totalCount > applicants.length && (
          <div className="bg-indigo-50/90 border-b border-indigo-200 px-4 py-2 text-xs text-indigo-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span>
                All <strong>{applicants.length}</strong> candidates on page {page} are selected.
              </span>
              {selectedApplicantIds.length === totalCount ? (
                <span className="font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full ml-1">
                  ✓ All {totalCount.toLocaleString()} candidates across all pages selected!
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSelectAllAcrossPages}
                  disabled={isSelectingAllMatching}
                  className="font-bold underline text-indigo-700 hover:text-indigo-900 ml-1 transition"
                >
                  {isSelectingAllMatching
                    ? 'Selecting all...'
                    : `Select all ${totalCount.toLocaleString()} candidates across all pages`}
                </button>
              )}
            </div>
            {selectedApplicantIds.length > 0 && (
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline"
              >
                Clear selection
              </button>
            )}
          </div>
        )}

        <div
          className="w-full overflow-x-auto transition-all"
          style={{
            zoom: `${zoomLevel}%`,
          }}
        >
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-2 text-center w-8">
                  <input
                    type="checkbox"
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeCurrentPageSelected;
                    }}
                    checked={isAllCurrentPageSelected}
                    onChange={handleSelectAllCurrentPage}
                    className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                    title={
                      isAllCurrentPageSelected
                        ? `Deselect all ${applicants.length} candidates on page ${page}`
                        : `Select all ${applicants.length} candidates on page ${page}`
                    }
                  />
                </th>
                <th className="py-2.5 px-3">Applicant Name</th>
                <th className="py-2.5 px-1.5 text-center">Name Match</th>
                <th className="py-2.5 px-1.5 text-center">Gender</th>
                <th className="py-2.5 px-1.5 text-center">Origin</th>
                <th className="py-2.5 px-2">Contact</th>
                <th className="py-2.5 px-2">Location</th>
                <th className="py-2.5 px-2">Role & Company</th>
                <th className="py-2.5 px-2">Job Applied</th>
                <th className="py-2.5 px-1.5 text-center">GC / Citizen</th>
                <th className="py-2.5 px-1.5 text-center">Sponsorship</th>
                <th className="py-2.5 px-2 text-center">Screening Result</th>
                <th className="py-2.5 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading applicants...
                  </td>
                </tr>
              ) : applicants.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    No applicants found matching the selected filters.
                  </td>
                </tr>
              ) : (
                applicants.map((app) => (
                  <tr
                    key={app.id}
                    className={`hover:bg-slate-50/80 transition cursor-pointer ${
                      selectedApplicantIds.includes(app.id) ? 'bg-blue-50/40' : ''
                    }`}
                    onClick={() => setSelectedApplicant(app)}
                  >
                    {/* Select Row Checkbox */}
                    <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedApplicantIds.includes(app.id)}
                        onChange={(e) => handleToggleSelect(app, e)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Name */}
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{app.fullName}</span>
                        {app.profileUrl && (
                          <a
                            href={app.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-500 hover:text-blue-700"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[170px]" title={app.headline}>
                        {app.headline || 'No headline'}
                      </div>
                    </td>

                    {/* Reference Name Match Category & Score */}
                    <td className="py-2.5 px-1.5 text-center">
                      {app.nameMatchCategory === 'Strong Match' ? (
                        <div className="inline-flex flex-col items-center">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                            title={`Pattern: ${app.nameMatchedPattern || 'Token combination'}\nMatched Reference: ${app.nameMatchedReference || '—'}`}
                          >
                            Strong ({Math.round((app.nameMatchScore || 0) * 100)}%)
                          </span>
                          {app.nameMatchedReference && (
                            <span className="text-[9px] text-slate-500 truncate max-w-[105px]" title={app.nameMatchedReference}>
                              ≈ {app.nameMatchedReference}
                            </span>
                          )}
                        </div>
                      ) : app.nameMatchCategory === 'Possible Match' ? (
                        <div className="inline-flex flex-col items-center">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
                            title={`Pattern: ${app.nameMatchedPattern || 'Partial/Token'}\nMatched Reference: ${app.nameMatchedReference || '—'}`}
                          >
                            Possible ({Math.round((app.nameMatchScore || 0) * 100)}%)
                          </span>
                          {app.nameMatchedReference && (
                            <span className="text-[9px] text-slate-500 truncate max-w-[105px]" title={app.nameMatchedReference}>
                              ≈ {app.nameMatchedReference}
                            </span>
                          )}
                        </div>
                      ) : app.nameMatchCategory === 'No Match' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                          No Match
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">—</span>
                      )}
                    </td>

                    {/* Gender Interactive Badge / Selector */}
                    <td className="py-2.5 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={app.gender || 'UNSPECIFIED'}
                        onChange={(e) => {
                          const val = e.target.value as 'MALE' | 'FEMALE' | 'UNSPECIFIED';
                          handleQuickUpdateGender(app.id, val);
                        }}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer border transition focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          app.gender === 'MALE'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : app.gender === 'FEMALE'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 font-semibold shadow-xs'
                        }`}
                        title="Click to modify gender"
                      >
                        <option value="UNSPECIFIED">Unspecified (?)</option>
                        <option value="MALE">Male (♂)</option>
                        <option value="FEMALE">Female (♀)</option>
                      </select>
                    </td>

                    {/* Regional Origin Badge */}
                    <td className="py-2.5 px-1.5 text-center">
                      {app.originRegion === 'SOUTH_ASIAN' ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                          title={app.originMatchReason || 'South Asian origin verified'}
                        >
                          <span>
                            {app.originCountry === 'India'
                              ? '🇮🇳 India'
                              : app.originCountry === 'Pakistan'
                              ? '🇵🇰 Pakistan'
                              : app.originCountry === 'Bangladesh'
                              ? '🇧🇩 Bangladesh'
                              : app.originCountry === 'Nepal'
                              ? '🇳🇵 Nepal'
                              : app.originCountry === 'Sri Lanka'
                              ? '🇱🇰 Sri Lanka'
                              : 'South Asian ✓'}
                          </span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
                          title={app.originMatchReason || 'Ambiguous or unverified name — review needed'}
                        >
                          <span>Review ⚠</span>
                        </span>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="py-2.5 px-2">
                      <div className="text-slate-800 font-medium truncate max-w-[150px]" title={app.email}>{app.email || '—'}</div>
                      <div className="text-[10px] text-slate-400">{app.phone || '—'}</div>
                    </td>

                    {/* Location */}
                    <td className="py-2.5 px-2 text-slate-600">
                      <div className="truncate max-w-[130px]" title={app.location}>{app.location || '—'}</div>
                    </td>

                    {/* Current Title & Company */}
                    <td className="py-2.5 px-2">
                      <div className="text-slate-900 font-semibold truncate max-w-[140px]" title={app.currentTitle}>{app.currentTitle || '—'}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]" title={app.currentCompany}>{app.currentCompany || '—'}</div>
                    </td>

                    {/* Job Applied */}
                    <td className="py-2.5 px-2">
                      <div className="text-slate-900 font-bold truncate max-w-[140px]" title={app.jobTitle}>{app.jobTitle}</div>
                      <div className="text-[10px] text-slate-400">Applied: {app.dateApplied || '—'}</div>
                    </td>

                    {/* Green Card / Citizen Answer */}
                    <td className="py-2.5 px-1.5 text-center">
                      {app.greenCardCitizenAnswer === 'YES' ? (
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                          YES ✓
                        </span>
                      ) : app.greenCardCitizenAnswer === 'NO' ? (
                        <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
                          NO ✗
                        </span>
                      ) : (
                        <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                          MISSING
                        </span>
                      )}
                    </td>

                    {/* Sponsorship Answer */}
                    <td className="py-2.5 px-1.5 text-center">
                      {app.sponsorshipAnswer === 'NO' ? (
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                          NO ✓
                        </span>
                      ) : app.sponsorshipAnswer === 'YES' ? (
                        <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
                          YES ✗
                        </span>
                      ) : (
                        <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                          MISSING
                        </span>
                      )}
                    </td>

                    {/* Overall Screening Result with 1-Click Status Selector */}
                    <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex flex-col items-center gap-0.5">
                        <select
                          value={app.effectiveResult}
                          onChange={(e) => {
                            const newStatus = e.target.value as 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
                            handleQuickStatusChange(app.id, newStatus);
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer border transition focus:outline-none focus:ring-1 ${
                            app.effectiveResult === 'PASS'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : app.effectiveResult === 'FAIL'
                              ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                          }`}
                          title="1-Click change screening status"
                        >
                          <option value="PASS">PASS ✓</option>
                          <option value="MANUAL_REVIEW">MANUAL REVIEW ⚠</option>
                          <option value="FAIL">FAIL ✗</option>
                        </select>
                        {app.screeningReasons && (
                          <div className="text-[9px] text-slate-400 truncate max-w-[120px] mx-auto" title={app.screeningReasons}>
                            {app.screeningReasons}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions: 1-Click Add/Remove from PASS + Copy + Review */}
                    <td className="py-2.5 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {app.effectiveResult !== 'PASS' ? (
                          <button
                            onClick={() => handleQuickStatusChange(app.id, 'PASS')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold transition shadow-2xs whitespace-nowrap"
                            title="1-Click add to PASS (no reason required)"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>+ PASS</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleQuickStatusChange(app.id, 'MANUAL_REVIEW')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold transition shadow-2xs whitespace-nowrap"
                            title="1-Click remove from PASS (Move to Manual Review)"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Remove</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleCopySingleRow(app)}
                          className={`p-1 rounded transition ${
                            copiedRowId === app.id
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-emerald-50 text-slate-500 hover:text-emerald-700'
                          }`}
                          title="Copy row for Google Sheets (Ctrl+V into cells)"
                        >
                          {copiedRowId === app.id ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={() => setSelectedApplicant(app)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-semibold text-[10px] transition whitespace-nowrap"
                          title="Review full candidate details"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Review</span>
                        </button>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            Page <strong className="text-slate-900">{page}</strong> of <strong className="text-slate-900">{totalPages}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
