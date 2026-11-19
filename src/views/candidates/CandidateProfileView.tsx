import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
  ExternalLink,
  FileText,
  UserCheck,
  Calendar,
  Briefcase,
  PhoneCall,
  Plus,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Edit2,
  ChevronRight,
  Info,
  AlertCircle,
  Building2,
  MessageSquare,
  Sparkles,
  Activity,
  UserPlus,
  UserX,
  History,
  GitCommit,
  RotateCcw,
} from 'lucide-react';
import { dbService } from '../../services/masterDbService';
import { Person, CandidateStatus, Application, RecruiterContact, RecruiterAssignment } from '../../types/masterDatabase';
import { EditCandidateModal } from './EditCandidateModal';
import { isPhoneNumber, extractCandidateNameFromEmail, cleanJobTitle, formatPureDigitsPhone } from '../../shared/normalization';
import { classifyUrl, extractUrlsFromText } from '../../shared/urlClassifier';
import { formatDateDisplay } from '../../shared/dateFormat';

interface CandidateProfileViewProps {
  personId: string;
  onBack: () => void;
  onNavigateCandidate?: (id: string, tab?: ProfileTab) => void;
  initialTab?: ProfileTab;
}

export type ProfileTab =
  | 'overview'
  | 'applications'
  | 'recruiter_history'
  | 'feedback'
  | 'documents'
  | 'data_quality'
  | 'source_history';

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

