import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Phone,
  Mail,
  Building2,
  UserCheck,
  UserX,
  ArrowRight,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { dbService } from '../../services/masterDbService';
import { IncompleteRecord, CompanyName, Gender, IncompleteReason } from '../../types/masterDatabase';
import { isRoleOrTech, extractCleanPhone, extractCandidateName, isLocationOrCountry, isValidCandidateName, isHeaderOrLabelWord, isScreeningNote } from '../../shared/masterImportEngine';
import { normalizeEmail, normalizePhone, formatPureDigitsPhone, extractCandidateNameFromEmail, cleanJobTitle } from '../../shared/normalization';
import { GeminiRescueModal } from './GeminiRescueModal';

interface IncompleteProfilesViewProps {
  onCandidatePromoted?: () => void;
  onRecordsChanged?: () => void;
  currentUserCompany?: 'AaraTech' | 'ClinisolTech' | 'Both';
  onNavigateCompleted?: () => void;
}

export const IncompleteProfilesView: React.FC<IncompleteProfilesViewProps> = ({
  onCandidatePromoted,
  onRecordsChanged,
  currentUserCompany = 'Both',
  onNavigateCompleted,
}) => {
  const [records, setRecords] = useState<IncompleteRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [recoverableCount, setRecoverableCount] = useState(0);
  const [orphanCount, setOrphanCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>(
    currentUserCompany !== 'Both' ? currentUserCompany : 'All'
  );
  const [reasonFilter, setReasonFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Batch Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Review & Edit Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const [allIncompleteRecords, setAllIncompleteRecords] = useState<IncompleteRecord[]>([]);
  const [loadingAllForGemini, setLoadingAllForGemini] = useState(false);
  const [activeRecord, setActiveRecord] = useState<IncompleteRecord | null>(null);

  // Form Fields inside modal
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCompany, setFormCompany] = useState<CompanyName>('AaraTech');
  const [formRole, setFormRole] = useState('');
  const [formOwner, setFormOwner] = useState('Adam');
  const [formDate, setFormDate] = useState('');
  const [formGender, setFormGender] = useState<Gender>('Unspecified');
  const [formFeedback, setFormFeedback] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchRecords();
  }, [search, companyFilter, reasonFilter, currentPage, pageSize]);

  // Calculate recoverable and orphan counts on load without mutating or emptying records automatically
  useEffect(() => {
    let isMounted = true;
    const checkCounts = async () => {
      try {
        const res = await dbService.getIncompleteRecords();
        const queue = res?.records || [];
        if (isMounted && queue.length >= 0) {
          const recCount = queue.filter((r: IncompleteRecord) => {
            const hasRecovName = r.recruiter_feedback && extractCandidateName(r.recruiter_feedback).name;
            const hasPhone = r.raw_phone && r.raw_phone.replace(/\D/g, '').length >= 7;
            return Boolean(hasRecovName && (hasPhone || (r.raw_email && r.raw_email.includes('@'))));
          }).length;
          setRecoverableCount(recCount);
          
          const orphCount = queue.filter(r => {
            const isNoName = !r.raw_name || isLocationOrCountry(r.raw_name) || isRoleOrTech(r.raw_name);
            const noContact = !r.raw_email && !r.raw_phone;
            return isNoName && noContact;
          }).length;
          setOrphanCount(orphCount);
        }
      } catch (err) {
        console.warn('Check counts error:', err);
      }
    };

    checkCounts();

    return () => {
      isMounted = false;
    };
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await dbService.getIncompleteRecords({
        page: currentPage,
        pageSize,
        search,
        company: companyFilter,
        reason: reasonFilter,
      });
      setRecords(res.records);
      setTotalCount(res.totalCount);
      try {
        setRecoverableCount(dbService.getRecoverableIncompleteCount());
        setOrphanCount(dbService.getAnonymousIncompleteCount());
      } catch {}
    } catch (e) {
      console.error('Error fetching incomplete records:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRecover = async () => {
    setRecovering(true);
    try {
      const res = await dbService.autoRecoverIncompleteRecords();
      if (res.promotedCount > 0) {
        showToast(
          'success',
          `⚡ Gemini AI auto-resolved & promoted ${res.promotedCount} candidate(s) directly to Master Database! (${res.remainingCount} remaining in queue)`
        );
        if (onCandidatePromoted) {
          onCandidatePromoted();
        }
        if (onRecordsChanged) {
          onRecordsChanged();
        }
      } else if (res.recoveredCount > 0) {
        showToast('success', `Updated ${res.recoveredCount} incomplete records with recovered names & contact info.`);
      } else {
        showToast('error', 'No auto-recoverable profiles detected in current queue.');
      }
      await fetchRecords();
    } catch (err: any) {
      showToast('error', err?.message || 'Error running auto-recovery.');
    } finally {
      setRecovering(false);
    }
  };

  const handleOpenReviewModal = (record: IncompleteRecord) => {
    setActiveRecord(record);
    let initialName = (record.raw_name || '').trim();
    let initialEmail = (record.raw_email || '').trim();
    let initialPhone = (record.raw_phone || '').trim();
    let initialRole = (record.raw_role || '').trim();
    let initialOwner = (record.owner || 'Adam').trim();
    const initialFeedback = record.recruiter_feedback || '';

    // 1. If initialName has markdown email syntax e.g. priyanka killi[priyanka.killi9@gmail.com](mailto:priyanka.killi9@gmail.com)
    if (initialName.includes('@')) {
      const mailMatch = initialName.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (mailMatch && !initialEmail) {
        initialEmail = mailMatch[1];
      }
      initialName = initialName
        .replace(/\[\s*.*?\s*\](?:\(mailto:[^\s)]+\))?/gi, '')
        .replace(/mailto:[^\s)]+/gi, '')
        .replace(/<[^\s>]+>/gi, '')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
        .replace(/[\[\]()<>]/g, '')
        .trim();
    }

    // 2. If initialEmail is actually a recruiter owner name or invalid
    if (initialEmail && (!initialEmail.includes('@') || ['adam', 'alex', 'unassigned'].includes(initialEmail.toLowerCase()))) {
      if (['adam', 'alex'].includes(initialEmail.toLowerCase())) {
        initialOwner = initialEmail.charAt(0).toUpperCase() + initialEmail.slice(1).toLowerCase();
      }
      initialEmail = '';
    }

    // 3. If email is missing, check recruiter_feedback
    if (!initialEmail && initialFeedback) {
      const mailMatch = initialFeedback.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (mailMatch) {
        initialEmail = mailMatch[1];
      }
    }

    // 4. If initialPhone is actually a tech role or not a phone
    if (initialPhone && (isRoleOrTech(initialPhone) || initialPhone.replace(/\D/g, '').length < 7)) {
      if (!initialRole || initialRole === 'Data Analyst') {
        initialRole = initialPhone.toUpperCase();
      }
      initialPhone = '';
    } else if (initialPhone) {
      const cleaned = extractCleanPhone(initialPhone);
      if (cleaned) initialPhone = cleaned;
    }

    // 5. If phone is missing, check recruiter_feedback
    if (!initialPhone && initialFeedback) {
      const pClean = extractCleanPhone(initialFeedback);
      if (pClean) {
        initialPhone = pClean;
      }
    }

    // 6. If initialName is actually a tech role (DOTNET, DE, etc.), move to role
    if (initialName && isRoleOrTech(initialName)) {
      if (!initialRole) initialRole = initialName.toUpperCase();
      initialName = '';
    }

    // 7. If initialName is a location, header label, screening note, or invalid, clear it
    if (initialName && (isLocationOrCountry(initialName) || isHeaderOrLabelWord(initialName) || isScreeningNote(initialName) || !isValidCandidateName(initialName))) {
      initialName = '';
    }

    // 8. If initialName is missing, attempt auto-extraction from recruiter_feedback or email
    if (!initialName && initialFeedback) {
      const extracted = extractCandidateName(initialFeedback);
      if (extracted.name && isValidCandidateName(extracted.name)) {
        initialName = extracted.name;
      }
    }
    if (!initialName && initialEmail) {
      const nameFromEmail = extractCandidateNameFromEmail(initialEmail);
      if (nameFromEmail && isValidCandidateName(nameFromEmail)) {
        initialName = nameFromEmail;
      }
    }

    setFormName(initialName);
    setFormEmail(initialEmail);
    setFormPhone(initialPhone);
    setFormCompany(record.company || 'AaraTech');
    setFormRole(initialRole || 'Data Analyst');
    setFormOwner(initialOwner);
    setFormDate(record.date_assigned || new Date().toISOString().split('T')[0]);
    setFormGender('Unspecified');
    setFormFeedback(initialFeedback);
    setFormError(null);
    setReviewModalOpen(true);
  };

  const handlePromoteToMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecord) return;

    setFormError(null);
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Candidate Name is strictly mandatory. Please enter a valid name.');
      return;
    }

    const trimmedEmail = formEmail.trim();
    const trimmedPhone = formPhone.trim();
    if (!trimmedEmail && !trimmedPhone) {
      setFormError('At least one contact method (Email Address or Phone Number) is strictly required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await dbService.promoteIncompleteToMaster(activeRecord.id, {
        fullName: trimmedName,
        email: trimmedEmail || undefined,
        phone: trimmedPhone || undefined,
        role: formRole.trim() || undefined,
        company: formCompany,
        owner: formOwner.trim() || 'Adam',
        recruiterFeedback: formFeedback.trim() || undefined,
        dateAssigned: formDate || undefined,
        gender: formGender,
      });

      if (res.success && res.person) {
        setReviewModalOpen(false);
        setActiveRecord(null);
        showToast('success', `Candidate ${res.person.full_name} (${res.person.person_id}) promoted to Master Database!`);
        await fetchRecords();
        if (onCandidatePromoted) {
          onCandidatePromoted();
        }
      } else {
        setFormError(res.error || 'Failed to promote candidate to master database.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Error promoting candidate.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSingle = async (id: string, name?: string | null) => {
    const candidateName = name || 'this incomplete record';
    if (!window.confirm(`Are you sure you want to permanently delete ${candidateName}?`)) {
      return;
    }

    await dbService.deleteIncompleteRecord(id);
    showToast('success', 'Incomplete profile permanently deleted.');
    if (activeRecord?.id === id) {
      setReviewModalOpen(false);
      setActiveRecord(null);
    }
    await fetchRecords();
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete all ${selectedIds.size} selected incomplete records?`)) {
      return;
    }

    await dbService.deleteIncompleteRecordsBatch(Array.from(selectedIds));
    setSelectedIds(new Set());
    showToast('success', `Successfully deleted ${selectedIds.size} incomplete records.`);
    await fetchRecords();
    onRecordsChanged?.();
  };

  const handleCleanAnonymous = async () => {
    const deleted = await dbService.deleteAnonymousIncompleteRecords();
    showToast('success', `Successfully purged ${deleted} orphan screening notes.`);
    await fetchRecords();
    onRecordsChanged?.();
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to delete ALL incomplete records? This cannot be undone.')) {
      return;
    }

    await dbService.deleteAllIncompleteRecords();
    setSelectedIds(new Set());
    showToast('success', 'All incomplete records cleared.');
    await fetchRecords();
    onRecordsChanged?.();
  };

  const handleOpenGeminiModal = async () => {
    setLoadingAllForGemini(true);
    try {
      const res = await dbService.getIncompleteRecords({
        page: 1,
        pageSize: 10000,
        company: companyFilter !== 'All' ? companyFilter : undefined,
        reason: reasonFilter !== 'all' ? reasonFilter : undefined,
      });
      setAllIncompleteRecords(res.records || []);
    } catch {
      setAllIncompleteRecords(records);
    } finally {
      setLoadingAllForGemini(false);
      setGeminiModalOpen(true);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === records.length && records.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  };

  const toggleSelectRecord = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const exportCsv = () => {
    if (records.length === 0) return;
    const headers = ['Date Assigned', 'Company', 'Owner', 'Missing Reason', 'Raw Name', 'Raw Email', 'Raw Phone', 'Role', 'Feedback'];
    const rows = records.map(r => [
      r.date_assigned,
      r.company,
      r.owner,
      r.missing_reason,
      `"${(r.raw_name || '').replace(/"/g, '""')}"`,
      `"${(r.raw_email || '').replace(/"/g, '""')}"`,
      `"${(r.raw_phone || '').replace(/"/g, '""')}"`,
      `"${(r.raw_role || '').replace(/"/g, '""')}"`,
      `"${(r.recruiter_feedback || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `incomplete_profiles_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-md transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Incomplete Profiles Review Queue
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Records missing mandatory Full Name or missing both Email & Phone. Edit and send to completed Master Database, or delete.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onNavigateCompleted && (
            <button
              onClick={onNavigateCompleted}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
            >
              <span>Back to Master Database</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {recoverableCount > 0 && (
            <button
              onClick={handleAutoRecover}
              disabled={recovering}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Automatically extract candidate names from feedback and promote to Master Database"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{recovering ? 'Recovering...' : `Auto-Recover Names (${recoverableCount})`}</span>
            </button>
          )}

          {totalCount > 0 && (
            <button
              onClick={handleOpenGeminiModal}
              disabled={loadingAllForGemini}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-600 via-indigo-600 to-purple-600 hover:from-amber-700 hover:to-purple-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Use Google Gemini AI to deeply extract missing names, phones, emails, and purge orphan call logs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{loadingAllForGemini ? 'Loading All Profiles...' : `Gemini AI Re-Verify (${totalCount})`}</span>
            </button>
          )}

          {totalCount > 0 && (
            <>
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={handleCleanAnonymous}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                title="Delete all anonymous screening notes without a candidate name or contact"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                <span>{orphanCount > 0 ? `Clean Orphan Notes (${orphanCount})` : 'Clean Orphan Notes'}</span>
              </button>

              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Clear All Incomplete</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Orphan Screening Notes Banner */}
      {orphanCount > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-950 flex items-center gap-2">
                <span>{orphanCount} Orphan Screening / Call Log(s) Detected</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                  Shifted Columns / Ghost Rows
                </span>
              </div>
              <div className="text-xs text-amber-800/90 mt-0.5">
                These records have no candidate name and no contact details (e.g. only location &ldquo;United States&rdquo; or note &ldquo;unable to connect&rdquo;). They are activity notes, not real candidates.
              </div>
            </div>
          </div>
          <button
            onClick={handleCleanAnonymous}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold shadow-sm whitespace-nowrap transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge All {orphanCount} Orphan Notes</span>
          </button>
        </div>
      )}

      {/* Auto-Recover Intelligent Suggestion Banner */}
      {recoverableCount > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <span>{recoverableCount} candidate profile(s) can be automatically recovered!</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-200/60 text-indigo-800">
                  Ready to Promote
                </span>
              </div>
              <div className="text-xs text-indigo-800/90 mt-0.5">
                We detected candidate names embedded inside recruiter feedback (e.g. &ldquo;Rohan Sharma, MBA...&rdquo;) and clean phone numbers.
                Click below to auto-extract their names, clean numbers, and move them directly to the Master Database!
              </div>
            </div>
          </div>
          <button
            onClick={handleAutoRecover}
            disabled={recovering}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm whitespace-nowrap transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{recovering ? 'Processing...' : `Auto-Recover All (${recoverableCount})`}</span>
          </button>
        </div>
      )}

      {/* Criteria Reminder Alert */}
      <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-950">Master Database Mandatory Data Rules:</div>
          <div>
            1. <strong>Candidate Full Name</strong> is strictly mandatory. Rows without a name are routed here.
          </div>
          <div>
            2. <strong>Contact Info (Email OR Phone Number)</strong>: At least one contact method is required. Rows with only a name and no contact info are routed here.
          </div>
          <div>
            Click <strong>"Review &amp; Complete"</strong> on any row to fill in the missing fields and promote it to the Master Database!
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search incomplete candidate name, email, phone, role, feedback..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Company Filter */}
          <div>
            <select
              value={companyFilter}
              onChange={(e) => {
                setCompanyFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Companies</option>
              <option value="AaraTech">AaraTech</option>
              <option value="ClinisolTech">ClinisolTech</option>
            </select>
          </div>

          {/* Reason Filter */}
          <div>
            <select
              value={reasonFilter}
              onChange={(e) => {
                setReasonFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Incomplete Reasons</option>
              <option value="missing_email">Missing Email (Has Phone &amp; Name)</option>
              <option value="missing_phone">Missing Phone (Has Email &amp; Name)</option>
              <option value="missing_both">Missing Email &amp; Phone</option>
              <option value="missing_name">Missing Candidate Name</option>
              <option value="missing_contact">Legacy Missing Contact</option>
            </select>
          </div>
        </div>

        {/* Batch selection status */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between p-2.5 bg-slate-100 rounded-lg text-xs">
            <span className="font-semibold text-slate-700">
              {selectedIds.size} record{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteBatch}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded font-medium transition-colors"
              >
                Deselect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Loading review queue...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              No Incomplete Profiles Found!
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All candidate profiles currently have valid mandatory names and contact information. When rows with missing fields are imported, they will appear here for review.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === records.length && records.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Date Assigned</th>
                  <th className="py-3 px-4">Missing Field Flag</th>
                  <th className="py-3 px-4">Candidate Name</th>
                  <th className="py-3 px-4">Email Address</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Role / Title</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Recruiter Feedback</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const isSelected = selectedIds.has(r.id);
                  const isLocationName = Boolean(r.raw_name && isLocationOrCountry(r.raw_name));
                  const isTechName = Boolean(r.raw_name && isRoleOrTech(r.raw_name));
                  const isMissingName = !r.raw_name || !r.raw_name.trim() || isLocationName || isTechName;

                  const validEmailNorm = r.raw_email ? normalizeEmail(r.raw_email) : null;
                  const validEmail = validEmailNorm?.isValid && !['adam', 'alex', 'unassigned'].includes(validEmailNorm.original.toLowerCase())
                    ? validEmailNorm.original
                    : (r.raw_email && r.raw_email.includes('@') && !['adam', 'alex', 'unassigned'].includes(r.raw_email.toLowerCase().trim()) ? r.raw_email : null);

                  const validPhoneNorm = r.raw_phone ? normalizePhone(r.raw_phone) : null;
                  const validPhone = validPhoneNorm?.isValid
                    ? validPhoneNorm.normalized
                    : (r.raw_phone && !isRoleOrTech(r.raw_phone) && r.raw_phone.replace(/\D/g, '').length >= 7 ? formatPureDigitsPhone(r.raw_phone) : null);

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRecord(r.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Date Assigned */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-700">
                        {r.date_assigned || '—'}
                      </td>

                      {/* Missing Reason Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isMissingName && !validEmail && !validPhone ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            {isLocationName ? 'Location Shifted / No Contacts' : 'Missing Name & Contacts'}
                          </span>
                        ) : isMissingName ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                            <UserX className="w-3 h-3 text-purple-600" />
                            {isLocationName ? 'Location in Name Col' : 'Missing Candidate Name'}
                          </span>
                        ) : !validEmail && !validPhone ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            Missing Email &amp; Phone
                          </span>
                        ) : !validEmail ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                            <Mail className="w-3 h-3 text-rose-600" />
                            Missing Email Address
                          </span>
                        ) : !validPhone ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                            <Phone className="w-3 h-3 text-amber-600" />
                            Missing Phone Number
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Ready to Promote
                          </span>
                        )}
                      </td>

                      {/* Name */}
                      <td className="py-3 px-4 font-medium">
                        {(() => {
                          const detectedName = isMissingName && r.recruiter_feedback
                            ? extractCandidateName(r.recruiter_feedback).name
                            : null;

                          if (detectedName) {
                            return (
                              <div className="space-y-1">
                                <span className="text-rose-600 italic font-normal flex items-center gap-1 text-xs">
                                  <AlertTriangle className="w-3 h-3 shrink-0" /> [No Name Given]
                                </span>
                                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold">
                                  <Sparkles className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                  <span>Detected: {detectedName}</span>
                                </div>
                              </div>
                            );
                          }

                          if (isLocationName) {
                            return (
                              <div className="space-y-1">
                                <span className="text-rose-600 italic font-normal flex items-center gap-1 text-xs">
                                  <AlertTriangle className="w-3 h-3 shrink-0" /> [No Name Given]
                                </span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[10px]">
                                  Location: {r.raw_name}
                                </span>
                              </div>
                            );
                          }

                          if (isMissingName) {
                            return (
                              <span className="text-rose-600 italic font-normal flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> [No Name Given]
                              </span>
                            );
                          }

                          return <span className="text-slate-900 font-semibold">{r.raw_name}</span>;
                        })()}
                      </td>

                      {/* Email Address */}
                      <td className="py-3 px-4">
                        {validEmail ? (
                          <div className="flex items-center gap-1 text-slate-800">
                            <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="font-mono text-[11px] truncate max-w-[200px]" title={validEmail}>
                              {validEmail}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            Missing Email
                          </span>
                        )}
                      </td>

                      {/* Phone Number */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {validPhone ? (
                          <div className="flex items-center gap-1 text-slate-800">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-mono text-[11px]">{validPhone}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                            Missing Phone
                          </span>
                        )}
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4 text-slate-800">
                        {cleanJobTitle(r.raw_role) || <span className="text-slate-400 italic">—</span>}
                      </td>

                      {/* Company & Owner */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              r.company === 'AaraTech'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {r.company}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Owner: {r.owner || 'Adam'}</div>
                      </td>

                      {/* Recruiter Feedback */}
                      <td className="py-3 px-4 max-w-xs">
                        {r.recruiter_feedback ? (
                          <div className="text-slate-700 truncate text-[11px] title={r.recruiter_feedback}">
                            {r.recruiter_feedback}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenReviewModal(r)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-semibold text-xs flex items-center gap-1 transition-colors"
                            title="Review missing information and promote to Master DB"
                          >
                            <Edit3 className="w-3 h-3 text-blue-600" />
                            <span>Review &amp; Complete</span>
                          </button>

                          <button
                            onClick={() => handleDeleteSingle(r.id, r.raw_name)}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Delete this incomplete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-800">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(currentPage * pageSize, totalCount)}
              </span>{' '}
              of <span className="font-semibold text-slate-800">{totalCount}</span> incomplete profiles
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="font-medium text-slate-700">
                Page {currentPage} of {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Review & Complete Modal */}
      {reviewModalOpen && activeRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Review &amp; Complete Candidate Profile
                  </h3>
                  <p className="text-xs text-slate-500">
                    Provide the mandatory missing details to move this record into Master Database.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Missing Reason Alert inside Modal */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Flag Reason:</strong> {activeRecord.missing_description}
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>{formError}</div>
              </div>
            )}

            {/* Editable Form */}
            <form onSubmit={handlePromoteToMaster} className="space-y-4 text-xs">
              {/* Candidate Full Name (Mandatory) */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Candidate Full Name <span className="text-rose-600">* (Mandatory)</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. LATUNDE SAPARA"
                  required
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    !formName.trim() ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200'
                  }`}
                />
              </div>

              {/* Contact Information (At least one required) */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="font-semibold text-slate-800 flex items-center justify-between">
                  <span>Contact Information</span>
                  <span className="text-[11px] text-blue-700 font-semibold">
                    * At least one contact method (Email or Phone) is required
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="candidate@gmail.com"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        placeholder="512-658-2286"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Company & Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Company
                  </label>
                  <select
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value as CompanyName)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="AaraTech">AaraTech</option>
                    <option value="ClinisolTech">ClinisolTech</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Target Role / Title
                  </label>
                  <input
                    type="text"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    placeholder="e.g. Data Analyst, Business Analyst"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Owner, Date Assigned & Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Recruiter / Owner
                  </label>
                  <input
                    type="text"
                    value={formOwner}
                    onChange={(e) => setFormOwner(e.target.value)}
                    placeholder="Adam, Alex..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Date Assigned
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value as Gender)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Unspecified">Auto-Detect</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              {/* Recruiter Feedback */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recruiter Feedback (Verbatim)
                </label>
                <textarea
                  rows={3}
                  value={formFeedback}
                  onChange={(e) => setFormFeedback(e.target.value)}
                  placeholder="Notes, visa status, salary requirements, assessment notes..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDeleteSingle(activeRecord.id, activeRecord.raw_name)}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Record</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setReviewModalOpen(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{submitting ? 'Promoting...' : 'Send to Master Completed Data'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gemini AI Re-Verification Modal */}
      <GeminiRescueModal
        isOpen={geminiModalOpen}
        onClose={() => setGeminiModalOpen(false)}
        records={allIncompleteRecords.length > 0 ? allIncompleteRecords : records}
        onRecordsResolved={() => {
          fetchRecords();
          onRecordsChanged?.();
        }}
      />
    </div>
  );
};
