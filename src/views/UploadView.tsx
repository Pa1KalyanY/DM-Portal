import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertTriangle,
  ClipboardPaste,
  Sparkles,
  ArrowRight,
  Layers,
  FileCheck,
  FileText,
} from 'lucide-react';
import { api } from '../api/client';
import { NavTab } from '../components/Sidebar';

interface UploadViewProps {
  onSuccess: (importCode: string) => void;
  onNavigate: (tab: NavTab) => void;
}

interface SelectedFileItem {
  id: string;
  file: File;
  isValidating: boolean;
  isValid: boolean;
  rowCount: number;
  detectedJobTitle: string;
  detectedJobId: string;
  hasScreeningColumn: boolean;
  status: 'READY' | 'ERROR';
  errorMessage?: string;
  duplicateWarning?: {
    isDuplicate: boolean;
    previousImportId?: string;
    previousUploadedAt?: string;
  };
  forceProcessDuplicate?: boolean;
}

export const UploadView: React.FC<UploadViewProps> = ({ onSuccess, onNavigate }) => {
  const [activeUploadMode, setActiveUploadMode] = useState<'files' | 'clipboard'>('files');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [fileBatchName, setFileBatchName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Clipboard paste state
  const [pastedText, setPastedText] = useState('');
  const [pasteBatchLabel, setPasteBatchLabel] = useState('Clipboard Paste Requisition');
  const [isProcessingPaste, setIsProcessingPaste] = useState(false);

  const [processingProgress, setProcessingProgress] = useState<{
    currentFileIndex: number;
    totalFiles: number;
    currentFileName: string;
    processedRows: number;
    totalRows: number;
    percentage: number;
  } | null>(null);

  const [processingSummary, setProcessingSummary] = useState<{
    importCode: string;
    filesProcessed: number;
    totalApplicants: number;
    passed: number;
    failed: number;
    manualReview: number;
    errors: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate files upon selection (XLSX, XLS, CSV, PDF)
  const handleFilesSelected = async (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles).filter((f) => {
      const lower = f.name.toLowerCase();
      return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv') || lower.endsWith('.pdf');
    });

    if (fileArray.length === 0) return;

    if (!fileBatchName) {
      setFileBatchName(fileArray[0].name.replace(/\.[^/.]+$/, ''));
    }

    const newItems: SelectedFileItem[] = fileArray.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      isValidating: true,
      isValid: false,
      rowCount: 0,
      detectedJobTitle: 'Validating...',
      detectedJobId: '',
      hasScreeningColumn: false,
      status: 'READY',
    }));

    setSelectedFiles((prev) => [...prev, ...newItems]);

    try {
      const response = await api.validateFiles(fileArray);
      setSelectedFiles((prev) =>
        prev.map((item) => {
          const match = response.files.find((rf) => rf.originalName === item.file.name);
          if (match) {
            return {
              ...item,
              isValidating: false,
              isValid: match.isValid,
              rowCount: match.rowCount,
              detectedJobTitle: match.detectedJobTitle || item.file.name.replace(/\.[^/.]+$/, ''),
              detectedJobId: match.detectedJobId || 'N/A',
              hasScreeningColumn: match.hasScreeningColumn,
              status: match.status,
              errorMessage: match.error,
              duplicateWarning: match.duplicateWarning,
            };
          }
          return item;
        })
      );
    } catch (err: any) {
      console.error('Validation error:', err);
      setSelectedFiles((prev) =>
        prev.map((item) => ({
          ...item,
          isValidating: false,
          status: 'ERROR',
          errorMessage: err.message || 'Validation failed',
        }))
      );
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setProcessingSummary(null);
  };

  const handleProcessBatch = async () => {
    if (selectedFiles.length === 0) return;

    const validFiles = selectedFiles.filter(
      (f) => f.status === 'READY' && (!f.duplicateWarning?.isDuplicate || f.forceProcessDuplicate)
    );

    if (validFiles.length === 0) {
      alert('No valid files ready to process. Please check error messages or duplicates.');
      return;
    }

    setIsProcessing(true);
    const totalEstRows = validFiles.reduce((acc, f) => acc + f.rowCount, 0);

    let currentPct = 10;
    const progressInterval = setInterval(() => {
      currentPct = Math.min(currentPct + 15, 90);
      const estProcessed = Math.round((currentPct / 100) * totalEstRows);
      const fileIdx = Math.min(Math.floor((currentPct / 100) * validFiles.length) + 1, validFiles.length);

      setProcessingProgress({
        currentFileIndex: fileIdx,
        totalFiles: validFiles.length,
        currentFileName: validFiles[fileIdx - 1]?.file.name || 'Processing...',
        processedRows: estProcessed,
        totalRows: totalEstRows,
        percentage: currentPct,
      });
    }, 250);

    try {
      const filesToSend = validFiles.map((f) => f.file);
      const res = await api.processFiles(filesToSend, fileBatchName.trim() || undefined);

      clearInterval(progressInterval);
      setProcessingProgress({
        currentFileIndex: validFiles.length,
        totalFiles: validFiles.length,
        currentFileName: 'Completed',
        processedRows: totalEstRows,
        totalRows: totalEstRows,
        percentage: 100,
      });

      setProcessingSummary(res.summary);
      onSuccess(res.summary.importCode);
    } catch (err: any) {
      clearInterval(progressInterval);
      alert(`Batch processing error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Clipboard Paste Process Action
  const handleProcessClipboard = async () => {
    if (!pastedText.trim()) {
      alert('Please paste candidate spreadsheet or tabular text first.');
      return;
    }

    setIsProcessingPaste(true);
    try {
      const res = await api.processPastedData(pastedText, pasteBatchLabel);
      setProcessingSummary(res.summary);
      onSuccess(res.summary.importCode);
      setPastedText('');
    } catch (err: any) {
      alert(`Clipboard processing error: ${err.message}`);
    } finally {
      setIsProcessingPaste(false);
    }
  };

  const handlePasteFromClipboardButton = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setPastedText(clipText);
      }
    } catch (err) {
      alert('Could not access clipboard directly. Please press Ctrl+V inside the text area.');
    }
  };

  const handleLoadSampleFiles = async () => {
    try {
      const genRes = await api.generateSamples();
      const filesToLoad: File[] = [];
      for (const fname of genRes.files) {
        const response = await fetch(`/api/sample-files/${encodeURIComponent(fname)}`);
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], fname, {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
          filesToLoad.push(file);
        }
      }
      if (filesToLoad.length > 0) {
        handleFilesSelected(filesToLoad);
      }
    } catch (err: any) {
      alert(`Failed to load samples: ${err.message}`);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Upload Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">LinkedIn Applicant Import</h2>
            <p className="text-xs text-slate-500 mt-1">
              Upload Excel (.XLSX/.XLS), CSV, PDF resumes/exports, or paste directly from your clipboard!
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSampleFiles}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition shadow-xs flex-shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load 5 Ready-to-Test Files</span>
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs (Files vs Clipboard Paste) */}
        <div className="mt-5 flex items-center gap-2 border-b border-slate-100 pb-3">
          <button
            onClick={() => setActiveUploadMode('files')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeUploadMode === 'files'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Files (.XLSX, .CSV, .PDF)</span>
          </button>
          <button
            onClick={() => setActiveUploadMode('clipboard')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeUploadMode === 'clipboard'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>Paste from Clipboard</span>
          </button>
        </div>

        {/* TAB 1: FILE UPLOAD */}
        {activeUploadMode === 'files' && (
          <div>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-5 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/60 ring-4 ring-blue-500/10'
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-800">
                Drag & Drop XLSX, CSV, or PDF files here
              </div>
              <p className="text-xs text-slate-500 mt-1">or click to browse from your computer (batch up to 50 files)</p>
              <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded bg-slate-200/60 text-[11px] text-slate-600 font-medium">
                <span>Formats: Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf)</span>
              </div>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Selected Files ({selectedFiles.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {selectedFiles.reduce((acc, f) => acc + f.rowCount, 0).toLocaleString()} estimated rows
                    </span>
                  </div>
                  <button
                    onClick={clearAllFiles}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {selectedFiles.map((fileItem) => (
                    <div
                      key={fileItem.id}
                      className={`p-3.5 rounded-lg border text-xs transition ${
                        fileItem.status === 'ERROR'
                          ? 'bg-rose-50/50 border-rose-200'
                          : fileItem.duplicateWarning?.isDuplicate
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {fileItem.file.name.toLowerCase().endsWith('.pdf') ? (
                            <FileText className="w-5 h-5 flex-shrink-0 mt-0.5 text-indigo-600" />
                          ) : (
                            <FileSpreadsheet
                              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                                fileItem.status === 'ERROR'
                                  ? 'text-rose-600'
                                  : fileItem.duplicateWarning?.isDuplicate
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}
                            />
                          )}
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <span>{fileItem.file.name}</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({(fileItem.file.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                              {fileItem.isValidating ? (
                                <span className="text-blue-600 animate-pulse">Validating file...</span>
                              ) : fileItem.status === 'ERROR' ? (
                                <span className="text-rose-700 font-semibold">{fileItem.errorMessage}</span>
                              ) : (
                                <>
                                  <span className="font-semibold text-slate-700">
                                    {fileItem.rowCount.toLocaleString()} applicants
                                  </span>
                                  <span>•</span>
                                  <span>Job: {fileItem.detectedJobTitle}</span>
                                  {fileItem.detectedJobId && fileItem.detectedJobId !== 'N/A' && (
                                    <>
                                      <span>•</span>
                                      <span>ID: {fileItem.detectedJobId}</span>
                                    </>
                                  )}
                                </>
                              )}
                            </div>

                            {fileItem.duplicateWarning?.isDuplicate && (
                              <div className="mt-2 p-2 rounded bg-amber-100/70 border border-amber-300 text-amber-900 text-[11px]">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Notice: This file was previously imported ({fileItem.duplicateWarning.previousImportId}).</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      setSelectedFiles((prev) =>
                                        prev.map((f) =>
                                          f.id === fileItem.id
                                            ? { ...f, forceProcessDuplicate: true, duplicateWarning: undefined }
                                            : f
                                        )
                                      )
                                    }
                                    className="px-2 py-0.5 rounded bg-amber-700 text-white font-semibold hover:bg-amber-800 text-[10px]"
                                  >
                                    Process Again
                                  </button>
                                  <button
                                    onClick={() => removeFile(fileItem.id)}
                                    className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-300 font-semibold hover:bg-slate-50 text-[10px]"
                                  >
                                    Cancel / Remove
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {fileItem.status === 'READY' && !fileItem.isValidating && (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              READY
                            </span>
                          )}
                          {fileItem.status === 'ERROR' && (
                            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                              ERROR
                            </span>
                          )}
                          <button
                            onClick={() => removeFile(fileItem.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Batch Name Input (Visible in History) */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <label className="block text-slate-700 font-bold text-xs">
                    Batch / Import Name (Visible in History & Dashboard)
                  </label>
                  <input
                    type="text"
                    value={fileBatchName}
                    onChange={(e) => setFileBatchName(e.target.value)}
                    placeholder="e.g., AWS-1, CY-1 12/10, DA-1"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <p className="text-[10px] text-slate-400">
                    This custom name will identify this batch in Recent Imports, Import History, and candidate filters.
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    Processes screening questions, classifies gender, and evaluates mandatory rules.
                  </div>
                  <button
                    onClick={handleProcessBatch}
                    disabled={isProcessing}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Processing {selectedFiles.length} File(s)...</span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        <span>Process {selectedFiles.length} File(s)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CLIPBOARD PASTE (User Requested Feature) */}
        {activeUploadMode === 'clipboard' && (
          <div className="mt-5 space-y-4 text-xs">
            <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 text-blue-900 leading-relaxed">
              <strong>Direct Clipboard Paste:</strong> Copy rows from Excel, Google Sheets, or web tables (Ctrl+C) and paste below (Ctrl+V). Columns like <em>First Name, Last Name, Email, Phone, Title, Company, Screening Questions</em> will be mapped automatically.
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-800">Batch / Requisition Label</label>
              <input
                type="text"
                value={pasteBatchLabel}
                onChange={(e) => setPasteBatchLabel(e.target.value)}
                placeholder="e.g. Quick Paste Candidates - Software Engineers"
                className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800">Paste Tabular Text (TSV or CSV)</label>
                <button
                  type="button"
                  onClick={handlePasteFromClipboardButton}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px]"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
                  <span>Paste from System Clipboard</span>
                </button>
              </div>
              <textarea
                rows={9}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="First Name	Last Name	Email Address	Phone Number	Screening Questions
John	Smith	john@example.com	2145550100	Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No
Sarah	Davis	sarah@example.com	4695550101	Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes"
                className="w-full p-3 font-mono text-xs bg-slate-900 text-slate-100 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-slate-500 text-[11px]">
                {pastedText ? `${pastedText.split(/\r?\n/).filter(l => l.trim()).length} lines detected` : 'No text pasted yet'}
              </span>
              <button
                type="button"
                onClick={handleProcessClipboard}
                disabled={isProcessingPaste || !pastedText.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
              >
                {isProcessingPaste ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing Pasted Data...</span>
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="w-4 h-4" />
                    <span>Process Pasted Applicants</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Batch Processing Progress Bar */}
      {isProcessing && processingProgress && (
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-md space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <span className="flex items-center gap-2 text-blue-700">
              <div className="w-3 h-3 rounded-full bg-blue-600 animate-ping"></div>
              <span>Batch Processing In Progress</span>
            </span>
            <span>{processingProgress.percentage}%</span>
          </div>

          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${processingProgress.percentage}%` }}
            ></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-600 pt-1">
            <div>
              <span className="text-slate-400">Files: </span>
              <strong className="text-slate-800">
                {processingProgress.currentFileIndex} / {processingProgress.totalFiles}
              </strong>
            </div>
            <div>
              <span className="text-slate-400">Rows: </span>
              <strong className="text-slate-800">
                {processingProgress.processedRows.toLocaleString()} / {processingProgress.totalRows.toLocaleString()}
              </strong>
            </div>
            <div className="col-span-2 truncate">
              <span className="text-slate-400">Current file: </span>
              <strong className="text-slate-800">{processingProgress.currentFileName}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Processing Summary */}
      {processingSummary && (
        <div className="bg-emerald-950 text-white rounded-xl p-6 shadow-xl space-y-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-emerald-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">PROCESSING COMPLETE</h3>
                <p className="text-xs text-emerald-300/80 mt-0.5">
                  Batch Import <strong className="text-white">{processingSummary.importCode}</strong> has been successfully processed and stored.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('applicants-all')}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5"
            >
              <span>View Filtered Applicants</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-800/60">
              <div className="text-[11px] text-emerald-300">Files Processed</div>
              <div className="text-xl font-bold text-white mt-1">{processingSummary.filesProcessed}</div>
            </div>
            <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-800/60">
              <div className="text-[11px] text-emerald-300">Applicants</div>
              <div className="text-xl font-bold text-white mt-1">
                {processingSummary.totalApplicants.toLocaleString()}
              </div>
            </div>
            <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-500/40">
              <div className="text-[11px] text-emerald-300 font-semibold">PASS</div>
              <div className="text-xl font-bold text-emerald-300 mt-1">
                {processingSummary.passed.toLocaleString()}
              </div>
            </div>
            <div className="bg-emerald-900/40 p-3 rounded-lg border border-rose-500/40">
              <div className="text-[11px] text-rose-300 font-semibold">FAIL</div>
              <div className="text-xl font-bold text-rose-300 mt-1">
                {processingSummary.failed.toLocaleString()}
              </div>
            </div>
            <div className="bg-emerald-900/40 p-3 rounded-lg border border-amber-500/40">
              <div className="text-[11px] text-amber-300 font-semibold">MANUAL REVIEW</div>
              <div className="text-xl font-bold text-amber-300 mt-1">
                {processingSummary.manualReview.toLocaleString()}
              </div>
            </div>
            <div className="bg-emerald-900/40 p-3 rounded-lg border border-slate-700">
              <div className="text-[11px] text-slate-300 font-semibold">ERRORS</div>
              <div className="text-xl font-bold text-slate-200 mt-1">
                {processingSummary.errors.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
