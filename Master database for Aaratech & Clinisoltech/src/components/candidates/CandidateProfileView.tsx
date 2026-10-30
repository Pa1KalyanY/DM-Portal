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
  CheckCircle2,
  Clock,
  Layers,
  Edit2,
  ChevronRight,
  Info,
} from 'lucide-react';
import { dbService } from '../../lib/dbService';
import { Person, CandidateStatus, Application, RecruiterContact } from '../../types/database';
import { TimelineTab } from './TimelineTab';
import { EditCandidateModal } from './EditCandidateModal';
import { isPhoneNumber, extractCandidateNameFromEmail, cleanJobTitle } from '../../lib/normalization';

interface CandidateProfileViewProps {
  personId: string;
  onBack: () => void;
  onNavigateCandidate?: (id: string) => void;
}

type ProfileTab = 'timeline' | 'applications' | 'recruiter_history' | 'documents' | 'related';

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
}) => {
  const [candidate, setCandidate] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('timeline');

  // Modal states
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [autoMergeAlert, setAutoMergeAlert] = useState<{ mergedWithId: string } | null>(null);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<CandidateStatus>('Open');
  const [statusReason, setStatusReason] = useState('');

  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [newOwner, setNewOwner] = useState('');

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactRecruiter, setContactRecruiter] = useState('Admin Recruiter');
  const [contactType, setContactType] = useState('Phone');
  const [rawFeedback, setRawFeedback] = useState('');
  const [contactDate, setContactDate] = useState(new Date().toISOString().split('T')[0]);

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
        setNewOwner(data.current_owner || 'Unassigned');
      } else {
        setCandidate(null);
      }
    } catch (err) {
      console.error('Failed to load candidate profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    await dbService.updateStatus(candidate.id, newStatus, 'Admin Recruiter', statusReason);
    setStatusModalOpen(false);
    setStatusReason('');
    loadCandidate();
  };

  const handleUpdateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    await dbService.updateOwner(candidate.id, newOwner, 'Admin Recruiter');
    setOwnerModalOpen(false);
    loadCandidate();
  };

  const handleAddRecruiterContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !rawFeedback.trim()) return;
    await dbService.addRecruiterContact(
      candidate.id,
      contactRecruiter,
      contactType,
      rawFeedback.trim(),
      contactDate
    );
    setContactModalOpen(false);
    setRawFeedback('');
    loadCandidate();
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        Loading complete master candidate profile...
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="text-slate-600">Candidate profile could not be located.</div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold"
        >
          Return to Candidates List
        </button>
      </div>
    );
  }

  // Count unique recruiters
  const uniqueRecruiters = new Set(
    (candidate.recruiter_contacts || []).map(rc => rc.recruiter_name)
  ).size;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Back */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-slate-400">Master Database / Candidates /</span>
        <span className="text-xs font-mono font-bold text-slate-700">{candidate.person_id}</span>
      </div>

      {/* Auto-Merge Notification Banner */}
      {autoMergeAlert && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <strong className="font-bold">High-Confidence Duplicate Auto-Merged!</strong> Profile updates matched verified identity evidence. Successfully consolidated with duplicate record <span className="font-mono font-bold">{autoMergeAlert.mergedWithId}</span> into this primary master profile.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAutoMergeAlert(null)}
            className="p-1 text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Profile Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {candidate.full_name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-md font-mono text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {candidate.person_id}
              </span>
              {candidate.applications && candidate.applications[0]?.date_applied && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0" title="Date candidate assigned / applied">
                  <Calendar className="w-3 h-3 text-emerald-600" />
                  <span>Date Assigned: {candidate.applications[0].date_applied.split('T')[0].split('-').length === 3 ? `${candidate.applications[0].date_applied.split('T')[0].split('-')[1]}/${candidate.applications[0].date_applied.split('T')[0].split('-')[2]}/${candidate.applications[0].date_applied.split('T')[0].split('-')[0]}` : candidate.applications[0].date_applied}</span>
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-1">
                <select
                  value={candidate.gender || 'Unspecified'}
                  onChange={async (e) => {
                    const g = e.target.value as any;
                    await dbService.updateGender(candidate.id, g);
                    setCandidate({ ...candidate, gender: g });
                  }}
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold border transition-colors cursor-pointer ${
                    candidate.gender === 'Male'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : candidate.gender === 'Female'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title="Candidate Gender (Auto-detected or manually assigned)"
                >
                  <option value="Male">♂ Male</option>
                  <option value="Female">♀ Female</option>
                  <option value="Other">Other</option>
                  <option value="Unspecified">Unspecified</option>
                </select>
              </div>
            </div>

            <p className="text-sm text-slate-600 mt-1">
              {cleanJobTitle(candidate.headline || candidate.current_title || 'Data Analyst')}
              {candidate.current_company ? ` • ${candidate.current_company}` : ''}
            </p>

            {/* Quick Meta Row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-3">
              {candidate.applications && candidate.applications[0]?.date_applied && (
                <div className="flex items-center gap-1 font-mono text-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    Date Assigned: <strong className="text-slate-900">{candidate.applications[0].date_applied.split('T')[0].split('-').length === 3 ? `${candidate.applications[0].date_applied.split('T')[0].split('-')[1]}/${candidate.applications[0].date_applied.split('T')[0].split('-')[2]}/${candidate.applications[0].date_applied.split('T')[0].split('-')[0]}` : candidate.applications[0].date_applied}</strong>
                  </span>
                </div>
              )}
              {candidate.location ? (
                <div className="flex items-center gap-1 text-slate-700">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-semibold text-slate-800">{candidate.location}</span>
                  {candidate.preferred_location && (
                    <span className="text-slate-400 font-normal text-[11px]">(Pref: {candidate.preferred_location})</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditProfileModalOpen(true)}
                    className="text-blue-600 hover:underline text-[11px] font-semibold ml-0.5"
                  >
                    (Edit)
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditProfileModalOpen(true)}
                  className="flex items-center gap-1 text-blue-600 hover:underline font-semibold text-xs"
                >
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>+ Add Location</span>
                </button>
              )}
              <div className="flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Last Activity: {new Date(candidate.last_activity_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Current Owner:</span>
                <strong className="text-slate-800">{candidate.current_owner || 'Unassigned'}</strong>
                <button
                  onClick={() => setOwnerModalOpen(true)}
                  className="text-blue-600 hover:underline ml-1 font-semibold text-[11px]"
                >
                  (Change)
                </button>
              </div>
            </div>
          </div>

          {/* Right Header Status & Action Badges */}
          <div className="flex flex-col items-start md:items-end gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Status:</span>
              <button
                onClick={() => setStatusModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-2xs transition-colors ${
                  candidate.current_status === 'Open'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    : candidate.current_status === 'Review'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                    : candidate.current_status === 'Contacted'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{candidate.current_status}</span>
                <Edit2 className="w-3 h-3 text-slate-400" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditProfileModalOpen(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                id="edit-profile-btn"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Edit Profile</span>
              </button>

              <button
                type="button"
                onClick={() => setContactModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Recruiter Feedback</span>
              </button>
            </div>
          </div>
        </div>

        {/* Aggregate KPI Badges */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl text-center">
            <div className="text-xl font-bold text-slate-900">
              {candidate.applications?.length || 0}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
              Applications
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-center">
            <div className="text-xl font-bold text-slate-900">
              {uniqueRecruiters}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
              Recruiters
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-center">
            <div className="text-xl font-bold text-slate-900">
              {candidate.recruiter_contacts?.length || 0}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
              Contact Attempts
            </div>
          </div>
        </div>
      </div>

      {/* Contact Information & Traceability Section */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <span>Verified Historical Contact Identifiers</span>
          <span className="text-[10px] font-medium text-slate-400">
            (Never destroyed upon duplicate discovery)
          </span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Emails */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Mail className="w-3.5 h-3.5 text-blue-600" />
              <span>Historical Emails ({candidate.emails?.length || 0})</span>
            </div>
            <div className="space-y-1.5">
              {candidate.emails && candidate.emails.length > 0 ? (
                candidate.emails.map((e) => (
                  <div key={e.id} className="text-xs">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <span>{e.email}</span>
                      {e.is_primary && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded font-bold">
                          Primary
                        </span>
                      )}
                    </div>
                    {e.source_file && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        Source: {e.source_file} {e.source_row ? `(Row ${e.source_row})` : ''}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic">No email on file</div>
              )}
            </div>
          </div>

          {/* Phones */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Historical Phones ({candidate.phones?.length || 0})</span>
            </div>
            <div className="space-y-1.5">
              {candidate.phones && candidate.phones.length > 0 ? (
                candidate.phones.map((p) => (
                  <div key={p.id} className="text-xs font-mono">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <span>{p.phone_original}</span>
                      {p.is_primary && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded font-bold font-sans">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Normalized: {p.phone_normalized}
                    </div>
                    {p.source_file && (
                      <div className="text-[10px] text-slate-400">
                        Source: {p.source_file} {p.source_row ? `(Row ${p.source_row})` : ''}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic font-sans">No phone on file</div>
              )}
            </div>
          </div>

          {/* LinkedIn Profile */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Globe className="w-3.5 h-3.5 text-blue-700" />
              <span>LinkedIn Profile</span>
            </div>
            {candidate.linkedin_url ? (
              <a
                href={`https://${candidate.linkedin_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
              >
                <span className="truncate">{candidate.linkedin_url}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            ) : (
              <div className="text-xs text-slate-400 italic">No LinkedIn profile recorded</div>
            )}
          </div>

          {/* Resume Link */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              <span>Primary Resume</span>
            </div>
            {candidate.applications?.find(a => Boolean(a.resume_link))?.resume_link ? (
              <a
                href={candidate.applications.find(a => Boolean(a.resume_link))!.resume_link!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors"
              >
                <span>Open Resume</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <div className="text-xs text-slate-400 italic">No resume available</div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 flex gap-6 text-sm font-semibold text-slate-500">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 relative transition-colors ${
            activeTab === 'timeline'
              ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
              : 'hover:text-slate-800'
          }`}
        >
          Activity Timeline
        </button>

        <button
          onClick={() => setActiveTab('applications')}
          className={`pb-3 relative transition-colors flex items-center gap-1.5 ${
            activeTab === 'applications'
              ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
              : 'hover:text-slate-800'
          }`}
        >
          <span>Applications</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
            {candidate.applications?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('recruiter_history')}
          className={`pb-3 relative transition-colors flex items-center gap-1.5 ${
            activeTab === 'recruiter_history'
              ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
              : 'hover:text-slate-800'
          }`}
        >
          <span>Recruiter Feedback</span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
            {candidate.recruiter_contacts?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 relative transition-colors ${
            activeTab === 'documents'
              ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
              : 'hover:text-slate-800'
          }`}
        >
          Screening &amp; Documents
        </button>
      </div>

      {/* Tab Panels */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
        {/* Timeline Tab */}
        {activeTab === 'timeline' && <TimelineTab candidate={candidate} />}

        {/* Applications Tab */}
        {activeTab === 'applications' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Historical Applications
              </h3>
              <span className="text-xs text-slate-500">
                Never overwritten when candidate reapplies
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Date Assigned</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Job Title</th>
                    <th className="py-3 px-4">Job ID</th>
                    <th className="py-3 px-4">Stage</th>
                    <th className="py-3 px-4">Source Traceability</th>
                    <th className="py-3 px-4">Resume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidate.applications && candidate.applications.length > 0 ? (
                    candidate.applications.map((app) => (
                      <tr key={app.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">
                          {app.date_applied}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              app.company === 'AaraTech'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-indigo-50 text-indigo-700'
                            }`}
                          >
                            {app.company}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {cleanJobTitle(app.job_title)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">
                          {app.job_id || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                          {app.current_stage}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-500">
                          {app.source_file ? `${app.source_file} (Row ${app.source_row})` : 'System Input'}
                        </td>
                        <td className="py-3 px-4">
                          {app.resume_link ? (
                            <a
                              href={app.resume_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <span>View</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs italic">None</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No applications recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recruiter History Tab (Verbatim Original Feedback) */}
        {activeTab === 'recruiter_history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Verbatim Recruiter History
                </h3>
                <p className="text-xs text-slate-500">
                  Notes are stored exactly as entered by the recruiter without automated rewriting.
                </p>
              </div>

              <button
                onClick={() => setContactModalOpen(true)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Note</span>
              </button>
            </div>

            <div className="space-y-3">
              {candidate.recruiter_contacts && candidate.recruiter_contacts.length > 0 ? (
                candidate.recruiter_contacts.map((contact) => {
                  const linkedApp = contact.application_id
                    ? candidate.applications?.find(a => a.id === contact.application_id)
                    : null;
                  const feedbackLabel = contact.feedback_label || (
                    contact.source && contact.source.includes('|')
                      ? contact.source.split('|').slice(1).join('|').trim()
                      : null
                  );

                  return (
                    <div
                      key={contact.id}
                      className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {contact.recruiter_name}
                          </span>
                          {feedbackLabel && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200">
                              {feedbackLabel}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                            {contact.contact_type}
                          </span>
                          {contact.column_index !== undefined && contact.column_index !== null && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Col #{contact.column_index + 1}
                            </span>
                          )}
                          {linkedApp && (
                            <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium border border-indigo-200">
                              Role: {linkedApp.job_title}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {contact.contact_date}
                        </div>
                      </div>

                      {/* Exact Verbatim Text Block */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-800 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-2xs">
                        {contact.original_feedback}
                      </div>

                      {(contact.source_file || contact.source) && (
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>
                            Traceability: {contact.source_file || 'Direct Import'} {contact.source_row ? `(Row ${contact.source_row})` : ''}
                          </span>
                          {contact.import_id && (
                            <span>Batch: {contact.import_id}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No recruiter touchpoints logged for this profile yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Screening & Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Screening Answers &amp; External Documents
            </h3>
            <p className="text-xs text-slate-500">
              Phase 1 &amp; Phase 2 compatible: Stores LinkedIn screening questions, Google Drive resume links, and attachments.
            </p>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="font-semibold text-xs text-slate-700 uppercase">
                Google Drive Resume Document
              </div>
              {candidate.applications?.find(a => Boolean(a.resume_link))?.resume_link ? (
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-800">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Candidate Resume (Cloud Link)</span>
                  </div>
                  <a
                    href={candidate.applications.find(a => Boolean(a.resume_link))!.resume_link!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700"
                  >
                    Open Resume
                  </a>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic p-2">
                  No Google Drive resume URL attached to candidate profile.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Change Status */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Update Candidate Operational Status
            </h3>
            <p className="text-xs text-slate-500">
              Status changes are permanently recorded in the person status history table.
            </p>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as CandidateStatus)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Status Change (Optional)
                </label>
                <input
                  type="text"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="e.g. Completed technical round, awaiting client feedback"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                >
                  Save Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change Owner */}
      {ownerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Reassign Candidate Owner
            </h3>
            <p className="text-xs text-slate-500">
              Ownership reassignment will be tracked in the recruitment audit log.
            </p>

            <form onSubmit={handleUpdateOwner} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Assign Recruiter Owner:
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {['Adam', 'Alex', 'Unassigned'].map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setNewOwner(name)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-center ${
                        newOwner === name
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Or Custom Recruiter Name:
                </label>
                <input
                  type="text"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="e.g. Adam, Alex, Sarah Jenkins"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOwnerModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                >
                  Save Owner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Recruiter Contact */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Add Recruiter Feedback
              </h3>
              <span className="text-[11px] font-mono font-bold text-blue-600">
                {candidate.person_id}
              </span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
              <strong>Recruiter Feedback Integrity:</strong> Notes are saved word-for-word exactly as entered.
            </div>

            <form onSubmit={handleAddRecruiterContact} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recruiter Name
                  </label>
                  <input
                    type="text"
                    value={contactRecruiter}
                    onChange={(e) => setContactRecruiter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Channel / Type
                  </label>
                  <select
                    value={contactType}
                    onChange={(e) => setContactType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800"
                  >
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="In-Person">In-Person</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Date
                </label>
                <input
                  type="date"
                  value={contactDate}
                  onChange={(e) => setContactDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Verbatim Notes &amp; Feedback (Exact Raw Text)
                </label>
                <textarea
                  rows={4}
                  value={rawFeedback}
                  onChange={(e) => setRawFeedback(e.target.value)}
                  placeholder="e.g. 10/7/2026- VM/VM/VM or JD sent or F1 OPT - Pursing masters"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-800 placeholder-slate-400"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                >
                  Save Recruiter Feedback
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidate Profile Edit Modal */}
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
