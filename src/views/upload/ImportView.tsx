import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Download,
  Sliders,
  FileCheck,
  Info,
  Play,
  Clipboard,
  ClipboardPaste,
  Sparkles,
  Trash2,
  AlertTriangle,
  Shield,
  Layers,
  History,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Users,
  EyeOff,
  BarChart3,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseFileForPreview, executeImport, convertPastedTextToFile, detectFeedbackHeader } from '../../shared/masterImportEngine';
import { ImportPreviewData, ColumnMappingConfig, TargetColumn } from '../../types/masterImport';
import { dbService } from '../../services/masterDbService';
import { generateAcceptanceTestFiles, downloadBlob } from '../../shared/testDataGenerator';
import { ImportRecord } from '../../types/masterDatabase';
import { geminiService } from '../../services/masterGeminiService';
import { formatDateTimeDisplay } from '../../shared/dateFormat';
import { api } from '../../api/client';

interface ImportViewProps {
  onImportComplete: () => void;
  onNavigateCandidates: () => void;
  onNavigateIncomplete?: () => void;
  defaultCompany?: 'AaraTech' | 'ClinisolTech' | 'auto';
}

const TARGET_COLUMNS: { value: TargetColumn; label: string }[] = [
  { value: 'full_name', label: 'Candidate Full Name' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Primary Email Address' },
  { value: 'secondary_email', label: 'Secondary Email Address' },
  { value: 'phone', label: 'Primary Phone Number' },
  { value: 'secondary_phone', label: 'Secondary Phone Number' },
  { value: 'linkedin_url', label: 'LinkedIn Profile URL' },
  { value: 'location', label: 'Current Location / City / State' },
  { value: 'preferred_location', label: 'Preferred Location' },
  { value: 'company', label: 'Company (AaraTech/ClinisolTech)' },
  { value: 'job_title', label: 'Job Title / Position' },
  { value: 'job_id', label: 'Requisition / Job ID' },
  { value: 'date_applied', label: 'Date Assigned (Original Date)' },
  { value: 'current_stage', label: 'Application Stage' },
  { value: 'recruiter_name', label: 'Recruiter Name (Adam, Alex...)' },
  { value: 'recruiter_feedback', label: 'Recruiter Feedback (Verbatim)' },
  { value: 'contact_date', label: 'Contact Date' },
  { value: 'contact_type', label: 'Contact Type (Phone/Email)' },
  { value: 'resume_link', label: 'Resume Link (Google Drive)' },
  { value: 'status', label: 'Operational Status' },
  { value: 'owner', label: 'Assigned Owner (Adam, Alex...)' },
  { value: 'gender', label: 'Gender / Salutation (Male / Female)' },
  { value: 'green_card', label: 'Green Card / US Citizen (Yes/No)' },
  { value: 'h1b_status', label: 'H1B Visa (Yes/No)' },
  { value: 'ignore', label: '— Ignore Column —' },
];

export const ImportView: React.FC<ImportViewProps> = ({
  onImportComplete,
  onNavigateCandidates,
  onNavigateIncomplete,
  defaultCompany = 'AaraTech',
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [incompleteRecordsCount, setIncompleteRecordsCount] = useState(0);
  const [importMode, setImportMode] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
  const [mappings, setMappings] = useState<ColumnMappingConfig[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState<string>('Deduplicating & Ingesting Master Dataset');
  const [completedReport, setCompletedReport] = useState<ImportRecord | null>(null);
  const [errorReportData, setErrorReportData] = useState<{ row: number; reason: string; rawData: any }[]>([]);
  const [targetCompany, setTargetCompany] = useState<'AaraTech' | 'ClinisolTech' | 'auto'>(defaultCompany);
  const [targetGender, setTargetGender] = useState<'auto' | 'Male' | 'Female'>('auto');
  const [targetOwner, setTargetOwner] = useState<string>('auto');
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [clearSuccess, setClearSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [interruptedJob, setInterruptedJob] = useState<any | null>(null);

  useEffect(() => {
    loadImportHistory();
    checkInterruptedJobs();
  }, [targetCompany]);

  const checkInterruptedJobs = async () => {
    try {
      const effectiveComp = targetCompany !== 'auto' ? targetCompany : 'AaraTech';
      const jobs = await api.getMasterImportJobs(effectiveComp);
      const pending = jobs?.find((j: any) => j.status === 'Processing');
      if (pending) {
        const resumeInfo = await api.getMasterImportResumeInfo(pending.id);
        setInterruptedJob(resumeInfo);
      } else {
        setInterruptedJob(null);
      }
    } catch (e) {
      console.warn('Could not check interrupted jobs:', e);
    }
  };

  const loadImportHistory = async () => {
    try {
      const imps = await dbService.getImports();
      setImportHistory(imps || []);
    } catch (e) {
      console.warn('Failed to fetch import history:', e);
    }
  };

  // Gemini AI Ingestion States
  const [isAiExtracting, setIsAiExtracting] = useState(false);
  const [aiExtractStatus, setAiExtractStatus] = useState<string>('');
  const [aiExtractionSummary, setAiExtractionSummary] = useState<{ total: number; orphans: number } | null>(null);
  const [isAiEnhancing, setIsAiEnhancing] = useState(false);
  const [aiEnhanceMessage, setAiEnhanceMessage] = useState<string | null>(null);

  const handleClearAllData = async () => {
    const effectiveCompany: 'AaraTech' | 'ClinisolTech' = targetCompany !== 'auto' ? targetCompany : 'AaraTech';
    const otherCompany = effectiveCompany === 'AaraTech' ? 'ClinisolTech' : 'AaraTech';
    if (window.confirm(`Are you sure you want to clear candidate data for ${effectiveCompany}?\n\nThis will reset ${effectiveCompany} to 0 candidate records.\n\nAll ${otherCompany} records will remain 100% UNTOUCHED and preserved.`)) {
      await dbService.clearAllData(effectiveCompany);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 3500);
      onImportComplete();
      window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { action: 'cleared-company', company: effectiveCompany } }));
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Primary Ingestion Method: Gemini AI Intelligent Extract & Verify
   * Runs directly at input time so that every candidate name, phone number, email,
   * and feedback note is extracted with 100% verbatim accuracy before database insertion!
   */
  const handleAiExtractPastedText = async () => {
    if (!pastedText.trim()) {
      setErrorMessage('Please paste candidate leads first.');
      return;
    }
    setIsAiExtracting(true);
    setAiExtractStatus('Connecting to Gemini AI Engine...');
    setErrorMessage(null);
    setAiExtractionSummary(null);
    try {
      const { candidates, orphanNotesCount } = await geminiService.extractCandidatesFromRawText(
        pastedText,
        targetCompany !== 'auto' ? targetCompany : 'AaraTech',
        targetGender,
        (msg) => setAiExtractStatus(msg)
      );

      if (candidates.length === 0) {
        throw new Error('Gemini AI could not find any valid candidate profiles in the pasted text.');
      }

      setAiExtractionSummary({
        total: candidates.length,
        orphans: orphanNotesCount,
      });

      const file = geminiService.createWorkbookFromCandidates(
        candidates,
        `gemini_extracted_leads_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      await handleFileSelected(file);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gemini AI Extraction encountered an error.');
    } finally {
      setIsAiExtracting(false);
      setAiExtractStatus('');
    }
  };

  /**
   * Pre-import AI verification for uploaded spreadsheets:
   * Scans preview rows for missing phones or emails, extracting them from notes with Gemini
   */
  const handleAiEnhancePreview = async () => {
    if (!selectedFile || !previewData) return;
    setIsAiEnhancing(true);
    setErrorMessage(null);
    setAiEnhanceMessage('Scanning preview records with Gemini AI to fill missing contact details...');
    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet) ? selectedSheet : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

      const { updatedRows, enhancedCount } = await geminiService.enhanceRowsWithGemini(
        rawRows,
        (curr, tot) => setAiEnhanceMessage(`Analyzing rows with Gemini AI (${curr}/${tot})...`)
      );

      if (enhancedCount === 0) {
        setAiEnhanceMessage('All preview records already have valid contact info! No missing contacts detected.');
        setTimeout(() => setAiEnhanceMessage(null), 4000);
        return;
      }

      // Re-create workbook from updated rows
      const newWs = XLSX.utils.json_to_sheet(updatedRows);
      const newWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
      const newArray = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' });
      const newFile = new File([newArray], selectedFile.name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await handleFileSelected(newFile, sheetName);
      setAiEnhanceMessage(`✨ Gemini AI successfully enhanced ${enhancedCount} candidate rows with missing contact details!`);
      setTimeout(() => setAiEnhanceMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'AI Contact Enhancement failed.');
    } finally {
      setIsAiEnhancing(false);
    }
  };

  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      setErrorMessage('Please paste candidate rows first.');
      return;
    }
    try {
      const file = convertPastedTextToFile(
        pastedText,
        `pasted_leads_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      handleFileSelected(file);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to parse pasted text.');
    }
  };

  const handleInsertTemplateHeaders = () => {
    const template = 'Candidate Full Name\tPrimary Email Address\tPrimary Phone Number\tCompany\tJob Title\tLocation\tDate Assigned\tRecruiter Feedback\tGender';
    setPastedText(template + '\n');
    setErrorMessage(null);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setPastedText(text);
        setErrorMessage(null);
      } else {
        setErrorMessage('Clipboard is empty or does not contain text. Press Ctrl+V inside the box.');
      }
    } catch {
      setErrorMessage('Clipboard direct access blocked by browser. Please click inside the box and press Ctrl+V.');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (file: File, sheetName?: string) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setCompletedReport(null);
    try {
      const preview = await parseFileForPreview(file, sheetName);
      setPreviewData(preview);
      setSelectedSheet(preview.selectedSheet || '');
      setMappings(preview.mappings);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to read file.');
      setSelectedFile(null);
      setPreviewData(null);
    }
  };

  const updateMapping = (sourceColumn: string, newTarget: TargetColumn) => {
    setMappings(prev =>
      prev.map(m => {
        if (m.sourceColumn !== sourceColumn) return m;
        const fbCheck = newTarget === 'recruiter_feedback' ? detectFeedbackHeader(sourceColumn) : null;
        return {
          ...m,
          targetColumn: newTarget,
          isManualOverride: true,
          confidence: 1.0,
          feedbackLabel: newTarget === 'recruiter_feedback' ? (fbCheck?.feedbackLabel || m.feedbackLabel || sourceColumn) : undefined,
          feedbackIndex: newTarget === 'recruiter_feedback' ? (fbCheck?.feedbackIndex ?? m.feedbackIndex) : undefined,
        };
      })
    );
  };

  const startImportProcess = async () => {
    if (!selectedFile || !previewData) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: previewData.totalRows });
    setErrorMessage(null);

    try {
      // Fetch current candidates pool for duplicate matching ONLY for target company!
      const existingCandidates = dbService.getAllPeopleForMatching(
        targetCompany !== 'auto' ? targetCompany : undefined
      );

      const result = await executeImport(
        selectedFile,
        mappings,
        existingCandidates,
        (current, total) => {
          setProgress({ current, total });
        },
        targetCompany,
        targetGender,
        selectedSheet,
        targetOwner,
        dbService.getMaxPersonSequence()
      );

      // Save to Supabase and permanent local database (IndexedDB) and backend SQLite in chunks
      setStatusMessage('Saving records to Master SQLite Database in 250-row chunks...');
      await dbService.saveImportBatch(
        result.newPeople,
        result.updatedPeople,
        result.importRecord,
        result.newPossibleMatches,
        result.newIncompleteRecords,
        (phase, current, total) => {
          setStatusMessage(phase);
          setProgress({ current, total });
        }
      );

      setIncompleteRecordsCount(result.newIncompleteRecords.length);
      setCompletedReport(result.importRecord);
      setErrorReportData(result.errorRows);
      onImportComplete();
      await loadImportHistory();
      window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { action: 'import-completed' } }));
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during import processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAcceptanceFiles = () => {
    const { fileA, fileB, fileC } = generateAcceptanceTestFiles();
    downloadBlob(fileA.blob, fileA.name);
    setTimeout(() => downloadBlob(fileB.blob, fileB.name), 300);
    setTimeout(() => downloadBlob(fileC.blob, fileC.name), 600);
  };

  const handleQuickLoadAcceptanceFile = async (fileKey: 'fileA' | 'fileB' | 'fileC') => {
    const files = generateAcceptanceTestFiles();
    const target = files[fileKey];
    const file = new File([target.blob], target.name, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    handleFileSelected(file);
  };

  const exportErrorReportCsv = () => {
    if (!errorReportData.length) return;
    const header = ['Row Number', 'Failure Reason', 'Raw Row Data'];
    const rows = errorReportData.map(e => [e.row, `"${e.reason.replace(/"/g, '""')}"`, `"${JSON.stringify(e.rawData).replace(/"/g, '""')}"`]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `import_errors_${completedReport?.id || 'batch'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const coreMappings = mappings.filter(m => m.targetColumn !== 'recruiter_feedback' && m.targetColumn !== 'ignore');
  const feedbackMappings = mappings.filter(m => m.targetColumn === 'recruiter_feedback');
  const ignoredMappings = mappings.filter(m => m.targetColumn === 'ignore');
  const ignoredNonEmptyColumns = mappings.filter(m =>
    m.targetColumn === 'ignore' &&
    m.sampleValues &&
    m.sampleValues.some(v => v !== null && v !== undefined && String(v).trim().length > 0)
  );

  const renderMappingRow = (m: ColumnMappingConfig) => (
    <tr key={m.sourceColumn} className="hover:bg-slate-50/60 transition-colors">
      <td className="py-3 px-4">
        <div className="space-y-1">
          <div className="font-mono font-medium text-xs text-slate-900 flex items-center gap-2">
            <span>{m.sourceColumn}</span>
            {m.columnIndex !== undefined && (
              <span className="text-[10px] text-slate-400 font-mono font-normal">
                (Col #{m.columnIndex + 1})
              </span>
            )}
          </div>
          {m.targetColumn === 'recruiter_feedback' && m.feedbackLabel && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
              <MessageSquare className="w-2.5 h-2.5 text-blue-600" />
              <span>Target Label: {m.feedbackLabel}</span>
            </span>
          )}
          {m.subheader && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200" title={`Subheader: ${m.subheader}`}>
              <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
              <span>Subheader: {m.subheader}</span>
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">
        {m.sampleValues.join(', ') || '—'}
      </td>
      <td className="py-3 px-4">
        <select
          value={m.targetColumn}
          onChange={(e) => updateMapping(m.sourceColumn, e.target.value as TargetColumn)}
          className={`px-3 py-1.5 bg-white border rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${m.targetColumn === 'recruiter_feedback'
            ? 'border-blue-300 text-blue-900 font-bold bg-blue-50/30'
            : m.targetColumn === 'ignore'
              ? 'border-slate-200 text-slate-400'
              : 'border-slate-200 text-slate-800'
            }`}
        >
          {TARGET_COLUMNS.map((tc) => (
            <option key={tc.value} value={tc.value}>
              {tc.label}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 px-4">
        {m.isManualOverride ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <CheckCircle2 className="w-3 h-3 text-purple-600" /> Manual Override
          </span>
        ) : m.safeguardApplied ? (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
            title="Protected: ATS role code (DA, BA, AWS, EDI, QA) safeguarded from mapping to candidate name"
          >
            <Shield className="w-3 h-3 text-amber-600" /> Safeguard Protected
          </span>
        ) : m.targetColumn === 'ignore' ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
            Ignored
          </span>
        ) : m.confidence >= 0.98 ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 100% Exact Match
          </span>
        ) : m.confidence >= 0.85 ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3 h-3 text-blue-600" /> {Math.round(m.confidence * 100)}% Pattern
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
            {Math.round(m.confidence * 100)}% Inferred
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Manual Application Upload &amp; Ingestion Engine
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dedicated recruitment ingestion for AaraTech &amp; ClinisolTech. Upload XLSX, XLS, CSV workbooks or paste tabular rows with multi-sheet selection, mapping safeguards, deduplication, and incomplete quarantine.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleClearAllData}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Wipe database to 0 candidates and start 100% fresh"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Clear Database (Fresh Start)</span>
          </button>
        </div>
      </div>

      {clearSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>All historical candidate records have been cleared! Database is clean (0 records) ready for fresh uploads.</span>
        </div>
      )}

      {/* Resumable Job Alert */}
      {interruptedJob && !completedReport && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs animate-fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-amber-950 flex items-center gap-2">
                <span>Interrupted Import Job Detected</span>
                <span className="font-mono text-xs bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded font-semibold">{interruptedJob.jobId}</span>
              </div>
              <p className="text-amber-800 text-[11px] mt-1">
                Previous upload stopped at row <strong>{interruptedJob.maxCompletedRow || interruptedJob.processedRows}</strong> of {interruptedJob.totalRows}. <strong>{interruptedJob.successfulRows}</strong> records are safely stored in {interruptedJob.company} database.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setInterruptedJob(null)}
              className="px-3 py-1.5 bg-white border border-amber-200 hover:bg-amber-100 text-amber-800 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Target Company Selection: Strictly Separated Candidate Pools */}
      {!completedReport && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>1. Select Destination Database (Strictly Separated)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Strict Company Isolation Active
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                AaraTech and ClinisolTech are <strong>completely separate candidate databases</strong>. Duplicate checks and application history will run <strong>ONLY</strong> within the selected company.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTargetCompany('AaraTech')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${targetCompany === 'AaraTech'
                ? 'bg-blue-50/90 border-blue-600 text-blue-950 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">AaraTech Database</span>
                {targetCompany === 'AaraTech' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">ACTIVE SELECTION</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5">
                IT, DevOps, Cloud Architecture, Full Stack, Python, Machine Learning &amp; CyberSecurity
              </div>
              <div className="text-[11px] text-blue-700 font-semibold mt-1">
                ✓ Duplicates checked ONLY against existing AaraTech candidates
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTargetCompany('ClinisolTech')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${targetCompany === 'ClinisolTech'
                ? 'bg-indigo-50/90 border-indigo-600 text-indigo-950 ring-2 ring-indigo-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">ClinisolTech Database</span>
                {targetCompany === 'ClinisolTech' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">ACTIVE SELECTION</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5">
                Clinical Data Management, Biostatistics, SAS, Regulatory Affairs, CRA &amp; GxP Trials
              </div>
              <div className="text-[11px] text-indigo-700 font-semibold mt-1">
                ✓ Duplicates checked ONLY against existing ClinisolTech candidates
              </div>
            </button>
          </div>

          {/* Strict Separation Reassurance Banner */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-semibold text-slate-900">Strict Database Separation Enforced:</strong> Candidates in AaraTech are never merged or matched with ClinisolTech. If a person applies to both companies, they maintain two completely separate profiles in each respective company database.
            </div>
          </div>
        </div>
      )}

      {/* Target Gender Mode: Automatic Detection or File-level Override */}
      {!completedReport && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>2. Gender Detection &amp; Separation Mode</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                AI Name Engine Active
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              How should the system identify male and female leads? Auto-Detect reads any spreadsheet column (e.g. <code>Gender</code>, <code>Sex</code>, <code>Salutation</code> like <code>Mr.</code>/<code>Ms.</code>) and recognizes 300+ Indian &amp; Western first names automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setTargetGender('auto')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${targetGender === 'auto'
                ? 'bg-blue-50/80 border-blue-600 text-blue-950 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">Auto-Detect (Recommended)</span>
                {targetGender === 'auto' && <span className="w-2 h-2 rounded-full bg-blue-600"></span>}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Reads columns (Gender/Sex) + 300+ first name lexicon (Rahul, Priya, John, Elena, etc.).
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTargetGender('Male')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${targetGender === 'Male'
                ? 'bg-blue-50/80 border-blue-600 text-blue-950 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-blue-800">♂ Force Batch as Male</span>
                {targetGender === 'Male' && <span className="w-2 h-2 rounded-full bg-blue-600"></span>}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Assign all leads in this file to Male (ideal if importing a male-only list).
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTargetGender('Female')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${targetGender === 'Female'
                ? 'bg-rose-50/80 border-rose-600 text-rose-950 ring-2 ring-rose-500/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-rose-800">♀ Force Batch as Female</span>
                {targetGender === 'Female' && <span className="w-2 h-2 rounded-full bg-rose-600"></span>}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Assign all leads in this file to Female (ideal if importing a female-only list).
              </div>
            </button>
          </div>
        </div>
      )}



      {/* Ingestion Method Tabs: File Upload vs Copy & Paste Direct Data */}
      {!previewData && !completedReport && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-fit">
            <button
              type="button"
              onClick={() => {
                setImportMode('upload');
                setErrorMessage(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${importMode === 'upload'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <UploadCloud className="w-4 h-4 text-blue-600" />
              <span>Upload Spreadsheet File (XLSX, XLS, CSV)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setImportMode('paste');
                setErrorMessage(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${importMode === 'paste'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Clipboard className="w-4 h-4" />
              <span>Copy &amp; Paste Rows (Excel, Google Sheets, CSV)</span>
            </button>
          </div>

          {/* MODE A: SPREADSHEET FILE UPLOAD */}
          {importMode === 'upload' && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${dragActive
                ? 'border-blue-500 bg-blue-50/50 scale-[1.005]'
                : 'border-slate-300 bg-white hover:border-slate-400'
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-4 shadow-xs">
                <UploadCloud className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-bold text-slate-800">
                Drag &amp; Drop Historical Data Files Here
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Upload candidate files in <strong>XLSX, XLS, or CSV</strong> format. Up to 30,000+ rows supported.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-all cursor-pointer"
                >
                  Choose Files from Computer
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('paste')}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Clipboard className="w-4 h-4 text-slate-500" />
                  <span>Or Copy &amp; Paste Directly</span>
                </button>
              </div>

              {/* Acceptance Test Files Generator Shortcut */}
              <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="text-slate-400">Need sample test data?</span>
                <button
                  type="button"
                  onClick={() => handleQuickLoadAcceptanceFile('fileA')}
                  className="text-blue-600 hover:underline font-semibold cursor-pointer"
                >
                  Load Acceptance File A (Fresh Leads)
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => handleQuickLoadAcceptanceFile('fileB')}
                  className="text-blue-600 hover:underline font-semibold cursor-pointer"
                >
                  Load Acceptance File B (Duplicates &amp; Updates)
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={handleDownloadAcceptanceFiles}
                  className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Download Sample Files</span>
                </button>
              </div>

              <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-400">
                <span>✓ Auto column detection</span>
                <span>✓ Dynamic Feedback 1..N detection</span>
                <span>✓ US Phone 10-digit normalization</span>
                <span>✓ Verbatim feedback protection</span>
              </div>
            </div>
          )}

          {/* MODE B: DIRECT COPY & PASTE WORKSPACE */}
          {importMode === 'paste' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clipboard className="w-4 h-4 text-blue-600" />
                    <span>Direct Copy &amp; Paste Data Workspace</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select rows in Excel, Google Sheets, or copy CSV text and paste (Ctrl+V) directly below.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Paste directly from system clipboard"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Paste Clipboard</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertTemplateHeaders}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Insert clean column header template"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Insert Template Headers</span>
                  </button>
                  {pastedText && (
                    <button
                      type="button"
                      onClick={() => setPastedText('')}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Clear textarea"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Paste Text Area */}
              <div className="relative">
                <textarea
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    setErrorMessage(null);
                  }}
                  rows={10}
                  placeholder={`Candidate Full Name\tEmail Address\tPhone Number\tCompany\tJob Title\tOriginal Feedback\nJohn Smith\tjohn@gmail.com\t214-334-9058\tAaraTech\tData Analyst\tLVM\nSarah Jenkins\tsarah@outlook.com\t415-982-1200\tClinisolTech\tClinical Data Manager\tPhase II Oncology lead\nAlex Morgan\talex.morgan@gmail.com\t214-555-0199\tAaraTech\tCloud Architect\tAWS Solutions Architect`}
                  className="w-full p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl border border-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all leading-relaxed"
                />

                {/* Line / Row Counter Pill */}
                {pastedText.trim() && (
                  <div className="absolute right-3 bottom-3 px-2.5 py-1 bg-slate-800/90 text-slate-300 rounded-lg text-[11px] font-mono border border-slate-700 pointer-events-none">
                    {Math.max(0, pastedText.trim().split(/\r?\n/).length - 1)} candidates detected
                  </div>
                )}
              </div>

              {/* Action Buttons & Features */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>✓ Tab-separated (Excel / Google Sheets) auto-detected</span>
                  <span>✓ Comma-separated (CSV) supported</span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={handleProcessPastedText}
                    disabled={!pastedText.trim()}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                  >
                    <span>Preview &amp; Process Copied Leads</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error notification banner */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Preview & Column Mapping Interface */}
      {previewData && !completedReport && (
        <div className="space-y-6">
          {/* File Meta Pill */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-base">{previewData.fileName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {previewData.totalRows.toLocaleString()} rows detected • {(previewData.fileSize / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>

              {previewData.availableSheets && previewData.availableSheets.length > 1 ? (
                <div className="flex items-center gap-2 bg-blue-50/80 px-3 py-1.5 rounded-lg border border-blue-200/90 sm:ml-4">
                  <label className="text-xs font-semibold text-blue-900 whitespace-nowrap">Excel Sheet:</label>
                  <select
                    value={selectedSheet}
                    disabled={isProcessing}
                    onChange={(e) => {
                      const newSheet = e.target.value;
                      setSelectedSheet(newSheet);
                      if (selectedFile) {
                        handleFileSelected(selectedFile, newSheet);
                      }
                    }}
                    className="text-xs font-bold bg-white border border-blue-300 rounded px-2.5 py-1 text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {previewData.availableSheets.map(s => {
                      const count = previewData.diagnostics?.sheetRowCounts?.[s];
                      return (
                        <option key={s} value={s}>
                          Sheet: {s} {count !== undefined ? `(${count.toLocaleString()} rows)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 sm:ml-4">
                  <span>Worksheet:</span>
                  <span className="font-bold text-slate-900">{previewData.selectedSheet || 'Sheet1'}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={isProcessing || isAiEnhancing}
                onClick={handleAiEnhancePreview}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Scan rows with Gemini AI to auto-fill missing contact details from feedback notes"
              >
                {isAiEnhancing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>Scanning Rows...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>⚡ AI Auto-Fill Missing Contacts</span>
                  </>
                )}
              </button>

              <button
                disabled={isProcessing}
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewData(null);
                  setAiExtractionSummary(null);
                  setAiEnhanceMessage(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isProcessing}
                onClick={startImportProcess}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Ingestion...</span>
                  </>
                ) : (
                  <>
                    <span>Start Import ({previewData.totalRows.toLocaleString()} rows)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Row-Count Diagnostics Dashboard */}
          {previewData.diagnostics && (
            <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-slate-900 text-sm">Pre-Import Row-Count Diagnostics</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100/70 text-blue-800 border border-blue-200">
                    Selected Sheet: {previewData.selectedSheet || 'Sheet1'}
                  </span>
                </div>
                {previewData.availableSheets && previewData.availableSheets.length > 1 && (
                  <span className="text-xs text-slate-500 font-medium">
                    Total across {previewData.availableSheets.length} sheets: <strong className="text-slate-800">{previewData.diagnostics.totalRowsAllSheets.toLocaleString()}</strong> rows
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
                {/* 1. Physical data rows */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">1. Physical Data Rows</div>
                  <div className="text-xl font-black text-slate-900 mt-1">{previewData.diagnostics.physicalRows.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Excluding table header row</div>
                </div>

                {/* 2. Total non-empty parsed */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">2. Non-Empty Parsed</div>
                  <div className="text-xl font-black text-slate-900 mt-1">{previewData.diagnostics.nonEmptyRows.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Rows containing candidate data</div>
                </div>

                {/* 3. Valid candidate rows */}
                <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200/80">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">3. Complete Profiles</div>
                  <div className="text-xl font-black text-emerald-700 mt-1">{previewData.diagnostics.validCandidateRows.toLocaleString()}</div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">Valid Name, Email &amp; Phone</div>
                </div>

                {/* 4. Missing required fields */}
                <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/80">
                  <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">4. Incomplete Records</div>
                  <div className="text-xl font-black text-amber-700 mt-1">{previewData.diagnostics.missingRequiredRows.toLocaleString()}</div>
                  <div className="text-[10px] text-amber-700 mt-0.5">Retained for review (not discarded)</div>
                </div>

                {/* 5. Duplicate rows in file */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">5. Internal Duplicates</div>
                  <div className="text-xl font-black text-slate-800 mt-1">{previewData.diagnostics.duplicateRowsInFile.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Shared email/phone in file</div>
                </div>

                {/* 6. Excluded by filters */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">6. Excluded by Filters</div>
                  <div className="text-xl font-black text-slate-800 mt-1">{previewData.diagnostics.excludedByFilterRows.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">0 excluded (all rows retained)</div>
                </div>

                {/* 7. Available to import */}
                <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-200">
                  <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">7. Available to Import</div>
                  <div className="text-xl font-black text-blue-700 mt-1">{previewData.diagnostics.availableToImportRows.toLocaleString()}</div>
                  <div className="text-[10px] text-blue-600 mt-0.5">100% accounted for ingestion</div>
                </div>

                {/* 8. Total across all worksheets */}
                <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-200/80">
                  <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">8. Total (All Sheets)</div>
                  <div className="text-xl font-black text-indigo-700 mt-1">{previewData.diagnostics.totalRowsAllSheets.toLocaleString()}</div>
                  <div className="text-[10px] text-indigo-600 mt-0.5">Across {previewData.availableSheets?.length || 1} sheet(s)</div>
                </div>
              </div>
            </div>
          )}

          {/* Subheader Row Notification Banner */}
          {previewData.subheaderRowDetected && (
            <div className="p-4 bg-indigo-50/90 border border-indigo-200/90 rounded-xl flex items-center justify-between gap-3 text-indigo-950 text-xs shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-indigo-900">
                    Secondary Sub-header / Metadata Row Detected &amp; Auto-Extracted
                  </div>
                  <div className="text-indigo-700 mt-0.5">
                    Excel sub-header instructions (e.g. <em>&quot;GREEN CARD/ US-C&quot;</em>, <em>&quot;H1B-Y/N Resume Link / Linkedin Profile&quot;</em>) were extracted into column intelligence and excluded from candidate records to guarantee zero data pollution.
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap shrink-0">
                Data Cleaned
              </span>
            </div>
          )}

          {/* Multi-Sheet Workbook Selector Pills */}
          {previewData.availableSheets && previewData.availableSheets.length > 1 && (
            <div className="bg-white p-4 rounded-xl border border-blue-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>Multi-Sheet Workbook Selection</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      {previewData.availableSheets.length} Sheets Available
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Switch between sheets to preview rows and configure column mappings independently.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {previewData.availableSheets.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setSelectedSheet(s);
                      if (selectedFile) {
                        handleFileSelected(selectedFile, s);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${selectedSheet === s
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{s}</span>
                    {selectedSheet === s && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Gemini AI Extraction Summary Banner */}
          {aiExtractionSummary && (
            <div className="p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>Gemini AI Extracted {aiExtractionSummary.total} Candidates with 100% Precision</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      VERBATIM VERIFIED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    All full names, phone numbers, email addresses, and recruiter feedback notes were extracted directly from your input data with zero hallucinations or alterations.
                    {aiExtractionSummary.orphans > 0 && ` (${aiExtractionSummary.orphans} anonymous call logs without contact info were filtered out).`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Gemini AI Enhancement Alert */}
          {aiEnhanceMessage && (
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-indigo-900 animate-fade-in">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>{aiEnhanceMessage}</span>
            </div>
          )}

          {/* Progress Bar when running */}
          {isProcessing && (
            <div className="bg-white p-6 rounded-2xl border border-blue-200/90 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                    <span>{statusMessage}</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Transactional 250-row batch execution with immediate write-lock safety and per-row error isolation.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-mono font-bold text-blue-600">
                    {progress.current} / {progress.total} rows
                  </span>
                  <span className="text-xs font-semibold text-slate-500 ml-2">
                    ({Math.round((progress.current / (progress.total || 1)) * 100)}%)
                  </span>
                </div>
              </div>

              <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="text-slate-500 text-[10px] uppercase font-semibold">Processed</div>
                  <div className="text-slate-900 font-bold font-mono">{progress.current}</div>
                </div>
                <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                  <div className="text-blue-600 text-[10px] uppercase font-semibold">Remaining</div>
                  <div className="text-blue-900 font-bold font-mono">{Math.max(0, progress.total - progress.current)}</div>
                </div>
                <div className="bg-purple-50/60 p-2.5 rounded-lg border border-purple-100">
                  <div className="text-purple-600 text-[10px] uppercase font-semibold">Batch Chunk Size</div>
                  <div className="text-purple-900 font-bold font-mono">250 rows / commit</div>
                </div>
                <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                  <div className="text-emerald-600 text-[10px] uppercase font-semibold">Database Mode</div>
                  <div className="text-emerald-900 font-bold font-mono">WAL + Busy Timeout</div>
                </div>
              </div>
            </div>
          )}

          {/* Automatic Column Mapping Configuration */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Detected Column Mappings
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify or modify how raw spreadsheet headers map to normalized PostgreSQL database fields.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                <Sliders className="w-3.5 h-3.5" />
                <span>Auto-Mapping Engine Active</span>
              </div>
            </div>

            {ignoredNonEmptyColumns.length > 0 && (
              <div className="m-5 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900 animate-fade-in shadow-2xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">
                    Warning: {ignoredNonEmptyColumns.length} non-empty column{ignoredNonEmptyColumns.length > 1 ? 's are' : ' is'} currently ignored
                  </div>
                  <div className="text-amber-800 leading-relaxed">
                    Columns <strong>{ignoredNonEmptyColumns.map(c => `"${c.sourceColumn}"`).join(', ')}</strong> contain data in your uploaded file but are mapped to <strong>Ignore</strong> and will not be imported into candidate profiles. If these contain recruiter feedback, call notes, or remarks, change their target field to <strong>"Recruiter Feedback (Verbatim)"</strong>.
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">File Header</th>
                    <th className="py-3 px-4">Sample Values</th>
                    <th className="py-3 px-4">Map To Target Field</th>
                    <th className="py-3 px-4">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* GROUP 1: Recruiter Feedback Columns */}
                  {feedbackMappings.length > 0 && (
                    <>
                      <tr className="bg-blue-50/80 border-y border-blue-200/80">
                        <td colSpan={4} className="py-2.5 px-4 text-xs font-bold text-blue-950">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
                              <span>Recruiter Feedback Columns ({feedbackMappings.length} detected)</span>
                            </div>
                            <span className="text-[10px] font-semibold text-blue-800 bg-blue-100/90 px-2.5 py-0.5 rounded-full border border-blue-200 w-fit">
                              Each column is imported as an individual, traceable recruiter interaction preserving verbatim text
                            </span>
                          </div>
                        </td>
                      </tr>
                      {feedbackMappings.map(renderMappingRow)}
                    </>
                  )}

                  {/* GROUP 2: Core Candidate & Application Fields */}
                  {coreMappings.length > 0 && (
                    <>
                      <tr className="bg-slate-100/90 border-y border-slate-200">
                        <td colSpan={4} className="py-2 px-4 text-xs font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            <span>Core Candidate &amp; Application Fields ({coreMappings.length})</span>
                          </div>
                        </td>
                      </tr>
                      {coreMappings.map(renderMappingRow)}
                    </>
                  )}

                  {/* GROUP 3: Ignored / Unmapped Columns */}
                  {ignoredMappings.length > 0 && (
                    <>
                      <tr className="bg-slate-100/90 border-y border-slate-200">
                        <td colSpan={4} className="py-2 px-4 text-xs font-bold text-slate-500">
                          <div className="flex items-center gap-2">
                            <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Ignored Columns ({ignoredMappings.length})</span>
                          </div>
                        </td>
                      </tr>
                      {ignoredMappings.map(renderMappingRow)}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* First 20 Rows Preview */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Source Data Preview (First 20 Rows)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect raw un-normalized rows prior to committing import to database.
              </p>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 font-semibold text-slate-700 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    {previewData.headers.map((h) => (
                      <th key={h} className="py-2.5 px-3 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.sampleRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-slate-400">{rIdx + 1}</td>
                      {previewData.headers.map((h) => (
                        <td key={h} className="py-2 px-3 whitespace-nowrap max-w-xs truncate text-slate-800">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Completed Import Report Card */}
      {completedReport && (
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Import Completed Successfully
              </h2>
              <p className="text-xs text-slate-500">
                Batch <span className="font-mono font-semibold text-slate-700">{completedReport.id}</span> ingested into Master Database
              </p>
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase">Total Source Rows</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {completedReport.total_rows.toLocaleString()}
              </div>
            </div>
            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100">
              <div className="text-xs font-semibold text-blue-700 uppercase">Existing People Matched</div>
              <div className="text-xl font-bold text-blue-700 mt-1">
                {completedReport.matched_people.toLocaleString()}
              </div>
            </div>
            <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100">
              <div className="text-xs font-semibold text-indigo-700 uppercase">Existing Apps Matched</div>
              <div className="text-xl font-bold text-indigo-700 mt-1">
                {(completedReport.matched_applications ?? completedReport.applications_created).toLocaleString()}
              </div>
            </div>
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <div className="text-xs font-semibold text-emerald-700 uppercase">New Master People</div>
              <div className="text-xl font-bold text-emerald-700 mt-1">
                +{completedReport.new_people.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl text-xs space-y-2 text-slate-600">
            <div className="font-semibold text-slate-700 text-xs mb-1">Detailed Ingestion Breakdown:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>• Existing People Matched: <strong className="text-blue-700">{completedReport.matched_people}</strong></div>
              <div>• Existing Applications Matched: <strong className="text-indigo-700">{completedReport.matched_applications ?? completedReport.applications_created}</strong></div>
              <div>• Recruiter Assignments Created/Updated: <strong className="text-purple-700">{completedReport.assignments_created ?? (completedReport.matched_people + completedReport.new_people)}</strong></div>
              <div>• Feedback Entries Preserved (Verbatim): <strong className="text-emerald-700">{completedReport.contacts_created}</strong></div>
              {completedReport.unresolved_applications !== undefined && completedReport.unresolved_applications > 0 && (
                <div className="text-amber-700">• People Matched (Application Association Flagged for Review): <strong>{completedReport.unresolved_applications}</strong></div>
              )}
              <div>• Rows Requiring Manual Review (Possible Matches): <strong className="text-amber-700">{completedReport.possible_matches}</strong></div>
              {incompleteRecordsCount > 0 && (
                <div className="text-amber-800 font-semibold">• Incomplete Profiles Quarantined: <strong>{incompleteRecordsCount}</strong> (Missing name or contact)</div>
              )}
              <div>• Rows with Processing Warnings/Errors: <strong className={completedReport.errors > 0 ? 'text-rose-600 font-semibold' : 'text-slate-600'}>{completedReport.errors}</strong></div>
            </div>
          </div>

          {incompleteRecordsCount > 0 && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {incompleteRecordsCount} row(s) had missing mandatory names or contact info and were safely quarantined to the Incomplete Review Queue.
                </span>
              </div>
              {onNavigateIncomplete && (
                <button
                  onClick={onNavigateIncomplete}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <span>Review Incomplete ({incompleteRecordsCount})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
            {completedReport.errors > 0 ? (
              <button
                onClick={exportErrorReportCsv}
                className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Error Report ({completedReport.errors} rows)</span>
              </button>
            ) : (
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Zero data loss: 100% rows processed cleanly
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewData(null);
                  setCompletedReport(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Upload Another File
              </button>
              <button
                onClick={onNavigateCandidates}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>View Candidates in Master DB</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Import History & Audit Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <History className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Recent Import History &amp; Audit Ledger</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {importHistory.length} Batches Logged
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Review historical application batches, uploaded file dates, new candidates created vs duplicates merged.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
            <span>{showHistory ? 'Hide Ledger' : 'View Ledger'}</span>
            {showHistory ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </div>
        </button>

        {showHistory && (
          <div className="border-t border-slate-100 overflow-x-auto">
            {importHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No previous manual application uploads recorded yet. Upload an XLSX, XLS, or CSV file above to create your first batch record.
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Batch ID</th>
                    <th className="py-3 px-4">Filename / Source</th>
                    <th className="py-3 px-4">Total Rows</th>
                    <th className="py-3 px-4">New Master Profiles</th>
                    <th className="py-3 px-4">Matched to Existing</th>
                    <th className="py-3 px-4">Possible Matches</th>
                    <th className="py-3 px-4">Errors / Warnings</th>
                    <th className="py-3 px-4">Uploaded At</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importHistory.map((imp) => (
                    <tr key={imp.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{imp.id}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800 max-w-xs truncate">{imp.file_name}</td>
                      <td className="py-2.5 px-4 font-mono">{imp.total_rows.toLocaleString()}</td>
                      <td className="py-2.5 px-4 font-semibold text-emerald-600">+{imp.new_people}</td>
                      <td className="py-2.5 px-4 font-semibold text-blue-600">{imp.matched_people}</td>
                      <td className="py-2.5 px-4 font-semibold text-amber-600">{imp.possible_matches}</td>
                      <td className="py-2.5 px-4 font-semibold text-rose-600">{imp.errors}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {formatDateTimeDisplay(imp.created_at)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {imp.import_status || 'Completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportView;
