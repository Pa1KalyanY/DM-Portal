import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Key,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Play,
  RotateCcw,
  Check,
  Zap,
  Globe,
  Users
} from 'lucide-react';
import { api } from '../api/client';

interface GeminiAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const GeminiAiModal: React.FC<GeminiAiModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [activeModel, setActiveModel] = useState('gemini-2.5-flash');
  const [freeNotice, setFreeNotice] = useState('');

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [runningAi, setRunningAi] = useState(false);

  const [scope, setScope] = useState<'MANUAL_REVIEW' | 'ALL'>('MANUAL_REVIEW');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<any | null>(null);

  // Load current Gemini config on open
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      setLoadingConfig(true);
      setErrorMessage(null);
      const data = await api.getAiConfig();
      setIsConfigured(data.configured);
      setMaskedKey(data.maskedKey || '');
      setActiveModel(data.model || 'gemini-2.5-flash');
      setFreeNotice(data.freeTierNotice || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to check AI config');
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      setErrorMessage('Please enter a valid Gemini API key.');
      return;
    }
    try {
      setSavingKey(true);
      setErrorMessage(null);
      setStatusMessage(null);
      const res = await api.saveAiConfig(apiKey.trim());
      setStatusMessage(res.message);
      setApiKey('');
      await loadConfig();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to validate API key with Google');
    } finally {
      setSavingKey(false);
    }
  };

  const handleClearKey = async () => {
    try {
      setSavingKey(true);
      await api.clearAiConfig();
      setStatusMessage('Gemini API key removed.');
      await loadConfig();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to clear key');
    } finally {
      setSavingKey(false);
    }
  };

  const handleRunAi = async () => {
    try {
      setRunningAi(true);
      setErrorMessage(null);
      setStatusMessage(null);
      setSummaryResult(null);

      const res = await api.classifyWithGemini({
        onlyManualReview: scope === 'MANUAL_REVIEW',
      });

      setSummaryResult(res);
      setStatusMessage(res.message);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'AI classification encountered an error');
    } finally {
      setRunningAi(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight">Gemini AI Assistant</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shadow-xs">
                  Free Tier
                </span>
              </div>
              <p className="text-xs text-indigo-100 mt-0.5">
                AI Origin Classification (India, Pakistan, Bangladesh, Nepal, Sri Lanka) & Gender Identification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-xs">
          {/* Status / Error alerts */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Error</p>
                <p className="text-[11px] mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Success</p>
                <p className="text-[11px] mt-0.5">{statusMessage}</p>
              </div>
            </div>
          )}

          {/* Section 1: API Key Setup */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-600" />
                <span className="font-bold text-slate-900 text-xs">Google Gemini API Key</span>
              </div>
              {isConfigured ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <Check className="w-3 h-3" /> Key Connected ({activeModel})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Not Configured
                </span>
              )}
            </div>

            {isConfigured ? (
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3">
                <div className="space-y-0.5">
                  <p className="font-mono text-slate-700 font-semibold">{maskedKey}</p>
                  <p className="text-[10px] text-slate-400">Ready for batch classification via Google AI Studio</p>
                </div>
                <button
                  onClick={handleClearKey}
                  disabled={savingKey}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
                >
                  Change Key
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your Gemini API key (AIza...)"
                    className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={handleSaveKey}
                    disabled={savingKey || !apiKey.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg transition shrink-0"
                  >
                    {savingKey ? 'Validating...' : 'Validate & Save'}
                  </button>
                </div>
              </div>
            )}

            {/* How to get a free key info box */}
            <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-lg text-blue-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5 text-[11px]">
                  <Zap className="w-3.5 h-3.5 text-blue-600" /> Free Gemini API Key (Takes 30 Seconds)
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline"
                >
                  <span>Get Free Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[10px] text-blue-800 leading-relaxed">
                Google provides a 100% free tier for Gemini Flash models with 15 requests/min and 1,500 requests/day. No credit card required!
              </p>
            </div>
          </div>

          {/* Section 2: Screening Execution Options */}
          <div className="space-y-3">
            <span className="font-bold text-slate-900 text-xs block">AI Screening Scope</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                  scope === 'MANUAL_REVIEW'
                    ? 'border-indigo-600 bg-indigo-50/40 text-slate-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'MANUAL_REVIEW'}
                  onChange={() => setScope('MANUAL_REVIEW')}
                  className="mt-0.5 text-indigo-600 focus:ring-0"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-xs">Manual Review Only (Recommended)</div>
                  <div className="text-[10px] text-slate-500">
                    Targets candidates with GC/US Citizen who were pushed to manual review because their South Asian name was unconfirmed.
                  </div>
                </div>
              </label>

              <label
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-start gap-3 ${
                  scope === 'ALL'
                    ? 'border-indigo-600 bg-indigo-50/40 text-slate-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'ALL'}
                  onChange={() => setScope('ALL')}
                  className="mt-0.5 text-indigo-600 focus:ring-0"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-xs">All Applicants</div>
                  <div className="text-[10px] text-slate-500">
                    Runs comprehensive origin and gender classification across all applicants in the database.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Section 3: Summary Results if just completed */}
          {summaryResult && (
            <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3 border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> AI Screening Results
                </span>
                <span className="text-[10px] text-slate-400">Database Synced</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-800/80 p-2.5 rounded-lg">
                  <div className="text-xl font-black text-white">{summaryResult.total || 0}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Processed</div>
                </div>
                <div className="bg-emerald-950/60 border border-emerald-500/30 p-2.5 rounded-lg">
                  <div className="text-xl font-black text-emerald-400">+{summaryResult.promotedToPass || 0}</div>
                  <div className="text-[10px] text-emerald-300 uppercase font-semibold">Promoted to PASS</div>
                </div>
                <div className="bg-slate-800/80 p-2.5 rounded-lg">
                  <div className="text-sm font-bold text-slate-200 mt-1">
                    👨 {summaryResult.maleCount || 0} | 👩 {summaryResult.femaleCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">Gender Breakdown</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              {isConfigured ? 'Gemini 2.5 Flash ready' : 'Configure key above to enable'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRunAi}
                disabled={!isConfigured || runningAi}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold shadow-md shadow-indigo-200 transition"
              >
                {runningAi ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Gemini AI Evaluating...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Gemini AI Screening</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