export const CandidateProfileView: React.FC<CandidateProfileViewProps> = ({
  personId,
  onBack,
  onNavigateCandidate,
  initialTab = 'overview',
}) => {
  const [candidate, setCandidate] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Modals
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [autoMergeAlert, setAutoMergeAlert] = useState<{ mergedWithId: string } | null>(null);

  // Status Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<CandidateStatus>('Open');
  const [statusReason, setStatusReason] = useState('');

  // Reassign Recruiter Modal
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignRecruiterName, setReassignRecruiterName] = useState('');
  const [reassignDate, setReassignDate] = useState(new Date().toISOString().split('T')[0]);
  const [reassignReason, setReassignReason] = useState('');
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  // Contact Attempt Modal
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactRecruiter, setContactRecruiter] = useState('');
  const [contactMethod, setContactMethod] = useState('Phone');
  const [contactOutcome, setContactOutcome] = useState('Connected');
  const [feedback1, setFeedback1] = useState('');
  const [feedback2, setFeedback2] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [contactDate, setContactDate] = useState(new Date().toISOString().split('T')[0]);
  const [contactNextFollowUp, setContactNextFollowUp] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadCandidate();
  }, [personId]);

  const loadCandidate = async () => {
    setLoading(true);
    try {
      const data = await dbService.getCandidateById(personId);
      if (data) {
        if (isPhoneNumber(data.full_name)) {
          const recovered = (data.primary_email ? extractCandidateNameFromEmail(data.primary_email) : null) || 'Candidate';
          data.full_name = recovered;
        }
        setCandidate(data);
        setNewStatus(data.current_status);
        setReassignRecruiterName((data.current_owner && data.current_owner !== 'Unassigned' && data.current_owner !== 'Adam') ? data.current_owner : 'Sia');
        setContactRecruiter((data.current_owner && data.current_owner !== 'Unassigned' && data.current_owner !== 'Adam') ? data.current_owner : 'Sia');
      } else {
        setCandidate(null);
      }
    } catch (err) {
      console.error('Failed to load candidate profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // Reassign Recruiter (Part 6E)
  const handleReassignRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !reassignRecruiterName.trim()) return;
    setReassignSubmitting(true);
    try {
      const res = await dbService.reassignRecruiter(
        candidate.id,
        reassignRecruiterName.trim(),
        reassignDate,
        reassignReason.trim() || undefined
      );
      if (res.success) {
        showToast('success', `Candidate reassigned to ${reassignRecruiterName.trim()} successfully!`);
        setReassignModalOpen(false);
        setReassignReason('');
        await loadCandidate();
      } else {
        showToast('error', res.error || 'Failed to reassign candidate');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to reassign candidate');
    } finally {
      setReassignSubmitting(false);
    }
  };

  // Record Contact Attempt (Part 6B)
  const handleAddContactAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !contactRecruiter.trim()) return;
    setContactSubmitting(true);
    try {
      const res = await dbService.addContactAttempt(candidate.id, {
        recruiterName: contactRecruiter.trim(),
        contactMethod,
        outcome: contactOutcome,
        feedback1: feedback1.trim() || undefined,
        feedback2: feedback2.trim() || undefined,
        notes: contactNotes.trim() || undefined,
        contactDate,
        nextFollowUp: contactNextFollowUp.trim() || undefined,
      });
      if (res.success) {
        showToast('success', 'Contact attempt and feedback recorded successfully!');
        setContactModalOpen(false);
        setFeedback1('');
        setFeedback2('');
        setContactNotes('');
        setContactNextFollowUp('');
        await loadCandidate();
      } else {
        showToast('error', res.error || 'Failed to record contact attempt');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to record contact attempt');
    } finally {
      setContactSubmitting(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    await dbService.updateStatus(candidate.id, newStatus, 'Recruiter Admin', statusReason);
    setStatusModalOpen(false);
    setStatusReason('');
    showToast('success', `Status updated to ${newStatus}`);
    loadCandidate();
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Loading candidate profile...</span>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="text-slate-600 text-sm">Candidate profile could not be located.</div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          Return to Candidates List
        </button>
      </div>
    );
  }

  // Strictly classify candidate URLs according to Part 3 specification
  const rawUrls: string[] = [];
  if (candidate.linkedin_url) rawUrls.push(...extractUrlsFromText(candidate.linkedin_url));
  if (candidate.resume_url) rawUrls.push(...extractUrlsFromText(candidate.resume_url));
  if ((candidate as any).unclassified_links) {
    const raw = (candidate as any).unclassified_links;
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) rawUrls.push(...arr);
  }
  // Check applications for resume or linkedin links
  (candidate.applications || []).forEach(a => {
    if (a.resume_link) rawUrls.push(...extractUrlsFromText(a.resume_link));
  });

  let strictlyClassifiedLinkedIn: string | null = null;
  let strictlyClassifiedResume: string | null = null;
  const unclassifiedLinks: string[] = [];

  rawUrls.forEach(url => {
    const c = classifyUrl(url);
    if (c.type === 'linkedin' && !strictlyClassifiedLinkedIn && c.cleanUrl) {
      strictlyClassifiedLinkedIn = c.cleanUrl;
    } else if (c.type === 'resume' && !strictlyClassifiedResume && c.cleanUrl) {
      strictlyClassifiedResume = c.cleanUrl;
    } else if (c.cleanUrl && !unclassifiedLinks.includes(c.cleanUrl)) {
      if (c.cleanUrl !== strictlyClassifiedLinkedIn && c.cleanUrl !== strictlyClassifiedResume) {
        unclassifiedLinks.push(c.cleanUrl);
      }
    }
  });

  // Deduplicate recruiter contacts to prevent identical feedback from ever repeating
  const seenContacts = new Set<string>();
  const uniqueRecruiterContacts = (candidate.recruiter_contacts || []).filter((c) => {
    const cDate = c.contact_date || (c as any).created_at?.split('T')[0] || '';
    const cRec = (c.recruiter_name || '').trim().toLowerCase();
    const cF1 = ((c as any).feedback_1 || '').trim().toLowerCase();
    const cF2 = ((c as any).feedback_2 || '').trim().toLowerCase();
    const cRaw = ((c as any).raw_feedback || c.notes || '').trim().toLowerCase();
    const cKey = `${cDate}:::${cRec}:::${cF1}:::${cF2}:::${cRaw}`;
    if (seenContacts.has(cKey)) return false;
    seenContacts.add(cKey);
    return true;
  });

  // Calculate Accurate Summary Metrics (Part 7D: Distinct metrics, not combined!)
  const applicationsCount = candidate.applications?.length || 0;
  const totalApplications = candidate.total_applications || applicationsCount || 1;
  const repeatApplications = candidate.repeat_applications !== undefined ? candidate.repeat_applications : Math.max(0, applicationsCount - 1);

  const allRecruiterNames = new Set<string>();
  if (candidate.current_owner && candidate.current_owner !== 'Unassigned') allRecruiterNames.add(candidate.current_owner);
  if (candidate.first_assigned_recruiter) allRecruiterNames.add(candidate.first_assigned_recruiter);
  if (candidate.last_contacted_by) allRecruiterNames.add(candidate.last_contacted_by);
  (candidate.assignments || []).forEach(a => { if (a.recruiter_name) allRecruiterNames.add(a.recruiter_name); });
  uniqueRecruiterContacts.forEach(c => { if (c.recruiter_name) allRecruiterNames.add(c.recruiter_name); });
  const uniqueRecruitersCount = allRecruiterNames.size;

  const assignmentsCount = candidate.assignments?.length || (candidate.current_owner ? 1 : 0);
  const contactAttemptsCount = uniqueRecruiterContacts.length;

  // Key Dates & Roles
  const primaryApp = candidate.applications?.[0];
  const companyContext = candidate.current_company || primaryApp?.company || 'AaraTech';
  const roleDisplay = cleanJobTitle(candidate.current_title || primaryApp?.job_title) || 'Candidate Application';
  const rawAssignedDate = candidate.last_assignment_date || candidate.recruiter_assigned_date || primaryApp?.date_applied || candidate.created_at;
  const assignedDateDisplay = formatDateDisplay(rawAssignedDate, 'Not recorded');
  const rawCollectionDate = candidate.application_collected_date || (primaryApp as any)?.application_collected_date || primaryApp?.date_applied || candidate.created_at;
  const collectionDateDisplay = formatDateDisplay(rawCollectionDate, 'Not recorded');
  const firstAppliedDate = formatDateDisplay(candidate.first_applied_date || primaryApp?.date_applied || rawCollectionDate, 'Not recorded');
  const lastAppliedDate = formatDateDisplay(candidate.last_applied_date || primaryApp?.date_applied || rawCollectionDate, 'Not recorded');
  const lastActivityDisplay = formatDateDisplay(candidate.last_activity_at, 'N/A');
  const ownerDisplay = (!candidate.current_owner || candidate.current_owner === 'Unassigned' || candidate.current_owner === 'Adam') ? 'Needs assignment' : candidate.current_owner;
  const greenCardDisplay = candidate.green_card || (primaryApp as any)?.green_card || 'Not specified';
  const h1bDisplay = candidate.h1b_status || (primaryApp as any)?.h1b_status || 'Not specified';
  const lastContactDateDisplay = formatDateDisplay(candidate.last_contact_date || (uniqueRecruiterContacts[0]?.contact_date), 'Not contacted');
  const nextFollowUpDisplay = formatDateDisplay((uniqueRecruiterContacts.find(c => (c as any).next_follow_up) as any)?.next_follow_up, 'None recorded');

  // Profile Completeness Score (Section 9)
  let completenessScore = 0;
  if (candidate.full_name && !isPhoneNumber(candidate.full_name)) completenessScore += 15;
  if (candidate.primary_email) completenessScore += 20;
  if (candidate.primary_phone) completenessScore += 20;
  if (candidate.location) completenessScore += 10;
  if (candidate.current_title || applicationsCount > 0) completenessScore += 15;
  if (strictlyClassifiedResume || strictlyClassifiedLinkedIn) completenessScore += 10;
  if (candidate.green_card || candidate.h1b_status) completenessScore += 10;

  // Consolidated Chronological Timeline Events (Part 3C)
  const timelineEvents: {
    id: string;
    date: string;
    type: 'intake' | 'assignment' | 'contact' | 'application';
    title: string;
    badge?: string;
    details?: string;
  }[] = [];

  if (candidate.application_collected_date || candidate.created_at) {
    timelineEvents.push({
      id: 'intake',
      date: candidate.application_collected_date || candidate.created_at?.split('T')[0] || '',
      type: 'intake',
      title: 'Candidate Profile Collected from LinkedIn',
      badge: companyContext,
      details: primaryApp?.source_file ? `Import source: ${primaryApp.source_file}` : undefined,
    });
  }

  (candidate.applications || []).forEach((app, i) => {
    timelineEvents.push({
      id: `app-${app.id || i}`,
      date: (app as any).application_collected_date || app.date_applied || app.created_at?.split('T')[0] || '',
      type: 'application',
      title: `Application Registered: ${cleanJobTitle(app.job_title)}`,
      badge: app.company,
      details: `Stage: ${app.current_stage || 'Applied'}${app.source_file ? ` • Source: ${app.source_file}` : ''}`,
    });
  });

  (candidate.assignments || []).forEach((assign, i) => {
    timelineEvents.push({
      id: `assign-${assign.id || i}`,
      date: assign.assigned_date || '',
      type: 'assignment',
      title: `Recruiter Assigned: ${assign.recruiter_name}`,
      badge: assign.status,
      details: assign.reassignment_reason ? `Reason: ${assign.reassignment_reason}` : undefined,
    });
  });

  uniqueRecruiterContacts.forEach((c, i) => {
    timelineEvents.push({
      id: `contact-${c.id || i}`,
      date: c.contact_date || (c as any).created_at?.split('T')[0] || '',
      type: 'contact',
      title: `Contact Attempt by ${c.recruiter_name}`,
      badge: c.contact_type || (c as any).contact_method || 'Phone',
      details: `${(c as any).outcome || 'Logged'}${c.notes ? ` • ${c.notes}` : ''}${(c as any).feedback_1 ? ` • Feedback 1: ${(c as any).feedback_1}` : ''}${(c as any).feedback_2 ? ` • Feedback 2: ${(c as any).feedback_2}` : ''}`,
    });
  });

  timelineEvents.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Data Quality Issues Audit (Section 9)
  interface DataQualityIssue {
    id: string;
    type: 'error' | 'warning' | 'info';
    category: string;
    title: string;
    explanation: string;
    evidence: string;
    source?: string;
    recommendedAction: string;
  }

  const dataQualityIssues: DataQualityIssue[] = [];

  // 1. Duplicate Application Check
  const appMap = new Map<string, Application[]>();
  (candidate.applications || []).forEach(a => {
    const normKey = `${(a.company || '').toLowerCase()}|${cleanJobTitle(a.job_title).toLowerCase()}`;
    const list = appMap.get(normKey) || [];
    list.push(a);
    appMap.set(normKey, list);
  });
  appMap.forEach((apps, key) => {
    if (apps.length > 1) {
      dataQualityIssues.push({
        id: `dup-app-${key}`,
        type: 'error',
        category: 'Duplicate Applications',
        title: 'Duplicate Application Records Detected',
        explanation: `Candidate has ${apps.length} applications registered for the same company and role (${apps[0].company} - ${cleanJobTitle(apps[0].job_title)}).`,
        evidence: `Application IDs: ${apps.map(a => a.id).join(', ')}`,
        source: apps[0].source_file || undefined,
        recommendedAction: 'Consolidate redundant application records into one canonical application entry.',
      });
    }
  });

  // 2. Missing Essential Contact Details
  if (!candidate.full_name || isPhoneNumber(candidate.full_name)) {
    dataQualityIssues.push({
      id: 'missing-name',
      type: 'warning',
      category: 'Missing Essential Field',
      title: 'Candidate Name Incomplete or Numeric',
      explanation: 'The full name field contains a numeric phone string or is blank.',
      evidence: `Current value: "${candidate.full_name || 'Empty'}"`,
      recommendedAction: 'Edit candidate profile to supply a valid full name.',
    });
  }

  if (!candidate.primary_email && !candidate.primary_phone) {
    dataQualityIssues.push({
      id: 'missing-both-contacts',
      type: 'error',
      category: 'Missing Essential Field',
      title: 'Missing All Direct Contact Channels',
      explanation: 'Candidate record has neither an email address nor a phone number.',
      evidence: 'Both primary_email and primary_phone are null or empty.',
      recommendedAction: 'Collect and add contact details to enable outreach.',
    });
  } else {
    if (!candidate.primary_email) {
      dataQualityIssues.push({
        id: 'missing-email',
        type: 'info',
        category: 'Missing Field',
        title: 'Missing Primary Email Address',
        explanation: 'Candidate lacks an email address; outreach must rely entirely on phone.',
        evidence: 'primary_email is blank',
        recommendedAction: 'Request candidate email during next phone screening.',
      });
    }
    if (!candidate.primary_phone) {
      dataQualityIssues.push({
        id: 'missing-phone',
        type: 'info',
        category: 'Missing Field',
        title: 'Missing Primary Phone Number',
        explanation: 'Candidate lacks a phone number; outreach must rely entirely on email/LinkedIn.',
        evidence: 'primary_phone is blank',
        recommendedAction: 'Extract phone number from resume or request in follow-up email.',
      });
    }
  }

  // 3. Missing Job Role or Company
  if (!candidate.current_title && applicationsCount === 0) {
    dataQualityIssues.push({
      id: 'missing-role',
      type: 'warning',
      category: 'Missing Association',
      title: 'Missing Job Role Association',
      explanation: 'Candidate profile is not linked to any specific job role or title.',
      evidence: 'current_title and applications are empty',
      recommendedAction: 'Assign candidate to an active role or application slot.',
    });
  }

  // 4. Unassigned Recruiter Ownership
  if (!candidate.current_owner || candidate.current_owner === 'Unassigned' || candidate.current_owner === 'Adam') {
    dataQualityIssues.push({
      id: 'unassigned-owner',
      type: 'info',
      category: 'Recruiter History',
      title: 'Unassigned Recruiter Owner',
      explanation: 'Candidate is currently in the unassigned pool without an active assigned recruiter.',
      evidence: `current_owner: "${candidate.current_owner || 'Unassigned'}"`,
      recommendedAction: 'Use "Reassign Recruiter" button to allocate candidate to an active recruiter.',
    });
  }

  // 5. Document & Link Auditing
  if (!strictlyClassifiedLinkedIn && !strictlyClassifiedResume) {
    dataQualityIssues.push({
      id: 'missing-documents',
      type: 'info',
      category: 'Documents & Links',
      title: 'No Classified LinkedIn Profile or Resume Found',
      explanation: 'Neither a valid linkedin.com URL nor a Google Drive resume link was identified.',
      evidence: 'Both LinkedIn and Resume links are missing',
      recommendedAction: 'Add a verified LinkedIn profile URL or Google Drive resume link.',
    });
  }

  if (unclassifiedLinks.length > 0) {
    dataQualityIssues.push({
      id: 'unclassified-links',
      type: 'info',
      category: 'Documents & Links',
      title: 'Unclassified External Links Present',
      explanation: `${unclassifiedLinks.length} URL(s) exist that do not match the strict classification rules (must be linkedin.com or drive.google.com).`,
      evidence: unclassifiedLinks.slice(0, 3).join(', '),
      recommendedAction: 'Inspect external links and verify if any should be mapped to resume or profile.',
    });
  }

  // 6. Conflicting Contacts
  if (candidate.secondary_email && candidate.primary_email && candidate.secondary_email.toLowerCase() === candidate.primary_email.toLowerCase()) {
    dataQualityIssues.push({
      id: 'redundant-email',
      type: 'info',
      category: 'Conflict & Redundancy',
      title: 'Redundant Secondary Email',
      explanation: 'Secondary email is identical to primary email.',
      evidence: candidate.primary_email,
      recommendedAction: 'Remove duplicate secondary email in profile edit.',
    });
  }

  // 7. Recruiter History vs Owner Check
  if (candidate.current_owner && candidate.current_owner !== 'Unassigned' && (!candidate.assignments || candidate.assignments.length === 0)) {
    dataQualityIssues.push({
      id: 'owner-no-history',
      type: 'info',
      category: 'Recruiter History',
      title: 'Direct Recruiter Owner Without Prior Assignment Log',
      explanation: `Active owner is set to ${candidate.current_owner}, but no historical reassignment events were recorded in the audit log.`,
      evidence: 'assignments array is empty',
      recommendedAction: 'Normal for direct import. Subsequent reassignments will generate full historical audit entries.',
    });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-xs">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Candidates</span>
          </button>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500 font-medium">Master Candidate Database</span>
          <span className="text-slate-400">/</span>
          <span className="font-mono font-bold text-slate-800">{candidate.person_id}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-mono">
            Last Activity: {formatDateDisplay(candidate.last_activity_at, 'N/A')}
          </span>
        </div>
      </div>

      {/* Auto-Merge Alert Banner */}
      {autoMergeAlert && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              High-confidence candidate match consolidated with duplicate ID{' '}
              <strong className="font-mono">{autoMergeAlert.mergedWithId}</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAutoMergeAlert(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* PART 7A — COMPACT CANDIDATE HEADER */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {candidate.full_name}
              </h1>
              <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {candidate.person_id}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${companyContext === 'AaraTech'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}
              >
                {companyContext}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${candidate.current_status === 'Open'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : candidate.current_status === 'Review'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : candidate.current_status === 'Contacted'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : candidate.current_status === 'Follow-up'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
              >
                {candidate.current_status}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${candidate.gender === 'Male'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : candidate.gender === 'Female'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
              >
                {candidate.gender || 'Unspecified'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <div className="flex items-center gap-1 font-medium text-slate-800">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                <span>{roleDisplay}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Collected: <strong className="text-slate-700">{collectionDateDisplay}</strong></span>
              </div>
              <div className="flex items-center gap-1 text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Last Activity: <strong className="text-slate-700">{lastActivityDisplay}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Current Owner:</span>
                <span className="px-2 py-0.5 rounded font-bold text-xs bg-blue-50 text-blue-700 border border-blue-200">
                  {ownerDisplay}
                </span>
              </div>
            </div>

            {/* Compact Contact Badges */}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
              {candidate.primary_email ? (
                <a
                  href={`mailto:${candidate.primary_email}`}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Mail className="w-3 h-3 text-slate-400" />
                  <span>{candidate.primary_email}</span>
                </a>
              ) : (
                <span className="text-slate-400 italic">No email</span>
              )}
              {candidate.primary_phone ? (
                <a
                  href={`tel:${candidate.primary_phone}`}
                  className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-blue-600"
                >
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{formatPureDigitsPhone(candidate.primary_phone) || candidate.primary_phone}</span>
                </a>
              ) : (
                <span className="text-slate-400 italic">No phone</span>
              )}
              {candidate.location && (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span>{candidate.location}</span>
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditProfileModalOpen(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit Profile</span>
            </button>
            <button
              type="button"
              onClick={() => setReassignModalOpen(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Authorized Recruiter Reassignment (Part 6E)"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>Reassign Recruiter</span>
            </button>
            <button
              type="button"
              onClick={() => setContactModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="Record genuine contact attempt and feedback (Part 6B)"
            >
              <PhoneCall className="w-3.5 h-3.5 text-white" />
              <span>Add Contact Attempt</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('applications')}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="View Applications Tab"
            >
              <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
              <span>View Applications</span>
            </button>
          </div>
        </div>

        {/* PART 7D — ACCURATE SUMMARY METRICS (4 minimal cards, strictly not combined!) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 mt-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
            <div className="text-lg font-bold text-slate-900">{applicationsCount}</div>
            <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Applications</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
            <div className="text-lg font-bold text-slate-900">{uniqueRecruitersCount}</div>
            <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Unique Recruiters</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
            <div className="text-lg font-bold text-slate-900">{assignmentsCount}</div>
            <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Assignments</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 text-center border border-slate-100">
            <div className="text-lg font-bold text-slate-900">{contactAttemptsCount}</div>
            <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Contact Attempts</div>
          </div>
        </div>
      </div>

      {/* PART 7B — SEPARATE TABS BAR */}
      <div className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'overview'
            ? 'border-blue-600 text-blue-600 font-bold'
            : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('applications')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'applications'
            ? 'border-blue-600 text-blue-600 font-bold'
            : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Applications</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {applicationsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('recruiter_history')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'recruiter_history'
            ? 'border-blue-600 text-blue-600 font-bold'
            : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Recruiter History</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {assignmentsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feedback')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'feedback'
            ? 'border-blue-600 text-blue-600 font-bold'
            : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Feedback</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {contactAttemptsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'documents'
            ? 'border-blue-600 text-blue-600 font-bold'
            : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Documents &amp; Links</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('data_quality')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'data_quality'
            ? 'border-blue-600 text-blue-600 font-bold'
            : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
        >
          {dataQualityIssues.some(i => i.type === 'error') ? (
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          )}
          <span>Data Quality</span>
          {dataQualityIssues.length > 0 ? (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${dataQualityIssues.some(i => i.type === 'error')
                ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-800'
                }`}
            >
              {dataQualityIssues.length}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-bold">
              ✓
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('source_history')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'source_history'
            ? 'border-blue-600 text-blue-600 font-bold'
            : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Source History</span>
          {candidate.transfers && candidate.transfers.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 text-purple-700 font-bold">
              {candidate.transfers.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: OVERVIEW (Section 3C) */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Card: Candidate Details */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                <span>Candidate Information</span>
              </h3>

              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Primary Email</span>
                  <span className="font-medium text-slate-800 break-all">{candidate.primary_email || 'Not available'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Primary Phone</span>
                  <span className="font-mono font-medium text-slate-800">{candidate.primary_phone || 'Not available'}</span>
                </div>

                {candidate.secondary_email && (
                  <div>
                    <span className="text-slate-400 block text-[11px]">Secondary Email</span>
                    <span className="font-medium text-slate-700 break-all">{candidate.secondary_email}</span>
                  </div>
                )}
                {candidate.secondary_phone && (
                  <div>
                    <span className="text-slate-400 block text-[11px]">Secondary Phone</span>
                    <span className="font-mono font-medium text-slate-700">{candidate.secondary_phone}</span>
                  </div>
                )}

                <div>
                  <span className="text-slate-400 block text-[11px]">Green Card / US-C</span>
                  <span className={`font-semibold ${greenCardDisplay.toLowerCase().includes('yes') ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {greenCardDisplay}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">H1B Y/N</span>
                  <span className={`font-semibold ${h1bDisplay.toLowerCase() === 'no' ? 'text-emerald-700' : h1bDisplay.toLowerCase() === 'yes' ? 'text-rose-700' : 'text-slate-800'}`}>
                    {h1bDisplay}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Current Location</span>
                  <span className="font-medium text-slate-800">{candidate.location || 'United States'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Gender</span>
                  <span className="font-medium text-slate-800">{candidate.gender || 'Unspecified'}</span>
                </div>

                {candidate.preferred_location && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[11px]">Preferred Location / Relocation</span>
                    <span className="font-medium text-slate-800">{candidate.preferred_location}</span>
                  </div>
                )}

                <div>
                  <span className="text-slate-400 block text-[11px]">LinkedIn Profile</span>
                  {strictlyClassifiedLinkedIn ? (
                    <a
                      href={strictlyClassifiedLinkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                    >
                      <span>View Profile</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">Not available</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Resume Document</span>
                  {strictlyClassifiedResume ? (
                    <a
                      href={strictlyClassifiedResume}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-purple-600 hover:underline font-semibold"
                    >
                      <span>View Resume</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">Not available</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Card: Recruitment Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Recruitment Summary</span>
              </h3>

              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Current Owner</span>
                  <span className={`font-bold ${ownerDisplay === 'Needs assignment' ? 'text-amber-700' : 'text-blue-700'}`}>{ownerDisplay}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">First Assigned Recruiter</span>
                  <span className="font-medium text-slate-800">{candidate.first_assigned_recruiter || 'Not recorded'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">First Confirmed Contacted By</span>
                  <span className="font-medium text-slate-800">{candidate.first_confirmed_contacted_by || 'Not confirmed'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Last Contacted By</span>
                  <span className="font-medium text-slate-800">{candidate.last_contacted_by || 'Not contacted'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Latest Recorded Outcome</span>
                  <span className="font-medium text-slate-800">{candidate.latest_contact_outcome || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Last Assignment Date</span>
                  <span className="font-mono text-slate-700">{assignedDateDisplay}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Last Contact Date</span>
                  <span className="font-mono text-slate-700">{lastContactDateDisplay}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Next Follow-up Date</span>
                  <span className="font-mono text-purple-700 font-semibold">{nextFollowUpDisplay}</span>
                </div>

                {/* Sub-counts */}
                <div className="col-span-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                  <span>Applications: <strong className="text-slate-900">{applicationsCount}</strong></span>
                  <span>Recruiter Assignments: <strong className="text-slate-900">{assignmentsCount}</strong></span>
                  <span>Contact Attempts: <strong className="text-slate-900">{contactAttemptsCount}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Timeline (Genuine historical events sorted chronologically) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Recent Activity Timeline</span>
              </h3>
              <span className="text-[11px] text-slate-400">Chronological verified events</span>
            </div>

            <div className="space-y-3 pt-1">
              {timelineEvents.length > 0 ? (
                timelineEvents.map((evt) => (
                  <div key={evt.id} className="flex items-start gap-3 text-xs">
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${evt.type === 'intake'
                        ? 'bg-blue-600'
                        : evt.type === 'application'
                          ? 'bg-indigo-600'
                          : evt.type === 'assignment'
                            ? 'bg-purple-600'
                            : 'bg-emerald-600'
                        }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{evt.title}</span>
                        {evt.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {evt.badge}
                          </span>
                        )}
                        <span className="text-slate-400 font-mono text-[11px]">{formatDateDisplay(evt.date, 'Not dated')}</span>
                      </div>
                      {evt.details && (
                        <div className="text-slate-600 text-[11px] mt-0.5 whitespace-pre-wrap">{evt.details}</div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic py-2">
                  No timeline events recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: APPLICATIONS (Section 6 & 19: Repeat Application Tracking) */}
      {activeTab === 'applications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Application Occurrence Timeline</h3>
                {repeatApplications > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                    <RotateCcw className="w-3 h-3 text-amber-600" />
                    <span>Repeat Candidate ({repeatApplications} repeat application{repeatApplications !== 1 ? 's' : ''})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>First-Time Applicant</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Preserves separate application occurrences across roles, technologies, and dates without overwriting candidate history.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded font-mono text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {totalApplications} Total Application{totalApplications !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Quick Technology & Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">First Applied Date</span>
              <span className="font-mono font-semibold text-slate-800 text-xs mt-0.5 block">{firstAppliedDate}</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Latest Applied Date</span>
              <span className="font-mono font-semibold text-slate-800 text-xs mt-0.5 block">{lastAppliedDate}</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Technology Breakdown</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {(() => {
                  const techCounts = new Map<string, number>();
                  (candidate.applications || []).forEach(a => {
                    const tech = a.technology || cleanJobTitle(a.job_title) || 'General';
                    techCounts.set(tech, (techCounts.get(tech) || 0) + 1);
                  });
                  return Array.from(techCounts.entries()).map(([tech, count]) => (
                    <span key={tech} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-slate-700">
                      {tech} ({count})
                    </span>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Current vs Previous Application Comparison (Section 19) */}
          {candidate.applications && candidate.applications.length > 1 && (() => {
            const sortedApps = [...candidate.applications].sort((a, b) =>
              (b.date_applied || '').localeCompare(a.date_applied || '')
            );
            const latestApp = sortedApps[0];
            const previousApp = sortedApps[1];
            const resumeChanged = Boolean(latestApp.resume_link && previousApp.resume_link && latestApp.resume_link !== previousApp.resume_link);
            const roleChanged = cleanJobTitle(latestApp.job_title) !== cleanJobTitle(previousApp.job_title);

            return (
              <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/30 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                      Current vs Previous Application Comparison (Section 19)
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                    Comparing Latest (App #{sortedApps.length}) vs Prior (App #{sortedApps.length - 1})
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left bg-white rounded-lg border border-indigo-100 overflow-hidden">
                    <thead className="bg-indigo-50/70 text-indigo-900 font-bold border-b border-indigo-100">
                      <tr>
                        <th className="py-2 px-3 w-1/4">Comparison Field</th>
                        <th className="py-2 px-3 w-3/8 text-slate-700">Previous Application</th>
                        <th className="py-2 px-3 w-3/8 text-indigo-900">Current (Latest) Application</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-500">Job Role / Position</td>
                        <td className="py-2 px-3 font-medium text-slate-700">{cleanJobTitle(previousApp.job_title)}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{cleanJobTitle(latestApp.job_title)}</span>
                            {roleChanged && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                New Role
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-500">Technology / Domain</td>
                        <td className="py-2 px-3 text-slate-700">{previousApp.technology || cleanJobTitle(previousApp.job_title)}</td>
                        <td className="py-2 px-3 font-semibold text-indigo-900">{latestApp.technology || cleanJobTitle(latestApp.job_title)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-500">Company Context</td>
                        <td className="py-2 px-3 text-slate-700">{previousApp.company}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{latestApp.company}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-500">Application Date</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{previousApp.date_applied || 'Not recorded'}</td>
                        <td className="py-2 px-3 font-mono font-bold text-indigo-900">{latestApp.date_applied || 'Not recorded'}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-500">Screening Outcome</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {previousApp.screening_result || previousApp.current_stage || 'PASS'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {latestApp.screening_result || latestApp.current_stage || 'PASS'}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-500">Resume Document</td>
                        <td className="py-2 px-3">
                          {previousApp.resume_link ? (
                            <a href={previousApp.resume_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold inline-flex items-center gap-1">
                              <span>Prior Resume</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {latestApp.resume_link ? (
                              <a href={latestApp.resume_link} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline font-semibold inline-flex items-center gap-1">
                                <span>Latest Resume</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                            {resumeChanged ? (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                                Updated Resume Link
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[10px] text-slate-500 bg-slate-100">
                                Same Link
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-500">Source Provenance</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                          {previousApp.source_file ? `${previousApp.source_file}${previousApp.source_row ? ` (Row ${previousApp.source_row})` : ''}` : 'Direct intake'}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700">
                          {latestApp.source_file ? `${latestApp.source_file}${latestApp.source_row ? ` (Row ${latestApp.source_row})` : ''}` : 'Direct intake'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Chronological Applications List */}
          {candidate.applications && candidate.applications.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">App #</th>
                    <th className="py-2.5 px-3">Company</th>
                    <th className="py-2.5 px-3">Job Role</th>
                    <th className="py-2.5 px-3">Technology</th>
                    <th className="py-2.5 px-3">Job ID / Slot</th>
                    <th className="py-2.5 px-3">Date Applied / Collected</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Source Provenance</th>
                    <th className="py-2.5 px-3 text-right">Resume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidate.applications.map((app, idx) => (
                    <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-bold font-mono text-slate-700">
                        {idx === 0 ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            #{candidate.applications!.length - idx} (Latest)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 bg-slate-100">
                            #{candidate.applications!.length - idx}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${app.company === 'AaraTech'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                        >
                          {app.company}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {cleanJobTitle(app.job_title)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">
                        {app.technology || cleanJobTitle(app.job_title)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {app.job_id || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {(app as any).application_collected_date || app.date_applied || 'Not recorded'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${app.current_stage === 'PASS' || app.current_stage === 'Applied'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                            }`}
                        >
                          {app.screening_result || app.current_stage || 'PASS'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {app.source_file ? `${app.source_file}${app.source_row ? ` (Row ${app.source_row})` : ''}` : 'Direct intake'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {app.resume_link ? (
                          <a
                            href={app.resume_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-semibold inline-flex items-center gap-1"
                          >
                            <span>Resume</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No applications recorded for this candidate profile.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RECRUITER HISTORY */}
      {activeTab === 'recruiter_history' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recruiter Assignment History</h3>
              <p className="text-xs text-slate-500">
                Chronological record of every recruiter assignment and reassignment event (Part 6A).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReassignModalOpen(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Reassign</span>
            </button>
          </div>

          {candidate.assignments && candidate.assignments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Recruiter</th>
                    <th className="py-2.5 px-3">Assigned Date</th>
                    <th className="py-2.5 px-3">Assignment Status</th>
                    <th className="py-2.5 px-3">Reassignment Reason</th>
                    <th className="py-2.5 px-3">Recorded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidate.assignments.map((assign) => (
                    <tr key={assign.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {assign.recruiter_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {assign.assigned_date}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${assign.status === 'Current'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                        >
                          {assign.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {assign.reassignment_reason || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {assign.created_at ? new Date(assign.created_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-600 flex items-center justify-between">
              <div>
                Current active owner is <strong>{ownerDisplay}</strong>. (Historical assignments were not explicitly logged).
              </div>
              <button
                type="button"
                onClick={() => setReassignModalOpen(true)}
                className="text-blue-600 hover:underline font-semibold"
              >
                Log New Assignment
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FEEDBACK */}
      {activeTab === 'feedback' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recruiter Feedback &amp; Contact Attempts</h3>
              <p className="text-xs text-slate-500">
                Word-for-word feedback records preserved chronologically without overwriting older notes (Part 6B).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContactModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Feedback</span>
            </button>
          </div>

          {uniqueRecruiterContacts && uniqueRecruiterContacts.length > 0 ? (
            <div className="space-y-3">
              {uniqueRecruiterContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="bg-slate-50/70 border border-slate-200 rounded-lg p-4 space-y-2 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{contact.recruiter_name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {contact.contact_type || (contact as any).contact_method || 'Phone'}
                      </span>
                      {(contact as any).outcome && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-800">
                          {(contact as any).outcome}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{formatDateDisplay(contact.contact_date || (contact as any).created_at, 'Unknown Date')}</span>
                    </div>
                  </div>

                  {/* Feedback 1 / Call Status */}
                  {(contact as any).feedback_1 && (
                    <div className="text-xs">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase">Feedback 1 / Call Status:</span>
                      <div className="font-mono text-slate-800 bg-white p-2 rounded border border-slate-200 mt-0.5">
                        {(contact as any).feedback_1}
                      </div>
                    </div>
                  )}

                  {/* Feedback 2 */}
                  {(contact as any).feedback_2 && (
                    <div className="text-xs">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase">Feedback 2:</span>
                      <div className="font-mono text-slate-800 bg-white p-2 rounded border border-slate-200 mt-0.5">
                        {(contact as any).feedback_2}
                      </div>
                    </div>
                  )}

                  {/* Additional Feedback Columns (Feedback 3, 4, 5, 6...) */}
                  {(() => {
                    const addFb = (contact as any).additional_feedback;
                    if (!addFb) return null;
                    try {
                      const parsed = typeof addFb === 'string' ? JSON.parse(addFb) : addFb;
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        return (
                          <div className="space-y-2">
                            {parsed.map((item: any, idx: number) => {
                              const label = item.label || `Feedback ${item.feedbackIndex || idx + 3}`;
                              const text = item.text || item.value || (typeof item === 'string' ? item : '');
                              if (!text) return null;
                              return (
                                <div key={idx} className="text-xs">
                                  <span className="text-[11px] font-semibold text-slate-500 uppercase">{label}:</span>
                                  <div className="font-mono text-slate-800 bg-white p-2 rounded border border-slate-200 mt-0.5 whitespace-pre-wrap">
                                    {text}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }
                    } catch { }
                    return null;
                  })()}

                  {/* Notes / Verbatim Feedback (Show if notes exist and have distinct content not already fully shown above) */}
                  {(() => {
                    if (!contact.notes) return null;
                    const notesTrimmed = contact.notes.trim();
                    const f1 = ((contact as any).feedback_1 || '').trim();
                    const f2 = ((contact as any).feedback_2 || '').trim();
                    const hasAddFb = !!(contact as any).additional_feedback;

                    // If additional_feedback already displays all items (which was formed from notesCombined), don't duplicate
                    if (hasAddFb) return null;

                    // If only f1 or f2 existed and notes is identical to f1, f2, or f1 + f2, don't duplicate
                    if (notesTrimmed === f1 || notesTrimmed === f2 || notesTrimmed === `${f1}\n${f2}` || notesTrimmed === `${f1} • ${f2}`) {
                      return null;
                    }

                    return (
                      <div className="text-xs">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase">Notes:</span>
                        <div className="font-mono text-slate-800 bg-white p-2 rounded border border-slate-200 mt-0.5 whitespace-pre-wrap">
                          {contact.notes}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Next Follow Up */}
                  {(contact as any).next_follow_up && (
                    <div className="text-[11px] text-purple-700 font-medium">
                      Next Follow-up Date: {(contact as any).next_follow_up}
                    </div>
                  )}

                  {/* Source provenance */}
                  {(contact as any).source_file && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      Source: {(contact as any).source_file}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No recruiter feedback or contact attempts recorded yet.
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DOCUMENTS & LINKS (Strict URL Rules from Part 3) */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Documents and Profile Links</h3>
            <p className="text-xs text-slate-500">
              Strict URL Classification: linkedin.com URLs are LinkedIn Profiles; drive.google.com URLs are Resumes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* LinkedIn Profile Card */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>LinkedIn Profile</span>
                </span>
                {strictlyClassifiedLinkedIn && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    linkedin.com Verified
                  </span>
                )}
              </div>

              {strictlyClassifiedLinkedIn ? (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-mono text-slate-700 bg-white p-2 rounded border border-slate-200 truncate">
                    {strictlyClassifiedLinkedIn}
                  </div>
                  <a
                    href={strictlyClassifiedLinkedIn}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <span>View Profile ↗</span>
                  </a>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic py-2">
                  Not available
                </div>
              )}
            </div>

            {/* Resume Card */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span>Resume</span>
                </span>
                {strictlyClassifiedResume && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                    drive.google.com Verified
                  </span>
                )}
              </div>

              {strictlyClassifiedResume ? (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-mono text-slate-700 bg-white p-2 rounded border border-slate-200 truncate">
                    {strictlyClassifiedResume}
                  </div>
                  <a
                    href={strictlyClassifiedResume}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <span>View Resume ↗</span>
                  </a>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic py-2">
                  Not available
                </div>
              )}
            </div>
          </div>

          {/* Unclassified Source Links */}
          {unclassifiedLinks.length > 0 && (
            <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/40 space-y-2">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-600" />
                <span>Unclassified Source Links (Preserved without guessing)</span>
              </div>
              <div className="space-y-1.5 pt-1">
                {unclassifiedLinks.map((link, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-amber-200">
                    <span className="font-mono text-slate-700 truncate max-w-lg">{link}</span>
                    <a
                      href={link.startsWith('http') ? link : `https://${link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      <span>Open Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: DATA QUALITY (Section 9) */}
      {activeTab === 'data_quality' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Candidate Data Quality &amp; Integrity Audit</h3>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${dataQualityIssues.length === 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : dataQualityIssues.some(i => i.type === 'error')
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                >
                  {dataQualityIssues.length === 0
                    ? '100% Quality Clean'
                    : `${dataQualityIssues.length} Quality Notice${dataQualityIssues.length !== 1 ? 's' : ''}`}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated diagnostics inspecting duplicate applications, missing identity values, conflicting contacts, recruiter provenance, and document links.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditProfileModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Manual Profile Correction</span>
              </button>
            </div>
          </div>

          {/* Completeness Score Gauge (Section 9) */}
          <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Candidate Profile Completeness Score</span>
              </span>
              <span className={`text-sm font-extrabold ${completenessScore >= 80 ? 'text-emerald-700' : completenessScore >= 50 ? 'text-amber-700' : 'text-rose-700'}`}>
                {completenessScore}% Complete
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${completenessScore >= 80 ? 'bg-emerald-500' : completenessScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${completenessScore}%` }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] text-slate-600">
              <span className={candidate.full_name && !isPhoneNumber(candidate.full_name) ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>✓ Name (15%)</span>
              <span className={candidate.primary_email ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>✓ Email (20%)</span>
              <span className={candidate.primary_phone ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>✓ Phone (20%)</span>
              <span className={candidate.location ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>✓ Location (10%)</span>
              <span className={candidate.current_title || applicationsCount > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>✓ Role / Apps (15%)</span>
              <span className={strictlyClassifiedResume || strictlyClassifiedLinkedIn ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>✓ Resume / LinkedIn (10%)</span>
              <span className={candidate.green_card || candidate.h1b_status ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>✓ Work Auth (10%)</span>
            </div>
          </div>

          {/* Clean State */}
          {dataQualityIssues.length === 0 ? (
            <div className="p-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-200/60 space-y-2">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-emerald-900">No Data Quality Issues Detected</h4>
              <p className="text-xs text-emerald-700 max-w-md mx-auto">
                All identity fields, contact methods, application history, recruiter assignments, and source provenance meet authoritative database standards.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dataQualityIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`p-4 rounded-xl border space-y-2.5 transition-colors ${issue.type === 'error'
                    ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                    : issue.type === 'warning'
                      ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                      : 'bg-blue-50/40 border-blue-200 text-blue-950'
                    }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${issue.type === 'error'
                          ? 'bg-rose-600 text-white'
                          : issue.type === 'warning'
                            ? 'bg-amber-600 text-white'
                            : 'bg-blue-600 text-white'
                          }`}
                      >
                        {issue.type}
                      </span>
                      <span className="font-semibold px-2 py-0.5 rounded text-[10px] bg-white border border-slate-200 text-slate-700">
                        {issue.category}
                      </span>
                      <span className="font-bold text-slate-900">{issue.title}</span>
                    </div>

                    {issue.source && (
                      <span className="text-[11px] font-mono text-slate-500">
                        Source: {issue.source}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">
                    {issue.explanation}
                  </p>

                  <div className="text-xs bg-white p-2.5 rounded-lg border border-slate-200/80 font-mono text-slate-800 break-all">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Evidence
                    </span>
                    {issue.evidence}
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <ArrowRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span><strong>Recommended Action:</strong> {issue.recommendedAction}</span>
                    </div>

                    {issue.category.includes('Recruiter') && (
                      <button
                        type="button"
                        onClick={() => setReassignModalOpen(true)}
                        className="text-blue-600 hover:underline font-semibold text-xs cursor-pointer"
                      >
                        Reassign Recruiter →
                      </button>
                    )}

                    {(issue.category.includes('Missing') || issue.category.includes('Contact')) && (
                      <button
                        type="button"
                        onClick={() => setEditProfileModalOpen(true)}
                        className="text-blue-600 hover:underline font-semibold text-xs cursor-pointer"
                      >
                        Edit Profile →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supporting Ingestion & Screening Audit Card */}
          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Supporting Provenance &amp; Work Authorization Audit</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Work Authorization &amp; Screening
                </span>
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Green Card / US-C:</span>
                    <span className="font-semibold text-slate-800">{greenCardDisplay}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">H1B Status:</span>
                    <span className={`font-semibold ${h1bDisplay.toLowerCase() === 'no' ? 'text-emerald-700' : h1bDisplay.toLowerCase() === 'yes' ? 'text-rose-700' : 'text-slate-800'}`}>{h1bDisplay}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Effective Screening Stage:</span>
                    <span className="font-bold text-emerald-700">
                      {(primaryApp as any)?.effective_result || primaryApp?.current_stage || 'PASS'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Source Provenance &amp; System Timestamps
                </span>
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Source File:</span>
                    <span className="font-mono text-slate-800 truncate max-w-[200px]" title={primaryApp?.source_file || 'Direct Import'}>
                      {primaryApp?.source_file || 'Direct Import'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Source Row:</span>
                    <span className="font-mono text-slate-800">
                      {primaryApp?.source_row ? `Row ${primaryApp.source_row}` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Ingestion Timestamp:</span>
                    <span className="font-mono text-slate-800">
                      {candidate.created_at ? new Date(candidate.created_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: SOURCE HISTORY & AUDIT TRAIL (Section 16 & 24) */}
      {activeTab === 'source_history' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Source Provenance &amp; Transfer Audit History</h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  {candidate.person_id}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete audit trail of how this candidate and their application occurrences entered the Master Database.
              </p>
            </div>
          </div>

          {/* System Identity & Timestamps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Master Database Identification
              </span>
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Internal Person UUID:</span>
                  <span className="font-mono text-slate-800 text-[11px] truncate max-w-[220px]" title={candidate.id}>{candidate.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Public Person ID:</span>
                  <span className="font-mono font-bold text-blue-700">{candidate.person_id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Company Tenant:</span>
                  <span className="font-semibold text-slate-800">{candidate.company || companyContext}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Current Status:</span>
                  <span className="font-semibold text-slate-800">{candidate.current_status}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                System Lifecycle Timestamps
              </span>
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Profile Created At:</span>
                  <span className="font-mono text-slate-800">{candidate.created_at ? new Date(candidate.created_at).toLocaleString() : 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Profile Last Updated:</span>
                  <span className="font-mono text-slate-800">{candidate.updated_at ? new Date(candidate.updated_at).toLocaleString() : 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Last System Activity:</span>
                  <span className="font-mono text-slate-800">{candidate.last_activity_at ? new Date(candidate.last_activity_at).toLocaleString() : 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Intake / Collection Date:</span>
                  <span className="font-mono text-slate-800">{collectionDateDisplay}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transfer History (master_transfers) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <GitCommit className="w-3.5 h-3.5 text-purple-600" />
              <span>Screening to Master DB Transfer Audit Log</span>
            </h4>

            {candidate.transfers && candidate.transfers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Transfer ID</th>
                      <th className="py-2 px-3">Batch ID</th>
                      <th className="py-2 px-3">Screening ID</th>
                      <th className="py-2 px-3">Company</th>
                      <th className="py-2 px-3">Transfer Status</th>
                      <th className="py-2 px-3">Duplicate Intelligence</th>
                      <th className="py-2 px-3">Transferred At</th>
                      <th className="py-2 px-3">Transferred By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {candidate.transfers.map((t: any) => (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-semibold text-slate-900 truncate max-w-[120px]" title={t.id}>{t.id}</td>
                        <td className="py-2 px-3 text-slate-700 truncate max-w-[120px]" title={t.batch_id}>{t.batch_id}</td>
                        <td className="py-2 px-3 text-slate-700 truncate max-w-[120px]" title={t.screening_applicant_id}>{t.screening_applicant_id}</td>
                        <td className="py-2 px-3 font-semibold">{t.company}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.transfer_status === 'TRANSFERRED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                            {t.transfer_status}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans text-xs text-slate-800">{t.duplicate_check_result || 'PASSED TRANSFER'}</td>
                        <td className="py-2 px-3 text-slate-600">{t.transferred_at ? new Date(t.transferred_at).toLocaleString() : '—'}</td>
                        <td className="py-2 px-3 font-sans text-xs text-slate-700">{t.transferred_by || 'System'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                Candidate was onboarded directly into the Master Candidate Database or prior to individual transfer tracking. Subsequent transfers from the LinkedIn Filter will be audited here automatically.
              </div>
            )}
          </div>

          {/* Status Change History (master_status_history) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Status Audit Trail (master_status_history)</span>
            </h4>

            {candidate.status_history && candidate.status_history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Previous Status</th>
                      <th className="py-2 px-3">New Status</th>
                      <th className="py-2 px-3">Changed By</th>
                      <th className="py-2 px-3">Reason / Details</th>
                      <th className="py-2 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {candidate.status_history.map((sh: any) => (
                      <tr key={sh.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 text-slate-500">{sh.old_status || 'Initial'}</td>
                        <td className="py-2 px-3 font-bold text-blue-700">{sh.new_status}</td>
                        <td className="py-2 px-3 text-slate-700">{sh.changed_by || 'System'}</td>
                        <td className="py-2 px-3 text-slate-600">{sh.reason || '—'}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{sh.created_at ? new Date(sh.created_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                Initial status: <strong>{candidate.current_status}</strong>. No manual status transitions recorded.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: REASSIGN RECRUITER (Part 6E) */}
      {reassignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <span>Reassign Candidate Recruiter</span>
              </h3>
              <span className="font-mono text-xs font-bold text-blue-600">{candidate.person_id}</span>
            </div>

            <div className="text-xs text-slate-500">
              Reassignment updates the authoritative Current Owner, records the assignment date, and preserves historical assignments.
            </div>

            <form onSubmit={handleReassignRecruiter} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select or Enter New Recruiter Name:
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {['Adam', 'Alex', 'Sarah Jenkins'].map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setReassignRecruiterName(name)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center ${reassignRecruiterName === name
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={reassignRecruiterName}
                  onChange={(e) => setReassignRecruiterName(e.target.value)}
                  placeholder="Enter recruiter name..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assignment Date:
                </label>
                <input
                  type="date"
                  value={reassignDate}
                  onChange={(e) => setReassignDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reassignment Reason (Optional):
                </label>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="e.g. Workload rebalancing, role transfer, follow-up escalation"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReassignModalOpen(false)}
                  disabled={reassignSubmitting}
                  className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassignSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  {reassignSubmitting ? 'Saving...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD CONTACT ATTEMPT (Part 6B) */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-600" />
                <span>Record Contact Attempt &amp; Feedback</span>
              </h3>
              <span className="font-mono text-xs font-bold text-blue-600">{candidate.person_id}</span>
            </div>

            <div className="text-xs text-slate-500">
              Records a genuine contact attempt and verbatim feedback. Does not silently change candidate ownership.
            </div>

            <form onSubmit={handleAddContactAttempt} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recruiter Who Attempted:
                  </label>
                  <input
                    type="text"
                    value={contactRecruiter}
                    onChange={(e) => setContactRecruiter(e.target.value)}
                    placeholder="Recruiter name"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Channel:
                  </label>
                  <select
                    value={contactMethod}
                    onChange={(e) => setContactMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                  >
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="SMS">SMS / Text</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Date:
                  </label>
                  <input
                    type="date"
                    value={contactDate}
                    onChange={(e) => setContactDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Outcome:
                  </label>
                  <select
                    value={contactOutcome}
                    onChange={(e) => setContactOutcome(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                  >
                    <option value="Connected">Connected / Spoke</option>
                    <option value="Left Voicemail">Left Voicemail (VM)</option>
                    <option value="No Answer">No Answer / Ringing</option>
                    <option value="Email Sent">Email Sent</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Follow-up Scheduled">Follow-up Scheduled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Feedback 1 / Call Status:
                </label>
                <input
                  type="text"
                  value={feedback1}
                  onChange={(e) => setFeedback1(e.target.value)}
                  placeholder="e.g. VM/VM/VM or JD sent or Interested"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Feedback 2 / Detailed Notes (Verbatim):
                </label>
                <textarea
                  rows={3}
                  value={feedback2}
                  onChange={(e) => setFeedback2(e.target.value)}
                  placeholder="e.g. F1 OPT - Pursuing Masters in Cybersecurity. Looking for C2C or W2 roles in Dallas..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Next Follow-up Date (Optional):
                </label>
                <input
                  type="date"
                  value={contactNextFollowUp}
                  onChange={(e) => setContactNextFollowUp(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(false)}
                  disabled={contactSubmitting}
                  className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  {contactSubmitting ? 'Recording...' : 'Record Contact Attempt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Candidate Modal */}
      {candidate && (
        <EditCandidateModal
          candidate={candidate}
          isOpen={editProfileModalOpen}
          onClose={() => setEditProfileModalOpen(false)}
          onSuccess={(updated, autoMerged, mergedWithId) => {
            setCandidate(updated);
            if (autoMerged && mergedWithId) {
              setAutoMergeAlert({ mergedWithId });
            }
            loadCandidate();
          }}
        />
      )}
    </div>
  );
};
