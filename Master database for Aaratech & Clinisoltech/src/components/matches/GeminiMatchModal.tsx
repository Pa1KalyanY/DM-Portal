import React, { useState } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  GitMerge,
  Key,
  ExternalLink,
  ShieldCheck,
  Check,
  Loader2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { PossibleMatch, CompanyName } from '../../types/database';
import { geminiService, GeminiMatchVerification } from '../../lib/geminiService';
import { dbService } from '../../lib/dbService';

interface GeminiMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: PossibleMatch[];
  onMatchesResolved: () => void;
}

export const GeminiMatchModal: React.FC<GeminiMatchModalProps> = ({
  isOpen,
  onClose,
  matches,
  onMatchesResolved,
}) => {
  const [apiKey, setApiKey] = useState<string>(geminiService.getApiKey() || '');
  const [model, setModel] = useState<string>(geminiService.getModel());
  const [showKeyInput, setShowKeyInput] = useState<boolean>(!geminiService.hasApiKey());
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [verifications, setVerifications] = useState<GeminiMatchVerification[] | null>(null);
  const [activeTab, setActiveTab] = useState<'merge' | 'reject' | 'review'>('merge');
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

  const handleStartVerification = async () => {
    if (!geminiService.hasApiKey()) {
      setShowKeyInput(true);
      return;
    }

    geminiService.setModel(model);
    setIsVerifying(true);
    setProgress({ completed: 0, total: matches.length });
    setBatchSuccessMsg(null);

    try {
      const results = await geminiService.verifyPossibleMatches(matches, (done, total) => {
        setProgress({ completed: done, total });
      });
      setVerifications(results);
    } catch (err: any) {
      alert(`AI Verification Error: ${err.message || 'Failed to verify matches'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const autoMergeList = verifications?.filter(v => v.recommendedAction === 'AUTO_MERGE') || [];
  const rejectList = verifications?.filter(v => v.recommendedAction === 'REJECT') || [];
  const reviewList = verifications?.filter(v => v.recommendedAction === 'MANUAL_REVIEW') || [];

  const handleMergeSinglePair = async (v: GeminiMatchVerification) => {
    const match = matches.find(m => m.id === v.matchId);
    if (!match || !match.candidate_a || !match.candidate_b) return;

    const compA = match.candidate_a.current_company || match.candidate_a.applications?.[0]?.company;
    const compB = match.candidate_b.current_company || match.candidate_b.applications?.[0]?.company;

    if (compA && compB && compA !== compB) {
      alert('Cross-company merging is strictly blocked! Isolating companies.');
      return;
    }

    const merged = await dbService.mergeCandidates(
      match.candidate_a.id,
      match.candidate_b.id,
      'Gemini AI Verification',
      {
        rule: 'GEMINI_AI_CONFIRMED_MATCH',
        reason: `Gemini AI Verified (${v.confidence}% confidence): ${v.reasoning}`,
        isAutomatic: false,
      }
    );

    if (merged) {
      await dbService.resolvePossibleMatch(match.id, 'merged', 'Gemini AI Verification');
      setVerifications(prev => prev ? prev.filter(item => item.matchId !== v.matchId) : null);
      setBatchSuccessMsg(`Merged ${match.candidate_a.full_name} and ${match.candidate_b.full_name}! Profiles unified.`);
      onMatchesResolved();
    }
  };

  const handleRejectSinglePair = async (v: GeminiMatchVerification) => {
    const match = matches.find(m => m.id === v.matchId);
    if (!match) return;

    await dbService.resolvePossibleMatch(match.id, 'rejected', 'Gemini AI Verification');
    setVerifications(prev => prev ? prev.filter(item => item.matchId !== v.matchId) : null);
    setBatchSuccessMsg(`Marked Match #${match.match_code} as distinct individuals.`);
    onMatchesResolved();
  };

  const handleMergeAllConfirmed = async () => {
    if (autoMergeList.length === 0) return;
    setIsExecutingBatch(true);
    let successCount = 0;

    for (const v of autoMergeList) {
      const match = matches.find(m => m.id === v.matchId);
      if (!match || !match.candidate_a || !match.candidate_b) continue;

      const compA = match.candidate_a.current_company || match.candidate_a.applications?.[0]?.company;
      const compB = match.candidate_b.current_company || match.candidate_b.applications?.[0]?.company;

      if (compA && compB && compA !== compB) continue; // Keep company isolation

      const merged = await dbService.mergeCandidates(
        match.candidate_a.id,
        match.candidate_b.id,
        'Gemini AI Verification',
        {
          rule: 'GEMINI_AI_CONFIRMED_MATCH',
          reason: `Gemini AI Verified (${v.confidence}% confidence): ${v.reasoning}`,
          isAutomatic: true,
        }
      );

      if (merged) {
        await dbService.resolvePossibleMatch(match.id, 'merged', 'Gemini AI Verification');
        successCount++;
      }
    }

    setBatchSuccessMsg(`Successfully auto-merged ${successCount} verified duplicate pairs! All contact data, emails, phones, and notes united.`);
    setIsExecutingBatch(false);
    onMatchesResolved();
  };

  const handleRejectAllConfirmed = async () => {
    if (rejectList.length === 0) return;
    setIsExecutingBatch(true);
    let count = 0;

    for (const v of rejectList) {
      const match = matches.find(m => m.id === v.matchId);
      if (!match) continue;

      await dbService.resolvePossibleMatch(match.id, 'rejected', 'Gemini AI Verification');
      count++;
    }

    setBatchSuccessMsg(`Marked ${count} candidate pairs as distinct different individuals.`);
    setIsExecutingBatch(false);
    onMatchesResolved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-purple-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Gemini AI Duplicate Re-Verification</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800">
                  {matches.length} Matches in Queue
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Gemini AI performs deep identity cross-referencing across names, phones, emails, and recruiter notes.
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
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Active &amp; Fast)</option>
                  <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite (High Speed)</option>
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
          {!verifications && (
            <div className="text-center py-12 px-4 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
                {isVerifying ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <Sparkles className="w-8 h-8" />
                )}
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-800">
                  {isVerifying
                    ? `Verifying Match ${progress.completed} of ${progress.total}...`
                    : `Re-Verify ${matches.length} Possible Matches with Gemini AI`}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isVerifying
                    ? 'Gemini is examining name equivalencies, notes, phones, and emails to resolve true matches.'
                    : 'Gemini evaluates each duplicate pair and identifies cases where phone numbers and emails can be safely unified.'}
                </p>
              </div>

              {isVerifying ? (
                <div className="max-w-sm mx-auto space-y-2">
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full transition-all duration-300 rounded-full"
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
                  onClick={handleStartVerification}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Run Gemini Re-Verification ({matches.length} Matches)</span>
                </button>
              )}
            </div>
          )}

          {/* Results State */}
          {verifications && (
            <div className="space-y-4">
              {/* Category Tabs */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('merge')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'merge'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Auto-Merge Confirmed ({autoMergeList.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('reject')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'reject'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Distinct People ({rejectList.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('review')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'review'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Needs Human Review ({reviewList.length})</span>
                  </button>
                </div>

                <button
                  onClick={handleStartVerification}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-Run AI</span>
                </button>
              </div>

              {/* Action Banner for Auto-Merge */}
              {activeTab === 'merge' && autoMergeList.length > 0 && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-emerald-900">
                      Gemini verified {autoMergeList.length} duplicate pairs with high confidence.
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      Merging unites phones, emails, and all recruiter touchpoints into a single master profile.
                    </div>
                  </div>
                  <button
                    onClick={handleMergeAllConfirmed}
                    disabled={isExecutingBatch}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>{isExecutingBatch ? 'Merging...' : `Auto-Merge All (${autoMergeList.length})`}</span>
                  </button>
                </div>
              )}

              {/* Action Banner for Rejections */}
              {activeTab === 'reject' && rejectList.length > 0 && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-rose-900">
                      Gemini determined {rejectList.length} pairs are distinct individuals.
                    </div>
                    <div className="text-[11px] text-rose-700 mt-0.5">
                      Dismisses these pairs so they won&apos;t trigger duplicate warnings again.
                    </div>
                  </div>
                  <button
                    onClick={handleRejectAllConfirmed}
                    disabled={isExecutingBatch}
                    className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{isExecutingBatch ? 'Processing...' : `Reject All (${rejectList.length})`}</span>
                  </button>
                </div>
              )}

              {/* Match Cards List */}
              <div className="space-y-3">
                {(activeTab === 'merge' ? autoMergeList : activeTab === 'reject' ? rejectList : reviewList).map(v => {
                  const match = matches.find(m => m.id === v.matchId);
                  if (!match) return null;
                  const candA = match.candidate_a;
                  const candB = match.candidate_b;

                  return (
                    <div
                      key={v.matchId}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            Match #{match.match_code}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              v.confidence >= 90
                                ? 'bg-emerald-100 text-emerald-800'
                                : v.confidence >= 70
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {v.confidence}% AI Confidence
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMergeSinglePair(v)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
                            title="Unite these two candidate records into one"
                          >
                            <GitMerge className="w-3 h-3" />
                            <span>Merge</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectSinglePair(v)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded flex items-center gap-1 cursor-pointer transition-colors"
                            title="Dismiss duplicate match"
                          >
                            <X className="w-3 h-3" />
                            <span>Keep Separate</span>
                          </button>
                        </div>
                      </div>

                      {/* Candidate A vs Candidate B Comparison */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <div>
                          <div className="font-bold text-slate-800 flex items-center justify-between">
                            <span>{candA?.full_name}</span>
                            <span className="text-[10px] font-mono text-blue-600">{candA?.person_id}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Email: {candA?.primary_email || '—'} | Phone: {candA?.primary_phone || '—'}
                          </div>
                        </div>

                        <div className="border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-3">
                          <div className="font-bold text-slate-800 flex items-center justify-between">
                            <span>{candB?.full_name}</span>
                            <span className="text-[10px] font-mono text-purple-600">{candB?.person_id}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Email: {candB?.primary_email || '—'} | Phone: {candB?.primary_phone || '—'}
                          </div>
                        </div>
                      </div>

                      {/* AI Reasoning */}
                      <div className="text-[11px] text-slate-600 bg-blue-50/50 p-2 rounded border border-blue-100">
                        <strong>AI Analysis:</strong> {v.reasoning}
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
            {matches.length} matches evaluated with Gemini AI
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
