import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileSpreadsheet,
  Download,
  RotateCcw,
  Sparkles,
  Info,
  Database,
  Layers,
} from 'lucide-react';
import { api } from '../api/client';

interface ReferenceMatcherModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onMatchesUpdated?: () => void;
}

export const ReferenceMatcherModal: React.FC<ReferenceMatcherModalProps> = ({
  isOpen = true,
  onClose,
  onMatchesUpdated,
}) => {
  if (!isOpen) return null;
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [threshold, setThreshold] = useState<number>(0.80);
  const [exportFilter, setExportFilter] = useState<string>('ALL');
  const [notification, setNotification] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await api.getReferenceMatcherStats();
      setStats(data);
      if (data.similarityThreshold) {
        setThreshold(data.similarityThreshold);
      }
    } catch (err: any) {
      console.error('Error fetching matcher stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRunMatching = async () => {
    try {
      setRunning(true);
      const res = await api.runReferenceMatching(threshold);
      setNotification(res.message);
      fetchStats();
      if (onMatchesUpdated) {
        onMatchesUpdated();
      }
      setTimeout(() => setNotification(null), 6000);
    } catch (err: any) {
      alert(`Matching failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      setExporting(true);
      await api.exportReferenceMatches({
        format,
        nameMatchCategory: exportFilter,
      });
      setNotification(`Exported ${exportFilter} name match results to ${format.toUpperCase()}!`);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const dbSummary = stats?.dbSummary || {
    total: 0,
    strongMatches: 0,
    possibleMatches: 0,
    noMatches: 0,
    threshold: 0.80,
  };

  const totalDb = dbSummary.total || 1;
  const strongPct = Math.round((dbSummary.strongMatches / totalDb) * 100);
  const possiblePct = Math.round((dbSummary.possibleMatches / totalDb) * 100);
  const noMatchPct = Math.round((dbSummary.noMatches / totalDb) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-white/10"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Reference Name Pattern Matcher</h2>
              <p className="text-xs text-blue-200/80">
                Pattern extraction and similarity filtering against both verified reference datasets
              </p>
            </div>
          </div>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div className="p-3.5 bg-emerald-600 text-white text-xs font-semibold flex items-center justify-between px-6 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
              <span>{notification}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-emerald-200 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-slate-800">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-semibold">Analyzing reference datasets & patterns...</p>
            </div>
          ) : (
            <>
              {/* Reference Dataset Summary Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-600/10 text-indigo-700 flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      Reference Dataset 1
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      {(stats?.dataset1Count || 0).toLocaleString()} <span className="text-xs font-normal text-slate-500">names</span>
                    </div>
                    <div className="text-[10px] text-slate-500">General / Surnames dataset</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-600/10 text-purple-700 flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">
                      Reference Dataset 2
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      {(stats?.dataset2Count || 0).toLocaleString()} <span className="text-xs font-normal text-slate-500">names</span>
                    </div>
                    <div className="text-[10px] text-slate-500">Female / Surnames dataset</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600/10 text-blue-700 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                      Total Extracted Patterns
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      {(stats?.totalReferenceNames || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {(stats?.uniqueTokens || 0).toLocaleString()} tokens • {(stats?.uniqueTokenCombos || 0).toLocaleString()} pairs
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Match Distribution Breakdown */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Current Applicant Match Breakdown ({dbSummary.total} Total)
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Threshold: <strong>{Math.round(threshold * 100)}%</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Strong Match */}
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Strong Match
                      </span>
                      <span className="text-xs font-black text-emerald-700">{strongPct}%</span>
                    </div>
                    <div className="text-2xl font-black text-emerald-950">
                      {dbSummary.strongMatches}
                    </div>
                    <div className="text-[10px] text-emerald-700/80 mt-1">
                      Exact full matches or verified reference multi-token combinations
                    </div>
                  </div>

                  {/* Possible Match */}
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        Possible Match
                      </span>
                      <span className="text-xs font-black text-amber-700">{possiblePct}%</span>
                    </div>
                    <div className="text-2xl font-black text-amber-950">
                      {dbSummary.possibleMatches}
                    </div>
                    <div className="text-[10px] text-amber-700/80 mt-1">
                      Partial matches, single distinctive surnames, or morphological suffixes
                    </div>
                  </div>

                  {/* No Match */}
                  <div className="p-4 rounded-xl bg-slate-100 border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                        No Match
                      </span>
                      <span className="text-xs font-black text-slate-600">{noMatchPct}%</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900">
                      {dbSummary.noMatches}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      No reference patterns matched (or isolated common token only)
                    </div>
                  </div>
                </div>
              </div>

              {/* Adjustable Similarity Threshold Slider */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    <label className="text-xs font-bold text-slate-800">
                      Adjust Similarity Threshold
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-lg">
                      {Math.round(threshold * 100)}%
                    </span>
                    <span className="text-xs text-slate-400">({threshold.toFixed(2)})</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />

                <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                  <span>50% (More Permissive)</span>
                  <span>75% - 80% (Recommended)</span>
                  <span>95% (Strict Exact Match)</span>
                </div>

                {/* Requirement 8 Safeguard Alert */}
                <div className="p-3 bg-blue-50/80 rounded-lg border border-blue-200/60 flex items-start gap-2.5 text-xs text-blue-900">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-[11px] leading-relaxed">
                    <p className="font-bold">
                      Anti-False-Positive Safeguard Active (Requirement 8)
                    </p>
                    <p className="text-blue-800">
                      A shared first name or an isolated common token alone (e.g. "Kumar", "Sai", "Patel", "Reddy", "Singh") is never classified as a Strong Match. At least two compatible tokens or a verified reference combination is required for Strong Match classification.
                    </p>
                  </div>
                </div>

                {/* Re-Run Action Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleRunMatching}
                    disabled={running}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer disabled:opacity-50"
                  >
                    {running ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    <span>Apply Threshold & Re-Match All</span>
                  </button>
                </div>
              </div>

              {/* Export Filtered Results Section */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-slate-800">
                      Export Matched Results (CSV or Excel)
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-semibold">Filter:</span>
                    <select
                      value={exportFilter}
                      onChange={(e) => setExportFilter(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="ALL">All Applicants ({dbSummary.total})</option>
                      <option value="Strong Match">Strong Matches Only ({dbSummary.strongMatches})</option>
                      <option value="Possible Match">Possible Matches Only ({dbSummary.possibleMatches})</option>
                      <option value="No Match">No Matches Only ({dbSummary.noMatches})</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    onClick={() => handleExport('xlsx')}
                    disabled={exporting}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Excel (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => handleExport('csv')}
                    disabled={exporting}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download CSV (.csv)</span>
                  </button>
                </div>
              </div>

              {/* Recurring Patterns and Top Tokens Overview */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Extracted High-Frequency Reference Tokens
                </h4>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                  {stats?.topTokens?.map((item: any) => (
                    <span
                      key={item.token}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-2xs"
                    >
                      {item.token} <strong className="text-indigo-600 font-mono text-[10px]">({item.count})</strong>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Results are used for similarity filtering & manual review assistance.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold shadow-2xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
