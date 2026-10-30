import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  FileText,
  User,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Edit3,
  Copy,
  Check,
  Globe,
} from 'lucide-react';
import { Applicant } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../api/client';
import { formatGoogleSheetsRow, generateGoogleSheetsTsv } from '../shared/columnMapper';


interface ApplicantDetailModalProps {
  applicant: Applicant;
  onClose: () => void;
  onUpdated?: (updated: Applicant) => void;
  onStatusUpdated?: (updated?: Applicant) => void;
}

export const ApplicantDetailModal: React.FC<ApplicantDetailModalProps> = ({
  applicant,
  onClose,
  onUpdated,
  onStatusUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'raw_screening' | 'raw_row' | 'override'>('details');
  const [overrideStatus, setOverrideStatus] = useState<'PASS' | 'FAIL' | 'MANUAL_REVIEW'>('PASS');
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSheetsRow, setCopiedSheetsRow] = useState(false);

  // Gender modification state (User Requested Feature)
  const [currentGender, setCurrentGender] = useState<'MALE' | 'FEMALE' | 'UNSPECIFIED'>(
    (applicant.gender as any) || 'UNSPECIFIED'
  );
  const [isUpdatingGender, setIsUpdatingGender] = useState(false);
  const [genderSuccessMessage, setGenderSuccessMessage] = useState<string | null>(null);

  const handleGenderChange = async (newGender: 'MALE' | 'FEMALE' | 'UNSPECIFIED') => {
    if (newGender === currentGender) return;
    setIsUpdatingGender(true);
    try {
      const res = await api.updateApplicantGender(applicant.id, newGender);
      setCurrentGender(newGender);
      onUpdated?.(res.applicant);
      onStatusUpdated?.(res.applicant);
      setGenderSuccessMessage(
        `Gender set to ${newGender === 'MALE' ? 'Male (♂)' : newGender === 'FEMALE' ? 'Female (♀)' : 'Unspecified'}`
      );
      setTimeout(() => setGenderSuccessMessage(null), 3500);
    } catch (err: any) {
      alert(`Failed to update gender: ${err.message}`);
    } finally {
      setIsUpdatingGender(false);
    }
  };

  const handleCopyRaw = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySheetsRow = () => {
    try {
      const row = formatGoogleSheetsRow(applicant);
      const tsv = generateGoogleSheetsTsv([row], false);
      let copiedOk = false;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(tsv);
        copiedOk = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copiedOk = document.execCommand('copy');
        ta.remove();
      }
      if (copiedOk) {
        setCopiedSheetsRow(true);
        setTimeout(() => setCopiedSheetsRow(false), 3000);
      }
    } catch (err: any) {
      alert(`Could not copy row: ${err.message}`);
    }
  };


  // 1-Click Status Change (Add to PASS / Remove from PASS)
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const handleDirectStatusChange = async (newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW') => {
    setIsChangingStatus(true);
    try {
      const res = await api.overrideApplicant(applicant.id, newStatus, undefined, 'Recruiter Admin');
      onUpdated?.(res.applicant);
      onStatusUpdated?.(res.applicant);
      const msg =
        newStatus === 'PASS'
          ? 'Application added to PASS!'
          : newStatus === 'MANUAL_REVIEW'
          ? 'Application removed from PASS — moved to Manual Review'
          : 'Application marked as FAIL';
      setStatusNotification(msg);
      setTimeout(() => setStatusNotification(null), 3500);
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleSaveOverride = async () => {
    setIsSubmittingOverride(true);
    try {
      const res = await api.overrideApplicant(
        applicant.id,
        overrideStatus,
        overrideReason.trim() || undefined,
        'Recruiter Admin'
      );
      onUpdated?.(res.applicant);
      onStatusUpdated?.(res.applicant);
      setActiveTab('details');
      setStatusNotification(`Status updated to ${overrideStatus}`);
      setTimeout(() => setStatusNotification(null), 3500);
    } catch (err: any) {
      alert(`Override failed: ${err.message}`);
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300 flex items-center justify-center text-lg font-bold">
              {applicant.firstName ? applicant.firstName[0] : 'A'}
              {applicant.lastName ? applicant.lastName[0] : ''}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight">{applicant.fullName}</h2>
                <StatusBadge status={applicant.effectiveResult} size="md" />
                {applicant.originRegion === 'SOUTH_ASIAN' ? (
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                    <span>{applicant.originCountry === 'India' ? '🇮🇳' : applicant.originCountry === 'Pakistan' ? '🇵🇰' : applicant.originCountry === 'Bangladesh' ? '🇧🇩' : applicant.originCountry === 'Nepal' ? '🇳🇵' : applicant.originCountry === 'Sri Lanka' ? '🇱🇰' : '🌏'}</span>
                    <span>{applicant.originCountry || 'South Asian'}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    Review Origin
                  </span>
                )}
                {applicant.manualResult && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/30 text-purple-200 border border-purple-400/30">
                    MANUALLY OVERRIDDEN
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {applicant.currentTitle} {applicant.currentCompany ? `at ${applicant.currentCompany}` : ''} • Applied {applicant.dateApplied || 'N/A'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition ${
                activeTab === 'details'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Applicant & Screening
            </button>
            <button
              onClick={() => setActiveTab('raw_screening')}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'raw_screening'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Original Screening Questions</span>
            </button>
            <button
              onClick={() => setActiveTab('raw_row')}
              className={`py-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'raw_row'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Original Source Row</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap py-2">
            {/* 1-Click Status Action: Add to PASS or Remove from PASS */}
            {applicant.effectiveResult === 'PASS' ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isChangingStatus}
                  onClick={() => handleDirectStatusChange('MANUAL_REVIEW')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Remove from PASS and send candidate to Manual Review"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Remove from PASS</span>
                </button>
                <button
                  type="button"
                  disabled={isChangingStatus}
                  onClick={() => handleDirectStatusChange('FAIL')}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold transition flex items-center gap-1"
                  title="Disqualify applicant (Mark as FAIL)"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Mark FAIL</span>
                </button>
              </div>
            ) : applicant.effectiveResult === 'MANUAL_REVIEW' ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isChangingStatus}
                  onClick={() => handleDirectStatusChange('PASS')}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Approve candidate and add to PASS"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100" />
                  <span>+ Add to PASS</span>
                </button>
                <button
                  type="button"
                  disabled={isChangingStatus}
                  onClick={() => handleDirectStatusChange('FAIL')}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold transition flex items-center gap-1"
                  title="Disqualify applicant (Mark as FAIL)"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Mark FAIL</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isChangingStatus}
                  onClick={() => handleDirectStatusChange('PASS')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition flex items-center gap-1.5"
                  title="Promote candidate directly to PASS"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>+ Add to PASS</span>
                </button>
                <button
                  type="button"
                  disabled={isChangingStatus}
                  onClick={() => handleDirectStatusChange('MANUAL_REVIEW')}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 text-xs font-bold transition flex items-center gap-1"
                  title="Send candidate to Manual Review"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Move to Manual Review</span>
                </button>
              </div>
            )}

            <button
              onClick={handleCopySheetsRow}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${
                copiedSheetsRow
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              }`}
              title="Copy this applicant's row for Google Sheets (Ctrl+V into cells)"
            >
              {copiedSheetsRow ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSheetsRow ? 'Copied Row!' : 'Copy for Google Sheets'}</span>
            </button>

            <button
              onClick={() => setActiveTab('override')}
              className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-100 transition flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Manual Override</span>
            </button>
          </div>
        </div>

        {/* Status Notification Toast Banner */}
        {statusNotification && (
          <div className="mx-6 mt-3 p-2.5 bg-emerald-600 text-white rounded-lg shadow-xs flex items-center gap-2 text-xs font-bold animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-200" />
            <span>{statusNotification}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Screening Information Card (Section 27) */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Mandatory Screening Evaluation
                    </h3>
                  </div>
                  <div className="text-xs font-semibold">
                    Overall Status: <strong className="ml-1"><StatusBadge status={applicant.effectiveResult} size="sm" /></strong>
                  </div>
                </div>

                {/* Step 1: Mandatory Screening Questions */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>Step 1: Mandatory Screening Questions</span>
                    <span className="text-[10px] text-slate-400 font-normal">Evaluated first (Both must pass)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Green Card / US Citizen */}
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">1. Green Card / US Citizen</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">
                          Must be YES
                        </span>
                      </div>
                      <div className="pt-1 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-500">Applicant Answer</div>
                          <div className="text-sm font-bold text-slate-900">
                            {applicant.greenCardCitizenAnswer || (
                              <span className="text-xs font-semibold text-amber-700">
                                {applicant.usWorkAuthAnswer === 'YES'
                                  ? 'Not Asked (Work Auth: Yes)'
                                  : 'Not Asked on LinkedIn'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          {applicant.greenCardCitizenAnswer === 'YES' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                            </span>
                          ) : applicant.greenCardCitizenAnswer === 'NO' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                              <XCircle className="w-3.5 h-3.5" /> FAIL
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded" title="Question was not asked on LinkedIn">
                              <AlertTriangle className="w-3.5 h-3.5" /> NOT ASKED
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Future Visa Sponsorship */}
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">2. Future Visa Sponsorship</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">
                          Must be NO
                        </span>
                      </div>
                      <div className="pt-1 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-500">Applicant Answer</div>
                          <div className="text-sm font-bold text-slate-900">
                            {applicant.sponsorshipAnswer || (
                              <span className="text-xs font-semibold text-amber-700">
                                Not Asked on LinkedIn
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          {applicant.sponsorshipAnswer === 'NO' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                            </span>
                          ) : applicant.sponsorshipAnswer === 'YES' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                              <XCircle className="w-3.5 h-3.5" /> FAIL
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded" title="Question was not asked on LinkedIn">
                              <AlertTriangle className="w-3.5 h-3.5" /> NOT ASKED
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Regional Profile Filter */}
                <div className="space-y-2 pt-2 border-t border-slate-200/80">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-600" />
                      <span>Step 2: Regional Profile Filter (India, Pakistan, Bangladesh, Nepal, Sri Lanka)</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Evaluated after Step 1 passes</span>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">Regional Origin Match:</span>
                        {applicant.originRegion === 'SOUTH_ASIAN' ? (
                          <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <span>{applicant.originCountry === 'India' ? '🇮🇳' : applicant.originCountry === 'Pakistan' ? '🇵🇰' : applicant.originCountry === 'Bangladesh' ? '🇧🇩' : applicant.originCountry === 'Nepal' ? '🇳🇵' : applicant.originCountry === 'Sri Lanka' ? '🇱🇰' : '🌏'}</span>
                            <span>{applicant.originCountry || 'South Asian'} Verified</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                            Ambiguous / Non-South Asian
                          </span>
                        )}
                      </div>

                      <div>
                        {applicant.effectiveResult === 'PASS' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED PASS
                          </span>
                        ) : applicant.effectiveResult === 'MANUAL_REVIEW' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-3.5 h-3.5" /> MANUAL REVIEW
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                            <XCircle className="w-3.5 h-3.5" /> FAILED STEP 1
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100 space-y-1">
                      <div>
                        <strong className="text-slate-800">Match Details: </strong>
                        <span>{applicant.originMatchReason || 'No match details recorded'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 italic">
                        * Policy: Mandatory screening questions must be satisfied first. If passed, candidates definitively identified with Indian, Pakistani, Bangladeshi, Nepalese, or Sri Lankan names/profiles pass automatically. Ambiguous or uncertain names are routed to Manual Review so no eligible profile is missed.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reference Dataset Match Analysis (13,859 Reference Names) */}
                <div className="space-y-2 pt-2 border-t border-slate-200/80">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Reference Dataset Match Analysis (13,859 Names Corpus)</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Dataset 1 & 2 Comparison</span>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">Match Classification:</span>
                        {applicant.nameMatchCategory === 'Strong Match' ? (
                          <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Strong Match ({Math.round((applicant.nameMatchScore || 0) * 100)}%)
                          </span>
                        ) : applicant.nameMatchCategory === 'Possible Match' ? (
                          <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Possible Match ({Math.round((applicant.nameMatchScore || 0) * 100)}%)
                          </span>
                        ) : applicant.nameMatchCategory === 'No Match' ? (
                          <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            No Match ({Math.round((applicant.nameMatchScore || 0) * 100)}%)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Not Evaluated</span>
                        )}
                      </div>

                      {applicant.nameMatchScore !== undefined && (
                        <div className="text-xs font-mono font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                          Score: {(applicant.nameMatchScore * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Matched Reference Name</span>
                        <span className="font-semibold text-slate-900">{applicant.nameMatchedReference || 'None'}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Matched Pattern Type</span>
                        <span className="font-semibold text-slate-900">{applicant.nameMatchedPattern || 'None'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Screening Reasons */}
                {applicant.screeningReasons && (
                  <div className="p-3 rounded-lg bg-slate-100 text-xs text-slate-700">
                    <strong className="text-slate-900">Reason: </strong>
                    <span>{applicant.screeningReasons}</span>
                  </div>
                )}

                {/* Manual Override Audit Notice (if overridden) */}
                {applicant.manualResult && (
                  <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
                    <div className="font-bold flex items-center justify-between">
                      <span>Manual Override Applied</span>
                      <span className="text-[10px] text-purple-700">
                        {new Date(applicant.overriddenAt || '').toLocaleString()} by {applicant.overriddenBy}
                      </span>
                    </div>
                    <div>
                      Automated Result: <strong className="line-through">{applicant.automatedResult}</strong> → Manual Result: <strong>{applicant.manualResult}</strong>
                    </div>
                    <div className="text-[11px] text-purple-800">
                      Reason: "{applicant.overrideReason}"
                    </div>
                  </div>
                )}
              </div>

              {/* Person Information & Job Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Person Information */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold text-slate-900">
                    <User className="w-4 h-4 text-blue-600" />
                    <span>PERSON INFORMATION</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                    <div>
                      <dt className="text-slate-400 text-[11px]">First Name</dt>
                      <dd className="font-semibold text-slate-900">{applicant.firstName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Last Name</dt>
                      <dd className="font-semibold text-slate-900">{applicant.lastName || '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-400 text-[11px]">Email</dt>
                      <dd className="font-semibold text-slate-900 break-all">{applicant.email || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Phone</dt>
                      <dd className="font-semibold text-slate-900">{applicant.phone || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Location</dt>
                      <dd className="font-semibold text-slate-900">{applicant.location || '—'} {applicant.zipCode ? `(${applicant.zipCode})` : ''}</dd>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <dt className="text-slate-400 text-[11px] flex items-center justify-between">
                        <span>Gender</span>
                        {genderSuccessMessage && (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5 animate-in fade-in">
                            <Check className="w-3 h-3" /> {genderSuccessMessage}
                          </span>
                        )}
                      </dt>
                      <dd className="mt-1">
                        <div className="inline-flex p-0.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold">
                          <button
                            type="button"
                            disabled={isUpdatingGender}
                            onClick={() => handleGenderChange('MALE')}
                            className={`px-2.5 py-1 rounded-md transition ${
                              currentGender === 'MALE'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'
                            }`}
                            title="Set gender to Male"
                          >
                            ♂ Male
                          </button>
                          <button
                            type="button"
                            disabled={isUpdatingGender}
                            onClick={() => handleGenderChange('FEMALE')}
                            className={`px-2.5 py-1 rounded-md transition ${
                              currentGender === 'FEMALE'
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50'
                            }`}
                            title="Set gender to Female"
                          >
                            ♀ Female
                          </button>
                          <button
                            type="button"
                            disabled={isUpdatingGender}
                            onClick={() => handleGenderChange('UNSPECIFIED')}
                            className={`px-2 py-1 rounded-md transition ${
                              currentGender === 'UNSPECIFIED'
                                ? 'bg-amber-600 text-white shadow-xs font-semibold'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
                            }`}
                            title="Set gender to Unspecified"
                          >
                            Unspecified
                          </button>
                        </div>
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-400 text-[11px]">Headline</dt>
                      <dd className="text-slate-800">{applicant.headline || '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-400 text-[11px]">Education</dt>
                      <dd className="text-slate-800">
                        {applicant.educationDegree ? `${applicant.educationDegree}` : ''}
                        {applicant.educationInstitution ? ` - ${applicant.educationInstitution}` : '—'}
                      </dd>
                    </div>
                    {applicant.profileUrl && (
                      <div className="col-span-2 pt-1">
                        <a
                          href={applicant.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          <span>Open LinkedIn Profile</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Job Information */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold text-slate-900">
                    <Briefcase className="w-4 h-4 text-indigo-600" />
                    <span>JOB INFORMATION</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs">
                    <div>
                      <dt className="text-slate-400 text-[11px]">Job Title</dt>
                      <dd className="font-bold text-slate-900">{applicant.jobTitle || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Job ID</dt>
                      <dd className="font-semibold text-slate-900">{applicant.jobId || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">ATS Job ID</dt>
                      <dd className="font-semibold text-slate-900">{applicant.atsJobId || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Current Stage</dt>
                      <dd className="font-semibold text-slate-900">{applicant.currentStage || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Date Applied</dt>
                      <dd className="font-semibold text-slate-900">{applicant.dateApplied || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Source File</dt>
                      <dd className="font-semibold text-slate-900 truncate" title={applicant.sourceFile}>
                        {applicant.sourceFile}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Hiring Project</dt>
                      <dd className="text-slate-800">{applicant.hiringProjectTitle || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-[11px]">Contract</dt>
                      <dd className="text-slate-800">{applicant.contractName || '—'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ORIGINAL SCREENING QUESTIONS (Section 28) */}
          {activeTab === 'raw_screening' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Original LinkedIn Screening Text</h3>
                  <p className="text-xs text-slate-500">
                    Exact string supplied in the "Screening Questions" export column from LinkedIn.
                  </p>
                </div>
                <button
                  onClick={() => handleCopyRaw(applicant.rawScreeningQuestions)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Raw Text'}</span>
                </button>
              </div>

              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed border border-slate-800">
                {applicant.rawScreeningQuestions || '(No screening questions text provided in source file)'}
              </div>
            </div>
          )}

          {/* TAB 3: ORIGINAL SOURCE ROW (Section 29) */}
          {activeTab === 'raw_row' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Original Imported Values (Audit Trace)</h3>
                <p className="text-xs text-slate-500">
                  Trace this applicant directly back to their row in the original Excel worksheet.
                </p>
              </div>

              {/* Source coordinates badge */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Source File</div>
                  <div className="text-xs font-bold text-slate-900 mt-1 truncate">{applicant.sourceFile}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Worksheet</div>
                  <div className="text-xs font-bold text-slate-900 mt-1">{applicant.sourceWorksheet || 'Sheet1'}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Row Number</div>
                  <div className="text-xs font-bold text-slate-900 mt-1">Row #{applicant.sourceRowNumber}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Import ID</div>
                  <div className="text-xs font-bold text-blue-700 mt-1">{applicant.importId}</div>
                </div>
              </div>

              {/* Raw JSON Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-1/3">Raw Column Header</th>
                      <th className="p-3">Raw Value in Source Row</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(applicant.rawRowData || {}).map(([key, val], idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-3 font-medium text-slate-600 bg-slate-50/50">{key}</td>
                        <td className="p-3 text-slate-900 font-mono text-[11px] whitespace-pre-wrap break-all">
                          {String(val ?? '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: MANUAL OVERRIDE (Section 43) */}
          {activeTab === 'override' && (
            <div className="space-y-5 max-w-lg mx-auto bg-slate-50 p-6 rounded-xl border border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Manual Review Decision Override</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Overriding saves a manual result without deleting the automated screening determination. An audit log entry is preserved.
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Automated Result:</span>
                <StatusBadge status={applicant.automatedResult} size="sm" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">Select New Manual Status</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideStatus('PASS')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition ${
                      overrideStatus === 'PASS'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    PASS
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideStatus('FAIL')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition ${
                      overrideStatus === 'FAIL'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    FAIL
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideStatus('MANUAL_REVIEW')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition ${
                      overrideStatus === 'MANUAL_REVIEW'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    MANUAL REVIEW
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Reason for Override <span className="text-slate-400 font-normal">(Optional — no reason needed)</span></span>
                </label>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Optional notes for audit trail (leave empty to save without reason)"
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingOverride}
                  onClick={handleSaveOverride}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {isSubmittingOverride ? 'Saving Decision...' : 'Save Override'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
