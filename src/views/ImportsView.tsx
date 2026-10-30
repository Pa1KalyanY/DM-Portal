import React, { useState, useEffect } from 'react';
import { History, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { ImportRecord } from '../types';
import { api } from '../api/client';

export const ImportsView: React.FC = () => {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchImports = async () => {
      try {
        const data = await api.getImports();
        setImports(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchImports();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Import History & Audits</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical batches of LinkedIn XLSX files processed, row counts, and screening distributions.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading import history...</div>
      ) : imports.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
          No imports found. Upload LinkedIn XLSX files to begin tracking batches.
        </div>
      ) : (
        <div className="space-y-4">
          {imports.map((imp) => {
            const isExpanded = expandedId === imp.id;
            return (
              <div
                key={imp.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition"
              >
                <div
                  onClick={() => toggleExpand(imp.id)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/60"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {imp.importCode}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">
                          {imp.batchName || imp.files?.[0]?.jobTitle || imp.files?.[0]?.filename || imp.importCode}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {imp.importCode}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                          {imp.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Uploaded by <strong className="text-slate-700">{imp.uploadedBy}</strong> on{' '}
                        {new Date(imp.uploadedAt).toLocaleString()} • {imp.fileCount} file(s)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-right">
                        <div className="text-slate-400 text-[10px] uppercase font-bold">Applicants</div>
                        <div className="font-bold text-slate-900">{imp.totalApplicants.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-600 text-[10px] uppercase font-bold">Pass</div>
                        <div className="font-bold text-emerald-700">{imp.passedCount.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-rose-600 text-[10px] uppercase font-bold">Fail</div>
                        <div className="font-bold text-rose-700">{imp.failedCount.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-amber-600 text-[10px] uppercase font-bold">Review</div>
                        <div className="font-bold text-amber-700">{imp.manualReviewCount.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="text-slate-400 p-1">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Files Breakdown */}
                {isExpanded && (
                  <div className="bg-slate-50/70 p-5 border-t border-slate-200 space-y-3">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Files Included in this Batch ({imp.files.length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {imp.files.map((file, fIdx) => (
                        <div
                          key={fIdx}
                          className="p-3 bg-white rounded-lg border border-slate-200 text-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <div>
                              <div className="font-bold text-slate-800">{file.filename}</div>
                              <div className="text-[11px] text-slate-500">
                                Job: {file.jobTitle || 'N/A'} {file.jobId ? `(${file.jobId})` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="font-bold text-slate-800">{file.rowCount} applicants</span>
                            <div className="text-[10px] text-emerald-600 font-semibold">{file.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
