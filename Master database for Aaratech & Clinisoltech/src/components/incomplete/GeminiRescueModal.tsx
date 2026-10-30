import React, { useState } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Key,
  ExternalLink,
  Loader2,
  RefreshCw,
  UserCheck,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  ShieldCheck,
} from 'lucide-react';
import { IncompleteRecord } from '../../types/database';
import { geminiService, GeminiIncompleteRescue } from '../../lib/geminiService';
import { dbService } from '../../lib/dbService';
import { normalizeEmail, normalizePhone } from '../../lib/normalization';
import { extractCleanPhone, isValidCandidateName } from '../../lib/importEngine';

interface GeminiRescueModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: IncompleteRecord[];
  onRecordsResolved: () => void;
}

export const GeminiRescueModal: React.FC<GeminiRescueModalProps> = ({
  isOpen,
  onClose,
  records,
  onRecordsResolved,
}) => {
  const [apiKey, setApiKey] = useState<string>(geminiService.getApiKey() || '');
  const [model, setModel] = useState<string>(geminiService.getModel());
  const [showKeyInput, setShowKeyInput] = useState<boolean>(!geminiService.hasApiKey());
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isRescuing, setIsRescuing] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [rescues, setRescues] = useState<GeminiIncompleteRescue[] | null>(null);
  const [activeTab, setActiveTab] = useState<'rescue' | 'orphan' | 'review'>('rescue');
  const [isExecutingBatch, setIsExecutingBatch] = useState(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) return;
    geminiService.setApiKey(apiKey.trim());
    geminiService.setModel(model);
    setShowKeyInput(false);
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) return;
    setTestingKey(true);
    setTestResult(null);
    geminiService.setApiKey(apiKey.trim());
    geminiService.setModel(model);
    const res = await geminiService.testConnection(model);
    setTestResult(res);
    setTestingKey(false);
  };

  const handleStartRescue = async () => {
    if (!geminiService.hasApiKey()) {
      setShowKeyInput(true);
      return;
    }

    geminiService.setModel(model);
    setIsRescuing(true);
    setProgress({ completed: 0, total: records.length });
    setBatchSuccessMsg(null);

    try {
      const results = await geminiService.rescueIncompleteProfiles(records, (done, total) => {
        setProgress({ completed: done, total });
      });
      setRescues(results);
    } catch (err: any) {
      alert(`AI Rescue Error: ${err.message || 'Failed to rescue incomplete profiles'}`);
    } finally {
      setIsRescuing(false);
    }
  };

  const rescueList = rescues?.filter(r => r.isRescueable) || [];
  const orphanList = rescues?.filter(r => r.isOrphanNote && !r.isRescueable) || [];
  const reviewList = rescues?.filter(r => !r.isRescueable && !r.isOrphanNote) || [];

  const resolveCandidateForPromotion = (original: IncompleteRecord, r: GeminiIncompleteRescue) => {
    const rawNameClean = (original.raw_name || '').trim();
    const rawNameNoMd = rawNameClean
      .replace(/\[\s*.*?\s*\](?:\(mailto:[^\s)]+\))?/gi, '')
      .replace(/mailto:[^\s)]+/gi, '')
      .replace(/<[^\s>]+>/gi, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
      .replace(/[\[\]()<>]/g, '')
      .trim();

    // 1. Resolve Name: Must be a genuine candidate name
    let resolvedName = '';
    if (rawNameClean && isValidCandidateName(rawNameClean)) {
      resolvedName = rawNameClean;
    } else if (rawNameNoMd && isValidCandidateName(rawNameNoMd)) {
      resolvedName = rawNameNoMd;
    } else if (r.extractedName && isValidCandidateName(r.extractedName.trim())) {
      resolvedName = r.extractedName.trim();
    } else if (r.extractedName && r.extractedName.trim().length >= 2) {
      resolvedName = r.extractedName.trim();
    } else if (rawNameNoMd && rawNameNoMd.length >= 2) {
      resolvedName = rawNameNoMd;
    }

    // 2. Resolve Email: Check raw_email first (if valid); otherwise use extractedEmail or feedback email
    let resolvedEmail: string | undefined = undefined;
    const rawEmailNorm = normalizeEmail(original.raw_email);
    if (rawEmailNorm && !['adam', 'alex', 'unassigned'].includes(rawEmailNorm.original.toLowerCase())) {
      resolvedEmail = rawEmailNorm.original;
    } else if (r.extractedEmail && normalizeEmail(r.extractedEmail)) {
      resolvedEmail = normalizeEmail(r.extractedEmail)!.original;
    } else if (rawNameClean.includes('@')) {
      const mailMatch = rawNameClean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (mailMatch && normalizeEmail(mailMatch[1])) {
        resolvedEmail = normalizeEmail(mailMatch[1])!.original;
      }
    } else if (original.recruiter_feedback && original.recruiter_feedback.includes('@')) {
      const mailMatch = original.recruiter_feedback.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (mailMatch && normalizeEmail(mailMatch[1])) {
        resolvedEmail = normalizeEmail(mailMatch[1])!.original;
      }
    }

    // 3. Resolve Phone: Check raw_phone first (if valid 7+ digits); otherwise use extractedPhone or feedback phone
    let resolvedPhone: string | undefined = undefined;
    const rawPhoneNorm = normalizePhone(original.raw_phone);
    if (rawPhoneNorm && rawPhoneNorm.isValid) {
      resolvedPhone = rawPhoneNorm.normalized;
    } else if (r.extractedPhone && (normalizePhone(r.extractedPhone) || extractCleanPhone(r.extractedPhone))) {
      resolvedPhone = normalizePhone(r.extractedPhone)?.normalized || extractCleanPhone(r.extractedPhone) || r.extractedPhone;
    } else if (original.recruiter_feedback) {
      const pClean = extractCleanPhone(original.recruiter_feedback);
      if (pClean) resolvedPhone = pClean;
    }

    return { resolvedName, resolvedEmail, resolvedPhone };
  };

  const handlePromoteSingleRescue = async (r: GeminiIncompleteRescue) => {
    const original = records.find(rec => rec.id === r.recordId);
    if (!original) return;

    const { resolvedName, resolvedEmail, resolvedPhone } = resolveCandidateForPromotion(original, r);

    if (!resolvedName) {
      alert('Could not determine a valid candidate name for this record.');
      return;
    }
    if (!resolvedEmail && !resolvedPhone) {
      alert('Candidate must have at least one contact method (Email Address or Phone Number) to be promoted to Master Database.');
      return;
    }

    const promoteRes = await dbService.promoteIncompleteToMaster(r.recordId, {
      fullName: resolvedName,
      email: resolvedEmail,
      phone: resolvedPhone,
      role: original.raw_role || r.extractedRole || 'General Sourced Candidate',
      company: original.company,
      owner: original.owner || 'Adam',
      recruiterFeedback: original.recruiter_feedback || undefined, // 100% UNTOUCHED ORIGINAL VERBATIM FEEDBACK
      dateAssigned: original.date_assigned,
      gender: r.extractedGender,
    });

    if (promoteRes.success) {
      setRescues(prev => prev ? prev.filter(item => item.recordId !== r.recordId) : null);
      setBatchSuccessMsg(`Rescued and promoted ${resolvedName} into Master Database!`);
      onRecordsResolved();
    } else {
      alert(`Promotion failed: ${promoteRes.error || 'Validation error'}`);
    }
  };

  const handlePurgeSingleOrphan = async (r: GeminiIncompleteRescue) => {
    await dbService.deleteIncompleteRecord(r.recordId);
    setRescues(prev => prev ? prev.filter(item => item.recordId !== r.recordId) : null);
    setBatchSuccessMsg('Purged orphan screening log.');
    onRecordsResolved();
  };

  const handlePromoteAllRescued = async () => {
    if (rescueList.length === 0) return;
    setIsExecutingBatch(true);

    const itemsToPromote = rescueList.map(r => {
      const original = records.find(rec => rec.id === r.recordId);
      if (!original) return null;

      const { resolvedName, resolvedEmail, resolvedPhone } = resolveCandidateForPromotion(original, r);
      if (!resolvedName || (!resolvedEmail && !resolvedPhone)) return null;

      return {
        incompleteId: r.recordId,
        fullName: resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        role: original.raw_role || r.extractedRole || 'General Sourced Candidate',
        company: original.company,
        owner: original.owner || 'Adam',
        recruiterFeedback: original.recruiter_feedback || undefined,
        dateAssigned: original.date_assigned,
        gender: r.extractedGender,
      };
    }).filter(Boolean);

    const res = await dbService.batchPromoteIncompleteToMaster(itemsToPromote as any);

    setRescues(prev => prev ? prev.filter(item => !itemsToPromote.some(p => p?.incompleteId === item.recordId)) : null);
    setBatchSuccessMsg(`Successfully rescued and promoted ${res.promotedCount} candidates into the Master Database!`);
    setIsExecutingBatch(false);
    onRecordsResolved();
  };

  const handlePurgeAllOrphans = async () => {
    if (orphanList.length === 0) return;
    setIsExecutingBatch(true);
    const idsToPurge = orphanList.map(o => o.recordId);

    await dbService.deleteIncompleteRecordsBatch(idsToPurge);
    setBatchSuccessMsg(`Successfully purged ${idsToPurge.length} anonymous call logs and screening remarks.`);
    setIsExecutingBatch(false);
    onRecordsResolved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50/70 via-indigo-50/40 to-purple-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Gemini AI Incomplete Profile Rescue</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800">
                  {records.length} Profiles in Queue
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Gemini AI parses unstructured feedback notes, extracts missing phone numbers &amp; emails, and identifies orphan logs.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-slate-200 text-xs font-medium flex items-center gap-1 cursor-pointer"
              title="Configure Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{geminiService.hasApiKey() ? 'API Key Set' : 'Add API Key'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* API Key Input Section (Collapsible) */}
        {showKeyInput && (
          <div className="p-4 bg-amber-50/90 border-b border-amber-200 flex flex-col gap-3 text-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="font-bold text-amber-950 flex items-center gap-1.5 mb-1">
                  <Key className="w-4 h-4 text-amber-700" />
                  <span>Google Gemini AI Engine Configuration</span>
                </div>
                <p className="text-amber-800 text-[11px]">
                  Get a free API key from Google AI Studio. Stored securely in your browser local storage.
                </p>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-semibold inline-flex items-center gap-1 shrink-0"
              >
                <span>Get Free Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-44">
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite (High Speed - Recommended)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash (Next-Gen)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              </div>

              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste Gemini API Key (AIzaSy...)"
                className="flex-1 min-w-[200px] px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              <button
                onClick={handleSaveApiKey}
                className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg cursor-pointer"
              >
                Save
              </button>

              <button
                onClick={handleTestKey}
                disabled={testingKey || !apiKey.trim()}
                className="px-3 py-1.5 bg-white hover:bg-amber-100 disabled:opacity-50 text-amber-900 border border-amber-300 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
              >
                {testingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{testingKey ? 'Testing...' : 'Test Key'}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${
                  testResult.success
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {batchSuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{batchSuccessMsg}</span>
            </div>
          )}

          {/* Initial State / Verification In Progress */}
          {!rescues && (
            <div className="text-center py-12 px-4 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
                {isRescuing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <Sparkles className="w-8 h-8" />
                )}
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-800">
                  {isRescuing
                    ? `Rescuing Profile ${progress.completed} of ${progress.total}...`
                    : `Re-Verify ${records.length} Incomplete Profiles with Gemini AI`}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isRescuing
                    ? 'Gemini is scanning remarks, feedback, and notes to recover candidate contact details.'
                    : 'Gemini parses each incomplete entry, extracts hidden emails and phones, and filters out orphan notes.'}
                </p>
              </div>

              {isRescuing ? (
                <div className="max-w-sm mx-auto space-y-2">
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-indigo-600 h-full transition-all duration-300 rounded-full"
                      style={{
                        width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {Math.round(progress.total > 0 ? (progress.completed / progress.total) * 100 : 0)}% Complete
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleStartRescue}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Run Gemini Re-Verification ({records.length} Profiles)</span>
                </button>
              )}
            </div>
          )}

          {/* Results State */}
          {rescues && (
            <div className="space-y-4">
              {/* Category Tabs */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('rescue')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'rescue'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Rescued Candidates ({rescueList.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('orphan')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'orphan'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Orphan Notes / Call Logs ({orphanList.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('review')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'review'
                        ? 'bg-slate-700 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Still Incomplete ({reviewList.length})</span>
                  </button>
                </div>

                <button
                  onClick={handleStartRescue}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-Run AI</span>
                </button>
              </div>

              {/* Action Banner for Rescued Candidates */}
              {activeTab === 'rescue' && rescueList.length > 0 && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-emerald-900">
                      Gemini recovered verified contacts for {rescueList.length} candidate profiles!
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      Promotes these candidates directly into the Master Candidate Database.
                    </div>
                  </div>
                  <button
                    onClick={handlePromoteAllRescued}
                    disabled={isExecutingBatch}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{isExecutingBatch ? 'Promoting...' : `Promote All Rescued (${rescueList.length})`}</span>
                  </button>
                </div>
              )}

              {/* Action Banner for Orphan Logs */}
              {activeTab === 'orphan' && orphanList.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-amber-900">
                      Gemini verified {orphanList.length} entries are anonymous screening remarks / call logs.
                    </div>
                    <div className="text-[11px] text-amber-700 mt-0.5">
                      Purges these ghost records to keep your candidate review queue at 0.
                    </div>
                  </div>
                  <button
                    onClick={handlePurgeAllOrphans}
                    disabled={isExecutingBatch}
                    className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isExecutingBatch ? 'Purging...' : `Purge All Orphans (${orphanList.length})`}</span>
                  </button>
                </div>
              )}

              {/* Rescues Cards List */}
              <div className="space-y-3">
                {(activeTab === 'rescue' ? rescueList : activeTab === 'orphan' ? orphanList : reviewList).map(r => {
                  const original = records.find(rec => rec.id === r.recordId);
                  if (!original) return null;

                  return (
                    <div
                      key={r.recordId}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">
                            {r.extractedName || original.raw_name || 'Anonymous Profile'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              r.isRescueable
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.isOrphanNote
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {Math.round(r.confidence <= 1 ? r.confidence * 100 : r.confidence)}% AI Confidence
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.isRescueable && (
                            <button
                              type="button"
                              onClick={() => handlePromoteSingleRescue(r)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
                              title="Promote this rescued candidate directly into Master Database"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Promote Candidate</span>
                            </button>
                          )}
                          {r.isOrphanNote && (
                            <button
                              type="button"
                              onClick={() => handlePurgeSingleOrphan(r)}
                              className="px-2.5 py-1 bg-amber-100 hover:bg-rose-100 text-amber-900 hover:text-rose-800 border border-amber-300 hover:border-rose-300 text-[11px] font-semibold rounded flex items-center gap-1 cursor-pointer transition-colors"
                              title="Delete orphan call log"
                            >
                              <Trash2 className="w-3 h-3 text-amber-700 hover:text-rose-600" />
                              <span>Purge Remark</span>
                            </button>
                          )}
                          <span className="text-[11px] text-slate-500 font-mono">
                            {original.date_assigned}
                          </span>
                        </div>
                      </div>

                      {/* Contact Badges */}
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {r.extractedPhone && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-emerald-500" />
                            <span>{r.extractedPhone}</span>
                          </span>
                        )}
                        {r.extractedEmail && (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-blue-500" />
                            <span>{r.extractedEmail}</span>
                          </span>
                        )}
                        {r.extractedRole && (
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1 font-semibold">
                            <Briefcase className="w-3 h-3 text-purple-500" />
                            <span>{r.extractedRole}</span>
                          </span>
                        )}
                        {r.extractedLocation && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{r.extractedLocation}</span>
                          </span>
                        )}
                      </div>

                      {/* Original Feedback */}
                      {original.recruiter_feedback && (
                        <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                          <strong>Original Feedback:</strong> {original.recruiter_feedback}
                        </div>
                      )}

                      {/* AI Reasoning */}
                      <div className="text-[11px] text-slate-600 bg-amber-50/50 p-2 rounded border border-amber-100">
                        <strong>AI Analysis:</strong> {r.reasoning}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {records.length} incomplete profiles evaluated with Gemini AI
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
