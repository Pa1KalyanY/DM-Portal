import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  RefreshCw,
  Layers,
  Building2,
  Calendar,
  Briefcase,
  HelpCircle,
  FileText,
  Sliders,
  ChevronDown,
  Info,
  ShieldCheck,
  Check,
  AlertCircle
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { CompanyName } from '../../types/masterDatabase';
import { api } from '../../api/client';
import {
  ColumnMappingConfig,
  WorkbookPreviewResult,
  TargetColumn,
  TARGET_COLUMN_METADATA,
  parseWorkbookForPreview,
  parsePastedTextForPreview
} from '../../shared/importMappingEngine';
import { MainNavSection } from '../../shared/navigationState';

interface ManualUploadWorkspaceViewProps {
  onNavigate?: (section: MainNavSection) => void;
}

export const ManualUploadWorkspaceView: React.FC<ManualUploadWorkspaceViewProps> = ({ onNavigate }) => {
  const { recruitmentCompany } = useWorkspace();
  const [activeCompany, setActiveCompany] = useState<CompanyName>(recruitmentCompany || 'AaraTech');
  const [processingDate, setProcessingDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedJobSlot, setSelectedJobSlot] = useState<string>('ALL');
  const [genderMode, setGenderMode] = useState<'AUTO' | 'MALE' | 'FEMALE'>('AUTO');
  const [baselineJobs, setBaselineJobs] = useState<Array<{ jobId: string; jobTitle: string }>>([]);

  // Ingestion Mode
  const [ingestMode, setIngestMode] = useState<'file' | 'paste'>('file');

  // File Upload State
  const [isDragging, setIsDragging] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste Area State
  const [pastedText, setPastedText] = useState<string>('');
  const [pasteCustomName, setPasteCustomName] = useState<string>('');

  // Processing & Preview State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<WorkbookPreviewResult | null>(null);
  const [activeMappings, setActiveMappings] = useState<ColumnMappingConfig[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Phase 2 Validation Confirmation State
  const [validationSuccess, setValidationSuccess] = useState<boolean>(false);

  // Sync workspace company
  useEffect(() => {
    if (recruitmentCompany) {
      setActiveCompany(recruitmentCompany);
    }
  }, [recruitmentCompany]);

  // Load baseline job slots for selected company
  useEffect(() => {
    async function loadJobs() {
      try {
        const jobs = await api.getJobs(activeCompany);
        setBaselineJobs(jobs.map(j => ({ jobId: j.jobId, jobTitle: j.jobTitle })));
      } catch (err) {
        console.warn('Could not load job slots:', err);
      }
    }
    loadJobs();
  }, [activeCompany]);

  // Handle file selection
  const handleFileChange = async (file: File, sheetOverride?: string) => {
    setErrorMsg(null);
    setValidationSuccess(false);
    setIsAnalyzing(true);
    setCurrentFile(file);

    try {
      const buffer = await file.arrayBuffer();
      const preview = parseWorkbookForPreview(buffer, file.name, sheetOverride);
      setPreviewData(preview);
      setSelectedSheet(preview.selectedSheet);
      setActiveMappings(preview.mappings);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to read workbook or spreadsheet file.');
      setPreviewData(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle sheet switch in multi-sheet Excel
  const handleSheetSwitch = async (sheetName: string) => {
    if (!currentFile || sheetName === selectedSheet) return;
    await handleFileChange(currentFile, sheetName);
  };

  // Handle Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileChange(file);
    }
  };

  // Handle Paste Preview
  const handleAnalyzePaste = () => {
    if (!pastedText.trim()) {
      setErrorMsg('Please paste tabular rows from Google Sheets or Excel before previewing.');
      return;
    }
    setErrorMsg(null);
    setValidationSuccess(false);
    setIsAnalyzing(true);

    try {
      const preview = parsePastedTextForPreview(
        pastedText,
        pasteCustomName.trim() || `Pasted Batch - ${processingDate}`
      );
      setPreviewData(preview);
      setSelectedSheet(preview.selectedSheet);
      setActiveMappings(preview.mappings);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse pasted application text.');
      setPreviewData(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Insert standard template headers into paste area
  const handleInsertTemplateHeaders = () => {
    const template = "Candidate Name\tPrimary Email\tContact Number\tJob Role\tLocation\tDate\tGC / US-C\tH1B Visa\tOriginal Feedback\n";
    setPastedText(prev => template + prev);
  };

  // Manual Mapping Override
  const handleUpdateMapping = (sourceCol: string, targetCol: TargetColumn) => {
    setActiveMappings(prev =>
      prev.map(m => {
        if (m.sourceColumn === sourceCol) {
          return {
            ...m,
            targetColumn: targetCol,
            confidence: 1.0,
            warning: undefined,
          };
        }
        return m;
      })
    );
  };

  // Reset mappings to auto-detected defaults
  const handleResetMappings = () => {
    if (previewData) {
      setActiveMappings(previewData.mappings);
      setValidationSuccess(false);
    }
  };

  // Clear workspace
  const handleClearAll = () => {
    setCurrentFile(null);
    setPreviewData(null);
    setActiveMappings([]);
    setPastedText('');
    setPasteCustomName('');
    setErrorMsg(null);
    setValidationSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Check required fields
  const isNameMapped = activeMappings.some(m => m.targetColumn === 'full_name');
  const isContactMapped = activeMappings.some(m => m.targetColumn === 'email' || m.targetColumn === 'phone');
  const mappedCount = activeMappings.filter(m => m.targetColumn !== 'ignore').length;

  // Validation & Mapping Confirmation (Phase 2 feature check)
  const handleValidateAndConfirm = () => {
    if (!isNameMapped) {
      setErrorMsg('Cannot proceed: You must map at least one column to "Candidate Full Name".');
      return;
    }
    if (!isContactMapped) {
      setErrorMsg('Cannot proceed: You must map at least one column to Primary Email or Primary Phone.');
      return;
    }
    setErrorMsg(null);
    setValidationSuccess(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header Card */}
      <div className="card-premium p-6 bg-gradient-to-r from-white via-slate-50 to-blue-50/30 border border-slate-200 rounded-xl shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-blue-600 text-white shadow-sm shrink-0">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Manual Application Upload &amp; Multi-Sheet Ingestion
                </h1>
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  Master CRM Parity
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Upload Excel (<code className="text-slate-700">.xlsx</code>, <code className="text-slate-700">.xls</code>) or <code className="text-slate-700">.csv</code> spreadsheets with multi-sheet tab selection, or paste tabular rows directly. Features automatic column detection, confidence badges, ATS role-code safeguards, and pre-commit preview.
              </p>
            </div>
          </div>

          {/* Quick Action Navigation */}
          {onNavigate && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('filter')}
                className="btn-secondary !text-xs !py-1.5 flex items-center gap-1.5"
                title="Go to LinkedIn Application Filter Workspace"
              >
                <span>LinkedIn Filter</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('master-candidates')}
                className="btn-tertiary !text-xs !py-1.5"
                title="View Master Candidate Database"
              >
                <span>Master CRM</span>
              </button>
            </div>
          )}
        </div>

        {/* Setup Parameters Bar */}
        <div className="mt-5 pt-4 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Target Company */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Target Workspace Entity:</span>
            </label>
            <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveCompany('AaraTech')}
                className={`flex-1 py-1 px-2.5 rounded-md font-semibold text-xs transition-all ${
                  activeCompany === 'AaraTech'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AaraTech
              </button>
              <button
                type="button"
                onClick={() => setActiveCompany('ClinisolTech')}
                className={`flex-1 py-1 px-2.5 rounded-md font-semibold text-xs transition-all ${
                  activeCompany === 'ClinisolTech'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ClinisolTech
              </button>
            </div>
          </div>

          {/* Portal Ingestion Date */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Portal Ingestion Date:</span>
            </label>
            <input
              type="date"
              value={processingDate}
              onChange={(e) => setProcessingDate(e.target.value)}
              className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          {/* Requisition Job Slot */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5 text-blue-600" />
              <span>Relevant Job Requisition:</span>
            </label>
            <select
              value={selectedJobSlot}
              onChange={(e) => setSelectedJobSlot(e.target.value)}
              className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer truncate"
            >
              <option value="ALL">All Requisitions (Derive from row / file)</option>
              {baselineJobs.map((job) => (
                <option key={job.jobId} value={job.jobId}>
                  [{job.jobId}] {job.jobTitle}
                </option>
              ))}
            </select>
          </div>

          {/* Gender Classification Mode */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              <span>Gender Detection Mode:</span>
            </label>
            <select
              value={genderMode}
              onChange={(e) => setGenderMode(e.target.value as any)}
              className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
            >
              <option value="AUTO">★ Auto-Detect (Cultural &amp; Lexical)</option>
              <option value="MALE">Force Male ♂ (Batch override)</option>
              <option value="FEMALE">Force Female ♀ (Batch override)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Error / Notification Alert */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-3 shadow-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Validation or Parsing Issue:</p>
            <p>{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-rose-500 hover:text-rose-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Input Mode Selection (File Upload vs Copy & Paste) */}
      {!previewData && (
        <div className="card-premium overflow-hidden border border-slate-200 rounded-xl bg-white shadow-xs">
          {/* Tabs */}
          <div className="flex items-center border-b border-slate-200 bg-slate-50/70 px-4 pt-2">
            <button
              type="button"
              onClick={() => setIngestMode('file')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                ingestMode === 'file'
                  ? 'border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Upload Spreadsheet File (.xlsx, .xls, .csv)</span>
            </button>
            <button
              type="button"
              onClick={() => setIngestMode('paste')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                ingestMode === 'paste'
                  ? 'border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>Copy &amp; Paste Tabular Rows (Google Sheets / TSV)</span>
            </button>
          </div>

          <div className="p-6">
            {ingestMode === 'file' ? (
              /* Dropzone */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                />
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="p-4 rounded-full bg-blue-100/70 text-blue-600 shadow-2xs">
                    <FileSpreadsheet className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Drag and drop your candidate spreadsheet here
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Supports modern Excel (<code className="text-slate-700 font-semibold">.xlsx</code>), legacy Excel (<code className="text-slate-700 font-semibold">.xls</code>), or CSV (<code className="text-slate-700 font-semibold">.csv</code>)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="btn-primary !text-xs !py-2 !px-4 shadow-xs"
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Inspecting Workbook &amp; Sheets...</span>
                      </span>
                    ) : (
                      <span>Browse Spreadsheet File</span>
                    )}
                  </button>
                  <p className="text-[11px] text-slate-400">
                    Workbooks with multiple sheets will prompt you to select the target worksheet tab.
                  </p>
                </div>
              </div>
            ) : (
              /* Copy & Paste Area */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Paste Application Rows Directly from Sheets or Excel
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Copy tabular rows (including or excluding headers) and paste them here (Ctrl+V).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleInsertTemplateHeaders}
                      className="btn-secondary !text-xs !py-1 shadow-2xs"
                      title="Insert recommended column headers into the paste box"
                    >
                      <FileText className="w-3 h-3 mr-1 text-blue-600 inline" />
                      <span>Insert Template Headers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPastedText('')}
                      disabled={!pastedText}
                      className="btn-tertiary !text-xs !py-1 disabled:opacity-40"
                    >
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Candidate Full Name\tEmail Address\tPhone Number\tJob Role\tGC / US-C\tSponsorship\nJohn Doe\tjohndoe@example.com\t(555) 019-2834\tData Analyst\tYes\tNo\nJane Smith\tjanesmith@example.com\t(555) 018-9922\tCyberSecurity\tYes\tNo`}
                  className="w-full font-mono text-xs px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                />

                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={pasteCustomName}
                    onChange={(e) => setPasteCustomName(e.target.value)}
                    placeholder={`Batch label (e.g. Pasted Leads - ${processingDate})`}
                    className="flex-1 max-w-sm px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={handleAnalyzePaste}
                    disabled={isAnalyzing || !pastedText.trim()}
                    className="btn-primary !text-xs !py-2 !px-4 shadow-xs disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing Pasted Columns...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Analyze &amp; Map Pasted Columns</span>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Active Preview & Interactive Mapping Workspace */}
      {previewData && (
        <div className="space-y-5 animate-in fade-in">
          {/* File & Multi-Sheet Header Bar */}
          <div className="card-premium p-4 border border-slate-200 bg-white rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{previewData.fileName}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 uppercase">
                    {previewData.fileType}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span>
                    Total Rows: <strong className="text-slate-800">{previewData.totalRows}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Mapped Columns: <strong className="text-blue-700">{mappedCount}</strong> of {previewData.headers.length}
                  </span>
                  {previewData.emptyRowsCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-600 font-medium">
                        {previewData.emptyRowsCount} empty rows skipped
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Multi-Sheet Selector Pill (When workbook has > 1 sheets) */}
            {previewData.availableSheets.length > 1 && (
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 px-2 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Worksheet Tab:</span>
                </span>
                {previewData.availableSheets.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSheetSwitch(s)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      selectedSheet === s
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleClearAll}
              className="btn-tertiary !text-xs !py-1.5 flex items-center gap-1.5 self-start md:self-center"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
              <span>Change File / Start Over</span>
            </button>
          </div>

          {/* Warnings List */}
          {previewData.warnings && previewData.warnings.length > 0 && (
            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
              {previewData.warnings.map((w, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* 5. Interactive Column Mapping Grid */}
          <div className="card-premium overflow-hidden border border-slate-200 rounded-xl bg-white shadow-xs">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>Column Mapping &amp; Field Alignment Grid</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Confirm or override automatic mappings. ATS role abbreviations (DA, BA, AWS) are automatically protected from mapping to candidate names.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetMappings}
                  className="btn-secondary !text-xs !py-1 flex items-center gap-1"
                  title="Reset mappings back to auto-detected suggestions"
                >
                  <RefreshCw className="w-3 h-3 text-slate-500" />
                  <span>Reset to Auto-Detected</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 w-10">#</th>
                    <th className="px-4 py-2.5 min-w-[180px]">Source Spreadsheet Column</th>
                    <th className="px-4 py-2.5 min-w-[220px]">Sample Values from File</th>
                    <th className="px-4 py-2.5 min-w-[240px]">Mapped Target Database Field</th>
                    <th className="px-4 py-2.5 min-w-[140px] text-center">Confidence / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeMappings.map((mapping, idx) => {
                    const isRequired = TARGET_COLUMN_METADATA[mapping.targetColumn]?.required;
                    const confidencePercent = Math.round(mapping.confidence * 100);

                    return (
                      <tr key={mapping.sourceColumn} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{mapping.sourceColumn}</div>
                          {mapping.warning && (
                            <div className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{mapping.warning}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-sm">
                            {mapping.sampleValues && mapping.sampleValues.length > 0 ? (
                              mapping.sampleValues.slice(0, 3).map((val, vIdx) => (
                                <span
                                  key={vIdx}
                                  className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-mono truncate max-w-[170px]"
                                  title={val}
                                >
                                  {val}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">— No values —</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={mapping.targetColumn}
                            onChange={(e) => handleUpdateMapping(mapping.sourceColumn, e.target.value as TargetColumn)}
                            className={`w-full py-1.5 px-2.5 text-xs rounded-lg border font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                              mapping.targetColumn === 'ignore'
                                ? 'bg-slate-50 border-slate-200 text-slate-400'
                                : isRequired
                                ? 'bg-blue-50/40 border-blue-200 text-blue-900 font-bold'
                                : 'bg-white border-slate-200 text-slate-800'
                            }`}
                          >
                            <option value="ignore">— Ignore Column —</option>

                            <optgroup label="Candidate Identity">
                              <option value="full_name">Candidate Full Name (Required)</option>
                              <option value="first_name">First Name</option>
                              <option value="last_name">Last Name</option>
                              <option value="gender">Gender (Male / Female)</option>
                              <option value="linkedin_url">LinkedIn Profile URL</option>
                            </optgroup>

                            <optgroup label="Contact Info">
                              <option value="email">Primary Email (Required)</option>
                              <option value="phone">Primary Phone (Required)</option>
                              <option value="secondary_email">Secondary Email</option>
                              <option value="secondary_phone">Secondary Phone</option>
                            </optgroup>

                            <optgroup label="Candidate Location">
                              <option value="location">Location (City, State)</option>
                              <option value="preferred_location">Preferred Location / Relocation</option>
                            </optgroup>

                            <optgroup label="Job Application">
                              <option value="job_title">Job Role / Title</option>
                              <option value="job_id">Job Requisition ID</option>
                              <option value="company">Company Entity</option>
                              <option value="date_applied">Application Date</option>
                              <option value="current_stage">Application Stage</option>
                              <option value="resume_link">Resume Link</option>
                            </optgroup>

                            <optgroup label="Recruiter Touchpoint">
                              <option value="recruiter_feedback">Recruiter Feedback / Notes (Verbatim)</option>
                              <option value="owner">Assigned Recruiter / Owner</option>
                            </optgroup>

                            <optgroup label="Work Authorization Screening">
                              <option value="green_card_answer">GC / US Citizen Answer (Yes/No)</option>
                              <option value="sponsorship_answer">Visa Sponsorship Requirement (Yes/No)</option>
                              <option value="us_work_auth_answer">US Work Auth Answer (Yes/No)</option>
                            </optgroup>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {mapping.targetColumn === 'ignore' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                              Ignored
                            </span>
                          ) : confidencePercent >= 95 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{confidencePercent}% Match</span>
                            </span>
                          ) : confidencePercent >= 80 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <span>{confidencePercent}% Pattern</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <span>Manual Pick</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 6. Sample Data Preview Table (First 5 Rows) */}
          <div className="card-premium overflow-hidden border border-slate-200 rounded-xl bg-white shadow-xs">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Sample Data Preview (First 5 Rows)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Verify how your mapped fields will be extracted before committing to database.
                </p>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Showing 5 of {previewData.totalRows} rows
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-[11px] w-8">#</th>
                    {activeMappings
                      .filter(m => m.targetColumn !== 'ignore')
                      .map(m => (
                        <th key={m.sourceColumn} className="px-3 py-2 text-[11px] whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {TARGET_COLUMN_METADATA[m.targetColumn]?.label || m.targetColumn}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono font-normal">
                            col: {m.sourceColumn}
                          </div>
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.sampleRows.slice(0, 5).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-[11px] text-slate-400 font-mono">{rIdx + 1}</td>
                      {activeMappings
                        .filter(m => m.targetColumn !== 'ignore')
                        .map(m => (
                          <td key={m.sourceColumn} className="px-3 py-2 text-slate-700 font-mono text-[11px] max-w-[200px] truncate">
                            {row[m.sourceColumn] !== undefined && row[m.sourceColumn] !== null && String(row[m.sourceColumn]).trim()
                              ? String(row[m.sourceColumn])
                              : <span className="text-slate-300 italic">—</span>}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 7. Action Footer & Phase 2 Confirmation Card */}
          <div className="card-premium p-5 border border-slate-200 bg-white rounded-xl shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-slate-800">Essential Field Status:</span>
                  <span className={`inline-flex items-center gap-1 font-semibold ${isNameMapped ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {isNameMapped ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5" />}
                    <span>Candidate Name ({isNameMapped ? 'Mapped' : 'Missing'})</span>
                  </span>
                  <span>•</span>
                  <span className={`inline-flex items-center gap-1 font-semibold ${isContactMapped ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {isContactMapped ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5" />}
                    <span>Contact Info ({isContactMapped ? 'Mapped' : 'Missing Email or Phone'})</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Target Company: <strong className="text-slate-800">{activeCompany}</strong> | Ingestion Date: <strong className="text-slate-800">{processingDate}</strong> | Sheet: <strong className="text-slate-800">{selectedSheet}</strong>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="btn-secondary !text-xs !py-2"
                >
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleValidateAndConfirm}
                  disabled={!isNameMapped || !isContactMapped}
                  className="btn-primary !text-xs !py-2 !px-5 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Mappings &amp; Preview Confirmation</span>
                </button>
              </div>
            </div>

            {/* Phase 2 Success Modal / Confirmation Card */}
            {validationSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-sm text-emerald-900">
                    Phase 2 Verification Complete: File, Multi-Sheet Tabs &amp; Column Mappings Validated
                  </span>
                </div>
                <p className="text-emerald-800">
                  All {previewData.totalRows} source application rows in sheet &quot;{selectedSheet}&quot; are verified and aligned with the canonical schema. Essential candidate identity and contact fields are properly mapped with active safeguards.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] font-medium text-emerald-800">
                  <span>• Target Workspace: <strong>{activeCompany}</strong></span>
                  <span>• Processing Date: <strong>{processingDate}</strong></span>
                  <span>• Mapped Columns: <strong>{mappedCount}</strong></span>
                  <span>• Gender Mode: <strong>{genderMode}</strong></span>
                  <span>• Job Requisition: <strong>{selectedJobSlot}</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualUploadWorkspaceView;
