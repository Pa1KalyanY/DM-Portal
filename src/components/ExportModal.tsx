import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Users,
  FileCode,
  Copy,
  Check,
  ClipboardCheck,
  Eye,
  Sparkles,
} from 'lucide-react';
import { api } from '../api/client';
import { GOOGLE_SHEETS_COLUMNS } from '../shared/columnMapper';

interface ExportModalProps {
  onClose: () => void;
  defaultStatus?: string;
  defaultMode?: 'copy' | 'download';
  selectedApplicantIds?: string[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  onClose,
  defaultStatus = 'PASS',
  defaultMode = 'copy',
  selectedApplicantIds = [],
}) => {
  const [activeMode, setActiveMode] = useState<'copy' | 'download'>(defaultMode);
  const [exportScope, setExportScope] = useState<'selected' | 'filter'>(
    selectedApplicantIds.length > 0 ? 'selected' : 'filter'
  );

  // Common filters
  const [selectedStatus, setSelectedStatus] = useState<string>(defaultStatus);
  const [selectedGender, setSelectedGender] = useState<string>('ALL');

  // Copy mode specific states
  const [includeHeaders, setIncludeHeaders] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copySuccessMessage, setCopySuccessMessage] = useState<string>('');
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const [sheetsData, setSheetsData] = useState<{
    total: number;
    rows: Array<Record<string, string>>;
    tsv: string;
    tsvWithHeaders: string;
    tsvNoHeaders: string;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [showRawTsv, setShowRawTsv] = useState<boolean>(false);

  // Download mode specific states
  const [selectedFormat, setSelectedFormat] = useState<'xlsx' | 'csv' | 'tsv' | 'json'>('xlsx');
  const [selectedTemplate, setSelectedTemplate] = useState<'clean' | 'full'>('clean');

  // Load preview data whenever filters or headers change in copy mode
  useEffect(() => {
    let isCurrent = true;
    const loadPreview = async () => {
      setLoadingPreview(true);
      try {
        const data = await api.getGoogleSheetsData({
          ids: exportScope === 'selected' && selectedApplicantIds.length > 0 ? selectedApplicantIds : undefined,
          status: selectedStatus,
          gender: selectedGender,
          includeHeaders,
        });
        if (isCurrent) {
          setSheetsData(data);
        }
      } catch (err) {
        console.error('Failed to load Google Sheets data:', err);
      } finally {
        if (isCurrent) setLoadingPreview(false);
      }
    };

    loadPreview();
    return () => {
      isCurrent = false;
    };
  }, [selectedStatus, selectedGender, includeHeaders, exportScope, selectedApplicantIds]);

  // Handle direct clipboard copy
  const handleCopy = async (customStatus?: string, customGender?: string) => {
    setIsCopying(true);
    try {
      const res = await api.copyGoogleSheetsTsv({
        ids: exportScope === 'selected' && selectedApplicantIds.length > 0 ? selectedApplicantIds : undefined,
        status: customStatus !== undefined ? customStatus : selectedStatus,
        gender: customGender !== undefined ? customGender : selectedGender,
        includeHeaders,
      });

      setIsCopied(true);
      setCopySuccessMessage(res.message);
      setTimeout(() => {
        setIsCopied(false);
      }, 4000);
    } catch (err: any) {
      alert(`Could not copy to clipboard: ${err.message}. Please use the manual copy box below.`);
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownload = (
    format = selectedFormat,
    status = selectedStatus,
    gender = selectedGender,
    template = selectedTemplate
  ) => {
    const url = api.getExportUrl(format, {
      ids: exportScope === 'selected' && selectedApplicantIds.length > 0 ? selectedApplicantIds : undefined,
      status,
      gender,
      template,
    });
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Google Sheets & File Export</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Direct Copy Ready
                </span>
                {selectedApplicantIds.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    {selectedApplicantIds.length} Selected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Formatted as: <span className="font-semibold text-emerald-300">Date, Name, Contact Number (clean digits), Email I'd, Job Role, GREEN CARD/ US-C, H1B-Y/N, LinkedIn Profile Link</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedApplicantIds.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-lg border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setExportScope('selected')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                    exportScope === 'selected'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Selected ({selectedApplicantIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => setExportScope('filter')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                    exportScope === 'filter'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Filtered
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs (Google Sheets Direct Copy vs Download File) */}
        <div className="bg-slate-100/90 p-2 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveMode('copy')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-xs ${
                activeMode === 'copy'
                  ? 'bg-emerald-600 text-white shadow-emerald-700/20 shadow-md'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Direct Copy for Google Sheets (No Download)</span>
            </button>
            <button
              onClick={() => setActiveMode('download')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-xs ${
                activeMode === 'download'
                  ? 'bg-blue-600 text-white shadow-blue-700/20 shadow-md'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File (.xlsx, .csv, .tsv, .json)</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium hidden sm:flex items-center gap-1.5 pr-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Mobile numbers sanitized (+1 & symbols stripped)</span>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* ======================================================== */}
          {/* TAB 1: DIRECT COPY FOR GOOGLE SHEETS                     */}
          {/* ======================================================== */}
          {activeMode === 'copy' && (
            <div className="space-y-5">
              {/* Informational Guidance Banner */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-xs">
                    GS
                  </div>
                  <div>
                    <h3 className="font-bold text-emerald-950 text-sm">
                      Compatible with Google Sheets & Excel
                    </h3>
                    <p className="text-emerald-800 text-xs mt-0.5 leading-relaxed">
                      Click <strong>"Copy for Google Sheets"</strong> below, open your Google Spreadsheet, click on cell <strong>A1</strong> (or any cell), and press <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded font-mono font-bold text-emerald-900 shadow-xs">Ctrl+V</kbd>. Every applicant row and column will paste directly into separate cells!
                    </p>
                  </div>
                </div>

                {/* 1-Click Quick Copy Passed Button */}
                <button
                  type="button"
                  onClick={() => handleCopy('PASS', 'ALL')}
                  disabled={isCopying}
                  className="flex-shrink-0 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5"
                  title="Copy only PASS candidates with one click"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Quick Copy All Passed</span>
                </button>
              </div>

              {/* Success Notification Alert */}
              {isCopied && (
                <div className="p-3.5 bg-emerald-600 text-white rounded-xl shadow-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 flex-shrink-0 text-emerald-200" />
                    <span className="font-bold text-xs">{copySuccessMessage}</span>
                  </div>
                  <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded font-mono font-semibold">
                    Ready to paste (Ctrl+V)
                  </span>
                </div>
              )}

              {/* Filter Controls Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                {/* Status Selection */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Screening Status</label>
                  <div className="grid grid-cols-4 gap-1">
                    {['PASS', 'ALL', 'FAIL', 'MANUAL_REVIEW'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setSelectedStatus(st)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition text-center border ${
                          selectedStatus === st
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {st === 'MANUAL_REVIEW' ? 'REVIEW' : st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gender Filter */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Gender Filter</label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'ALL', label: 'All' },
                      { id: 'MALE', label: 'Male' },
                      { id: 'FEMALE', label: 'Female' },
                    ].map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedGender(g.id)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition text-center border ${
                          selectedGender === g.id
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Header Toggle & Row Counter */}
                <div className="flex flex-col justify-between">
                  <label className="block font-bold text-slate-700 mb-1.5">Paste Settings</label>
                  <label className="flex items-center gap-2 cursor-pointer select-none bg-white p-2 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={includeHeaders}
                      onChange={(e) => setIncludeHeaders(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-800 text-xs">
                      Include Header Row (Default: Off)
                    </span>
                  </label>
                </div>
              </div>

              {/* Main Action Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="font-bold text-sm text-emerald-950">
                    {loadingPreview ? (
                      'Counting applicants...'
                    ) : (
                      <>
                        <span className="text-emerald-700 font-extrabold text-base">
                          {sheetsData?.total || 0}
                        </span>{' '}
                        Applicant(s) Ready
                      </>
                    )}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 text-xs">
                    {includeHeaders ? '8 Columns with Headers' : '8 Columns (Data Only - Ready to Paste)'}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleCopy()}
                    disabled={isCopying || (sheetsData?.total || 0) === 0}
                    className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 ${
                      isCopied
                        ? 'bg-emerald-800 text-white shadow-emerald-900/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-300" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy for Google Sheets (Ctrl+V)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Preview of Google Sheets Output */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-700">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-500" />
                    <span className="font-bold text-xs text-slate-800">
                      Live Output Preview (First {Math.min(sheetsData?.rows?.length || 0, 10)} rows shown)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRawTsv(!showRawTsv)}
                    className="text-emerald-700 hover:text-emerald-800 font-bold text-[11px] underline"
                  >
                    {showRawTsv ? 'Hide Raw TSV Text' : 'View / Copy Raw TSV Text'}
                  </button>
                </div>

                {/* Table Preview */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          {GOOGLE_SHEETS_COLUMNS.map((col) => (
                            <th key={col} className="p-2.5 whitespace-nowrap font-bold text-slate-900">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingPreview ? (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-slate-400">
                              Loading preview data...
                            </td>
                          </tr>
                        ) : !sheetsData || sheetsData.rows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-slate-400">
                              No applicants found matching this status / gender filter.
                            </td>
                          </tr>
                        ) : (
                          sheetsData.rows.slice(0, 10).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50 font-mono">
                              <td className="p-2 text-slate-600 whitespace-nowrap">{r['Date'] || '—'}</td>
                              <td className="p-2 font-sans font-semibold text-slate-900 whitespace-nowrap">
                                {r['Name'] || '—'}
                              </td>
                              <td className="p-2 text-emerald-800 font-bold whitespace-nowrap bg-emerald-50/50">
                                {r['Contact Number'] || '—'}
                              </td>
                              <td className="p-2 text-slate-600 whitespace-nowrap">{r["Email I'd"] || '—'}</td>
                              <td className="p-2 font-sans text-slate-700 whitespace-nowrap">
                                {r['Job Role'] || '—'}
                              </td>
                              <td className="p-2 text-center whitespace-nowrap font-sans font-bold">
                                {r['GREEN CARD/ US-C'] === 'Yes' ? (
                                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Yes</span>
                                ) : r['GREEN CARD/ US-C'] === 'No' ? (
                                  <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">No</span>
                                ) : (
                                  r['GREEN CARD/ US-C'] || '—'
                                )}
                              </td>
                              <td className="p-2 text-center whitespace-nowrap font-sans font-bold">
                                {r['H1B-Y/N']?.toLowerCase() === 'no' ? (
                                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">No</span>
                                ) : r['H1B-Y/N']?.toLowerCase() === 'yes' ? (
                                  <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">Yes</span>
                                ) : (
                                  r['H1B-Y/N'] || '—'
                                )}
                              </td>
                              <td className="p-2 text-blue-600 truncate max-w-[180px]">
                                {r['LinkedIn Profile Link'] ? (
                                  <a
                                    href={r['LinkedIn Profile Link']}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline"
                                  >
                                    {r['LinkedIn Profile Link']}
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Optional Raw TSV Textarea */}
                {showRawTsv && sheetsData && (
                  <div className="p-3 bg-slate-900 text-slate-100 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Raw TSV Data (Tab-delimited for Google Sheets):</span>
                      <button
                        type="button"
                        onClick={() => {
                          const ta = document.getElementById('raw-tsv-textarea') as HTMLTextAreaElement;
                          if (ta) {
                            ta.select();
                            document.execCommand('copy');
                            alert('Copied raw TSV text to clipboard!');
                          }
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-bold underline"
                      >
                        Select All & Copy
                      </button>
                    </div>
                    <textarea
                      id="raw-tsv-textarea"
                      readOnly
                      rows={5}
                      value={includeHeaders ? sheetsData.tsvWithHeaders : sheetsData.tsvNoHeaders}
                      className="w-full bg-slate-950 font-mono text-[11px] p-2.5 rounded-lg border border-slate-800 text-emerald-300 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: DOWNLOAD FILE (.xlsx, .csv, .tsv, .json)          */}
          {/* ======================================================== */}
          {activeMode === 'download' && (
            <div className="space-y-4">
              {/* Quick Passed Buttons */}
              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>1-Click Quick Downloads for Passed Applicants:</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    onClick={() => handleDownload('xlsx', 'PASS', 'ALL')}
                    className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex flex-col items-center text-center gap-1"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Passed (All)</span>
                    <span className="text-[10px] text-emerald-200 font-normal">Excel .xlsx</span>
                  </button>
                  <button
                    onClick={() => handleDownload('xlsx', 'PASS', 'MALE')}
                    className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition flex flex-col items-center text-center gap-1"
                  >
                    <Users className="w-4 h-4" />
                    <span>Passed (Male)</span>
                    <span className="text-[10px] text-blue-200 font-normal">Excel .xlsx</span>
                  </button>
                  <button
                    onClick={() => handleDownload('xlsx', 'PASS', 'FEMALE')}
                    className="p-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition flex flex-col items-center text-center gap-1"
                  >
                    <Users className="w-4 h-4" />
                    <span>Passed (Female)</span>
                    <span className="text-[10px] text-purple-200 font-normal">Excel .xlsx</span>
                  </button>
                </div>
              </div>

              {/* Format selection */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800">1. Select File Format</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
                    { id: 'tsv', label: 'Google Sheets (.tsv)', icon: FileSpreadsheet },
                    { id: 'csv', label: 'CSV (.csv)', icon: FileText },
                    { id: 'json', label: 'JSON (.json)', icon: FileCode },
                  ].map((fmt) => {
                    const Icon = fmt.icon;
                    const isSel = selectedFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setSelectedFormat(fmt.id as any)}
                        className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition ${
                          isSel
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{fmt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Selection */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800">2. Screening Status</label>
                <div className="grid grid-cols-4 gap-2">
                  {['PASS', 'FAIL', 'MANUAL_REVIEW', 'ALL'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSelectedStatus(st)}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-bold transition ${
                        selectedStatus === st
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {st === 'MANUAL_REVIEW' ? 'REVIEW' : st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gender Filter Selection */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800">3. Gender Filter</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'ALL', label: 'All Genders' },
                    { id: 'MALE', label: 'Male' },
                    { id: 'FEMALE', label: 'Female' },
                    { id: 'UNSPECIFIED', label: 'Unspecified' },
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedGender(g.id)}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-bold transition ${
                        selectedGender === g.id
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Format */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800">4. Columns Layout</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('clean')}
                    className={`p-3 rounded-lg border text-left transition ${
                      selectedTemplate === 'clean'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Clean Recruiter / Google Sheets</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">
                        Default
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Exact 8 columns: Date, Name, Contact Number (clean digits), Email I'd, Job Role, GREEN CARD/ US-C, H1B-Y/N, LinkedIn Profile Link.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('full')}
                    className={`p-3 rounded-lg border text-left transition ${
                      selectedTemplate === 'full'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs">Full Audit Report</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      All 28 LinkedIn columns, raw screening questions, answers, and reasons.
                    </div>
                  </button>
                </div>
              </div>

              {/* Download Action Button */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload()}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {selectedFormat.toUpperCase()}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <div>
            Format: <span className="font-semibold text-slate-700">8 Clean Columns</span> | Contact Number:{' '}
            <span className="font-semibold text-emerald-700">Digits Only (No +1 or - . () _)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
