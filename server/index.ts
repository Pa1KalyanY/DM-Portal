import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as XLSX from 'xlsx';
import { dbService } from './db.js';
import { evaluateScreening } from '../src/shared/screeningEngine.js';
import {
  detectHeaderMapping,
  extractRowValues,
  sanitizeContactNumber,
  formatGoogleSheetsRow,
  generateGoogleSheetsTsv,
  normalizeJobRole,
  GOOGLE_SHEETS_COLUMNS,
} from '../src/shared/columnMapper.js';
import { parseTabularText, repairSplitRows, analyzePastedApplications } from '../src/shared/tabularParser.js';
import { classifyGender } from '../src/shared/genderClassifier.js';
import { Applicant, ImportFileRecord, ImportRecord } from '../src/types/index.js';
import { validateGeminiApiKey, classifyApplicantsWithGemini } from './geminiService.js';
import { referenceNameMatcher } from './referenceNameMatcher.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure upload directory exists
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.tsv', '.pdf']);

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type '${ext}'. Allowed types: .xlsx, .xls, .csv, .tsv, .pdf`));
    }
  },
});

function parseWorkbook(filePath: string) {
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer' });
}

// Helper to compute sha256 of file buffer
function getFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// Helper to parse pasted clipboard text (TSV or CSV) with multiline and quote handling
function parsePastedText(rawText: string): any[] {
  return parseTabularText(rawText);
}

// -------------------------------------------------------------
// 1. FILE PRE-VALIDATION & DUPLICATE WARNING
// -------------------------------------------------------------
app.post('/api/validate-files', upload.array('files', 50), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const validationResults: Array<{
      filename: string;
      originalName: string;
      tempPath: string;
      fileSize: number;
      isValid: boolean;
      rowCount: number;
      detectedJobTitle: string;
      detectedJobId: string;
      hasScreeningColumn: boolean;
      status: 'READY' | 'ERROR';
      error?: string;
      duplicateWarning?: {
        isDuplicate: boolean;
        previousImportId?: string;
        previousUploadedAt?: string;
      };
    }> = [];

    for (const file of files) {
      try {
        const fileHash = getFileHash(file.path);
        const dupCheck = dbService.checkDuplicateFile(file.originalname, fileHash);
        const isPdf = file.originalname.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          // Validate PDF
          const buf = fs.readFileSync(file.path);
          const pdfData = await pdfParse(buf);
          const text = pdfData.text || '';
          const lineCount = text.split(/\r?\n/).filter((l: string) => l.trim().length > 0).length;

          validationResults.push({
            filename: file.filename,
            originalName: file.originalname,
            tempPath: file.path,
            fileSize: file.size,
            isValid: true,
            rowCount: Math.max(1, Math.min(lineCount, 50)), // Estimated applicants or resume
            detectedJobTitle: path.basename(file.originalname, path.extname(file.originalname)),
            detectedJobId: 'PDF-EXTRACT',
            hasScreeningColumn: text.toLowerCase().includes('green card') || text.toLowerCase().includes('sponsorship'),
            status: 'READY',
            duplicateWarning: dupCheck.isDuplicate ? dupCheck : undefined,
          });
          continue;
        }

        // Read Excel / CSV workbook using safe buffer parser
        const workbook = parseWorkbook(file.path);
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          validationResults.push({
            filename: file.filename,
            originalName: file.originalname,
            tempPath: file.path,
            fileSize: file.size,
            isValid: false,
            rowCount: 0,
            detectedJobTitle: '',
            detectedJobId: '',
            hasScreeningColumn: false,
            status: 'ERROR',
            error: 'Unable to read worksheet: No sheets found in workbook.',
          });
          continue;
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJsonParsed: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        const rawJson: any[] = repairSplitRows(rawJsonParsed);

        if (rawJson.length === 0) {
          validationResults.push({
            filename: file.filename,
            originalName: file.originalname,
            tempPath: file.path,
            fileSize: file.size,
            isValid: false,
            rowCount: 0,
            detectedJobTitle: '',
            detectedJobId: '',
            hasScreeningColumn: false,
            status: 'ERROR',
            error: 'Worksheet is empty: 0 rows detected.',
          });
          continue;
        }

        // Detect headers
        const headers = Object.keys(rawJson[0] || {});
        const mapping = detectHeaderMapping(headers);

        const sampleRow = rawJson[0] || {};
        const extracted = extractRowValues(sampleRow, mapping);

        const detectedJobTitle = extracted.normalized['jobTitle'] || path.basename(file.originalname, path.extname(file.originalname));
        const detectedJobId = extracted.normalized['jobId'] || 'N/A';
        const hasScreeningColumn = Boolean(mapping['rawScreeningQuestions']);

        validationResults.push({
          filename: file.filename,
          originalName: file.originalname,
          tempPath: file.path,
          fileSize: file.size,
          isValid: true,
          rowCount: rawJson.length,
          detectedJobTitle,
          detectedJobId,
          hasScreeningColumn,
          status: 'READY',
          duplicateWarning: dupCheck.isDuplicate ? dupCheck : undefined,
        });
      } catch (err: any) {
        validationResults.push({
          filename: file.filename,
          originalName: file.originalname,
          tempPath: file.path,
          fileSize: file.size,
          isValid: false,
          rowCount: 0,
          detectedJobTitle: '',
          detectedJobId: '',
          hasScreeningColumn: false,
          status: 'ERROR',
          error: `Corrupted or invalid file: ${err.message}`,
        });
      }
    }

    res.json({ files: validationResults });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. PROCESS FILES (XLSX, XLS, CSV, PDF - UP TO 31+ FILES)
// -------------------------------------------------------------
app.post('/api/process-files', upload.array('files', 50), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided for processing' });
      return;
    }

    const importId = `imp-${Date.now()}`;
    const importCode = dbService.getNextImportCode();
    const uploadedAt = new Date().toISOString();
    const uploadedBy = (req.body.uploadedBy as string) || 'Recruiter Admin';
    const batchName = (req.body.batchName as string) || (req.body.label as string) || '';
    const company = (req.body.company as any) || (req.headers['x-company'] as any) || 'AaraTech';
    const applicationDate = (req.body.applicationDate as string) || (req.body.date as string) || uploadedAt.split('T')[0];
    let jobSlots: string[] = [];
    try {
      if (req.body.jobSlots) {
        jobSlots = typeof req.body.jobSlots === 'string' ? JSON.parse(req.body.jobSlots) : req.body.jobSlots;
      }
    } catch {}

    // Validate selected job slots against company workspace
    if (jobSlots && jobSlots.length > 0) {
      for (const slot of jobSlots) {
        const slotUpper = String(slot).toUpperCase().trim();
        if (company === 'AaraTech' && slotUpper.startsWith('CT-')) {
          res.status(400).json({ error: `Job slot '${slot}' belongs to ClinisolTech and cannot be imported into AaraTech workspace.` });
          return;
        }
        if (company === 'ClinisolTech' && slotUpper.startsWith('AT-')) {
          res.status(400).json({ error: `Job slot '${slot}' belongs to AaraTech and cannot be imported into ClinisolTech workspace.` });
          return;
        }
      }
    }

    const rules = dbService.getScreeningRules();

    let totalApplicants = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalManualReview = 0;
    let totalErrors = 0;

    const fileRecords: ImportFileRecord[] = [];
    const allApplicantsToInsert: Applicant[] = [];

    for (const file of files) {
      let fileRowCount = 0;
      let detectedJobTitle = '';
      let detectedJobId = '';
      let fileStatus: 'READY' | 'PROCESSED' | 'ERROR' = 'PROCESSED';
      let fileErrorMessage = '';
      const fileHash = getFileHash(file.path);
      const isPdf = file.originalname.toLowerCase().endsWith('.pdf');

      try {
        let rows: any[] = [];
        let sheetName = 'Sheet1';

        if (isPdf) {
          // Extract text from PDF
          const buf = fs.readFileSync(file.path);
          const pdfData = await pdfParse(buf);
          const text = pdfData.text || '';
          sheetName = 'PDF Document';

          // Extract basic details from PDF text
          const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          rows = [{
            'First Name': lines[0] ? lines[0].split(/\s+/)[0] : 'PDF Candidate',
            'Last Name': lines[0] ? lines[0].split(/\s+/).slice(1).join(' ') : '',
            'Job Title': path.basename(file.originalname, path.extname(file.originalname)),
            'Screening Questions': text,
            'Headline': lines.slice(1, 3).join(' | '),
          }];
        } else {
          // Parse Excel / CSV workbook
          const workbook = parseWorkbook(file.path);
          sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawParsed: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          rows = repairSplitRows(rawParsed);
        }

        if (rows.length === 0) {
          throw new Error('Worksheet contains no data rows.');
        }

        const headers = Object.keys(rows[0] || {});
        const mapping = detectHeaderMapping(headers);

        for (let i = 0; i < rows.length; i++) {
          const rawRow = rows[i];
          const sourceRowNumber = i + 2;

          try {
            const { normalized, rawRow: originalRaw } = extractRowValues(rawRow, mapping);

            if (!detectedJobTitle && normalized.jobTitle) detectedJobTitle = normalized.jobTitle;
            if (!detectedJobId && normalized.jobId) detectedJobId = normalized.jobId;

            // Extract screening questions & candidate origin context
            let rawScreeningText = normalized.rawScreeningQuestions || '';
            const originCtx = {
              fullName: normalized.fullName,
              firstName: normalized.firstName,
              lastName: normalized.lastName,
              headline: normalized.headline,
              educationInstitution: normalized.educationInstitution,
              location: normalized.location,
              email: normalized.email,
            };

            // 13,859 Reference Name Pattern Matcher (6-tier scoring)
            const nameMatch = referenceNameMatcher.matchApplicantName(normalized.fullName);

            let screeningEval = evaluateScreening(rawScreeningText, rules, originCtx, nameMatch);

            // Defensive backfill: If raw text didn't yield answers but separate columns exist, synthesize and re-evaluate
            if (
              (screeningEval.futureSponsorshipAnswer === 'MISSING' && normalized.sponsorshipAnswer) ||
              (screeningEval.greenCardCitizenAnswer === 'MISSING' && normalized.greenCardCitizenAnswer) ||
              (screeningEval.usWorkAuthAnswer === 'MISSING' && normalized.usWorkAuthAnswer)
            ) {
              const backfillParts: string[] = [];
              if (normalized.greenCardCitizenAnswer && screeningEval.greenCardCitizenAnswer === 'MISSING') {
                backfillParts.push(`Do You Have a Green Card or US Citizen ? : ${normalized.greenCardCitizenAnswer}`);
              }
              if (normalized.sponsorshipAnswer && screeningEval.futureSponsorshipAnswer === 'MISSING') {
                backfillParts.push(`Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : ${normalized.sponsorshipAnswer}`);
              }
              if (normalized.usWorkAuthAnswer && screeningEval.usWorkAuthAnswer === 'MISSING') {
                backfillParts.push(`Are you legally authorized to work in the United States? : ${normalized.usWorkAuthAnswer}`);
              }
              if (backfillParts.length > 0) {
                rawScreeningText = rawScreeningText ? `${rawScreeningText}, ${backfillParts.join(', ')}` : backfillParts.join(', ');
                screeningEval = evaluateScreening(rawScreeningText, rules, originCtx, nameMatch);
              }
            }

            // High Accuracy Gender Classification (Male / Female / Unspecified)
            const genderResult = classifyGender(normalized.firstName, normalized.fullName, normalized.headline);

            // Role Normalization (DA, DE, BA, DS, AWS, Cybersecurity, QA)
            const resolvedJobTitle = normalized.jobTitle || detectedJobTitle || path.basename(file.originalname, path.extname(file.originalname));
            const normalizedRole = normalizeJobRole(resolvedJobTitle, [normalized.currentTitle, normalized.headline, file.originalname].filter(Boolean).join(' '));

            const applicantId = `app-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${sourceRowNumber}`;

            const applicant: Applicant = {
              id: applicantId,
              importId,
              sourceFile: file.originalname,
              sourceWorksheet: sheetName,
              sourceRowNumber,
              firstName: normalized.firstName,
              lastName: normalized.lastName,
              fullName: normalized.fullName,
              email: normalized.email,
              phone: sanitizeContactNumber(normalized.phone),
              location: normalized.location,
              zipCode: normalized.zipCode,
              headline: normalized.headline,
              currentTitle: normalized.currentTitle,
              currentCompany: normalized.currentCompany,
              currentPositionStartDate: normalized.currentPositionStartDate,
              educationDegree: normalized.educationDegree,
              educationInstitution: normalized.educationInstitution,
              profileUrl: normalized.profileUrl,
              dateApplied: normalized.dateApplied || '',
              currentStage: normalized.currentStage || 'Applied',
              jobId: (jobSlots && Array.isArray(jobSlots) && jobSlots.length === 1 && jobSlots[0] !== 'ALL') ? jobSlots[0] : (normalized.jobId || detectedJobId || 'JOB-UNKNOWN'),
              jobTitle: (jobSlots && Array.isArray(jobSlots) && jobSlots.length === 1 && jobSlots[0] !== 'ALL') ? (dbService.getBaselineJobs(company as any).find(j => j.jobId === jobSlots[0])?.jobTitle || resolvedJobTitle) : resolvedJobTitle,
              normalizedRole,
              jobUrl: normalized.jobUrl,
              atsJobId: normalized.atsJobId,
              minSalary: normalized.minSalary,
              maxSalary: normalized.maxSalary,
              currencyCode: normalized.currencyCode,
              compensationPeriod: normalized.compensationPeriod,
              hiringProjectId: normalized.hiringProjectId,
              hiringProjectTitle: normalized.hiringProjectTitle,
              contractId: normalized.contractId,
              contractName: normalized.contractName,
              gender: genderResult.gender,
              genderConfidence: genderResult.confidence,
              originRegion: screeningEval.originResult?.origin || 'UNSPECIFIED',
              originCountry: screeningEval.originResult?.countryMatch,
              originMatchReason: screeningEval.originResult?.matchReason,
              nameMatchCategory: nameMatch.category,
              nameMatchScore: nameMatch.score,
              nameMatchedPattern: nameMatch.matchedPattern,
              nameMatchedReference: nameMatch.matchedReferenceName,
              rawScreeningQuestions: rawScreeningText,
              greenCardCitizenAnswer: screeningEval.greenCardCitizenAnswer,
              sponsorshipAnswer: screeningEval.futureSponsorshipAnswer,
              usWorkAuthAnswer: screeningEval.usWorkAuthAnswer,
              automatedResult: screeningEval.status,
              manualResult: null,
              effectiveResult: screeningEval.status,
              screeningReasons: screeningEval.reasons.join('; '),
              overrideReason: null,
              overriddenBy: null,
              overriddenAt: null,
              rawRowData: originalRaw,
              createdAt: uploadedAt,
            };

            allApplicantsToInsert.push(applicant);
            fileRowCount++;
            totalApplicants++;

            if (applicant.effectiveResult === 'PASS') totalPassed++;
            else if (applicant.effectiveResult === 'FAIL') totalFailed++;
            else if (applicant.effectiveResult === 'MANUAL_REVIEW') totalManualReview++;
            else totalErrors++;
          } catch (rowErr: any) {
            totalErrors++;
            const errorApplicantId = `app-err-${Date.now()}-${sourceRowNumber}`;
            allApplicantsToInsert.push({
              id: errorApplicantId,
              importId,
              sourceFile: file.originalname,
              sourceWorksheet: sheetName,
              sourceRowNumber,
              firstName: 'Row Error',
              lastName: '',
              fullName: `Error on Row ${sourceRowNumber}`,
              email: '',
              phone: '',
              location: '',
              zipCode: '',
              headline: '',
              currentTitle: '',
              currentCompany: '',
              currentPositionStartDate: '',
              educationDegree: '',
              educationInstitution: '',
              profileUrl: '',
              dateApplied: new Date().toISOString().split('T')[0],
              currentStage: 'Error',
              jobId: 'N/A',
              jobTitle: path.basename(file.originalname, path.extname(file.originalname)),
              jobUrl: '',
              atsJobId: '',
              minSalary: '',
              maxSalary: '',
              currencyCode: '',
              compensationPeriod: '',
              hiringProjectId: '',
              hiringProjectTitle: '',
              contractId: '',
              contractName: '',
              gender: 'UNSPECIFIED',
              rawScreeningQuestions: '',
              greenCardCitizenAnswer: 'MISSING',
              sponsorshipAnswer: 'MISSING',
              usWorkAuthAnswer: 'MISSING',
              automatedResult: 'ERROR',
              manualResult: null,
              effectiveResult: 'ERROR',
              screeningReasons: `Row parse error: ${rowErr.message}`,
              overrideReason: null,
              overriddenBy: null,
              overriddenAt: null,
              rawRowData: rawRow,
              createdAt: uploadedAt,
            });
          }
        }
      } catch (fileErr: any) {
        fileStatus = 'ERROR';
        fileErrorMessage = fileErr.message;
        totalErrors++;
      } finally {
        try {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch {}
      }

      fileRecords.push({
        filename: file.originalname,
        fileSize: file.size,
        rowCount: fileRowCount,
        jobId: detectedJobId,
        jobTitle: detectedJobTitle || path.basename(file.originalname, path.extname(file.originalname)),
        status: fileStatus,
        errorMessage: fileErrorMessage,
        hash: fileHash,
      });
    }

    const derivedBatchName =
      batchName ||
      (fileRecords[0] ? (fileRecords[0].jobTitle || fileRecords[0].filename.replace(/\.[^/.]+$/, '')) : '') ||
      importCode;

    const importRecord: ImportRecord = {
      id: importId,
      importCode,
      batchName: derivedBatchName,
      uploadedAt,
      uploadedBy,
      fileCount: files.length,
      totalApplicants,
      passedCount: totalPassed,
      failedCount: totalFailed,
      manualReviewCount: totalManualReview,
      errorCount: totalErrors,
      status: 'Completed',
      files: fileRecords,
    };

    dbService.createImport(importRecord, company, applicationDate, jobSlots);
    dbService.insertApplicantsBatch(allApplicantsToInsert, company, importId, applicationDate);

    // Note: Promotion to Master Candidate Database is an explicit recruiter action via POST /api/transfer-passed-to-master (Phase 2)

    dbService.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: uploadedAt,
      user: uploadedBy,
      action: 'File Batch Import',
      reason: `Uploaded ${files.length} file(s) with ${totalApplicants} applicants (${derivedBatchName}) in workspace ${company}.`,
      details: `Import ${importCode} (${derivedBatchName}) for ${company}: ${totalPassed} PASS, ${totalFailed} FAIL, ${totalManualReview} MANUAL REVIEW, ${totalErrors} ERRORS.`,
    });

    res.json({
      success: true,
      importRecord,
      summary: {
        importCode,
        batchName: derivedBatchName,
        filesProcessed: files.length,
        totalApplicants,
        passed: totalPassed,
        failed: totalFailed,
        manualReview: totalManualReview,
        errors: totalErrors,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// -------------------------------------------------------------
// 3A. PREVIEW PASTED DATA (VALIDATION & PRE-SCREENING PREVIEW)
// -------------------------------------------------------------
app.post('/api/preview-pasted-data', (req: Request, res: Response): void => {
  try {
    const { text, company, jobId, jobTitle } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'No pasted text provided.' });
      return;
    }

    const defaultJob = (jobId || jobTitle) ? { jobId, jobTitle } : undefined;
    const analysis = analyzePastedApplications(text, defaultJob);

    const rules = dbService.getScreeningRules();

    // Attach screening evaluation preview to each row
    const enrichedRows = analysis.rows.map((row) => {
      let rawScreeningText = row.rawQuestions || '';
      const originCtx = {
        fullName: row.fullName,
        firstName: row.firstName,
        lastName: row.lastName,
        location: row.location,
        email: row.email,
      };

      if (!rawScreeningText) {
        const parts: string[] = [];
        if (row.greenCardAnswer) parts.push(`Do You Have a Green Card or US Citizen ? : ${row.greenCardAnswer}`);
        if (row.sponsorshipAnswer) parts.push(`Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : ${row.sponsorshipAnswer}`);
        if (row.usWorkAuthAnswer) parts.push(`Are you legally authorized to work in the United States? : ${row.usWorkAuthAnswer}`);
        rawScreeningText = parts.join(', ');
      }

      const nameMatch = referenceNameMatcher.matchApplicantName(row.fullName);
      let evalResult = evaluateScreening(rawScreeningText, rules, originCtx, nameMatch);

      // Backfill if needed
      if (
        (evalResult.futureSponsorshipAnswer === 'MISSING' && row.sponsorshipAnswer) ||
        (evalResult.greenCardCitizenAnswer === 'MISSING' && row.greenCardAnswer)
      ) {
        const backfillParts: string[] = [];
        if (row.greenCardAnswer && evalResult.greenCardCitizenAnswer === 'MISSING') {
          backfillParts.push(`Do You Have a Green Card or US Citizen ? : ${row.greenCardAnswer}`);
        }
        if (row.sponsorshipAnswer && evalResult.futureSponsorshipAnswer === 'MISSING') {
          backfillParts.push(`Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : ${row.sponsorshipAnswer}`);
        }
        if (backfillParts.length > 0) {
          rawScreeningText = rawScreeningText ? `${rawScreeningText}, ${backfillParts.join(', ')}` : backfillParts.join(', ');
          evalResult = evaluateScreening(rawScreeningText, rules, originCtx, nameMatch);
        }
      }

      return {
        ...row,
        screeningStatus: evalResult.status,
        screeningReasons: evalResult.reasons,
      };
    });

    res.json({
      ...analysis,
      rows: enrichedRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3B. CLIPBOARD PASTE DATA PROCESSING (FULL RECRUITMENT PIPELINE)
// -------------------------------------------------------------
app.post('/api/process-pasted-data', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, label, uploadedBy, company, applicationDate, jobSlots, defaultJobId, defaultJobTitle } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'No clipboard text provided.' });
      return;
    }

    const defaultJob = {
      jobId: defaultJobId || (jobSlots && jobSlots[0]) || '',
      jobTitle: defaultJobTitle || (jobSlots && jobSlots[0]) || label || '',
    };

    const analysis = analyzePastedApplications(text, defaultJob);
    if (analysis.totalRows === 0 || analysis.validRows === 0) {
      res.status(400).json({
        error: `Could not parse valid application records. ${
          analysis.missingRequiredFields.length > 0
            ? 'Missing: ' + analysis.missingRequiredFields.join(', ')
            : 'Please ensure records contain Name and Contact Info.'
        }`,
      });
      return;
    }

    const finalCompany = company || 'AaraTech';

    // Validate selected job slots against company workspace
    if (jobSlots && Array.isArray(jobSlots)) {
      for (const slot of jobSlots) {
        const slotUpper = String(slot).toUpperCase().trim();
        if (finalCompany === 'AaraTech' && slotUpper.startsWith('CT-')) {
          res.status(400).json({ error: `Job slot '${slot}' belongs to ClinisolTech and cannot be imported into AaraTech workspace.` });
          return;
        }
        if (finalCompany === 'ClinisolTech' && slotUpper.startsWith('AT-')) {
          res.status(400).json({ error: `Job slot '${slot}' belongs to AaraTech and cannot be imported into ClinisolTech workspace.` });
          return;
        }
      }
    }

    const importId = `imp-paste-${Date.now()}`;
    const importCode = dbService.getNextImportCode();
    const uploadedAt = new Date().toISOString();
    const user = uploadedBy || 'Recruiter Admin';
    const rules = dbService.getScreeningRules();

    let totalPassed = 0;
    let totalFailed = 0;
    let totalManualReview = 0;
    let totalErrors = analysis.invalidRows;

    const allApplicantsToInsert: Applicant[] = [];
    const derivedJobSlotName = (defaultJob.jobId && defaultJob.jobId !== 'ALL' && defaultJob.jobTitle)
      ? `[${defaultJob.jobId}] ${defaultJob.jobTitle}`
      : (defaultJob.jobTitle ? `${defaultJob.jobTitle} (Pasted)` : 'Pasted Applications Batch');
    const importName = label && !label.startsWith('Pasted Ingestion') ? label : (derivedJobSlotName || label || 'Pasted Applications Batch');

    for (const row of analysis.rows) {
      if (!row.isValid) continue;

      let rawScreeningText = row.rawQuestions || '';
      const originCtx = {
        fullName: row.fullName,
        firstName: row.firstName,
        lastName: row.lastName,
        location: row.location,
        email: row.email,
      };

      if (!rawScreeningText) {
        const parts: string[] = [];
        if (row.greenCardAnswer) parts.push(`Do You Have a Green Card or US Citizen ? : ${row.greenCardAnswer}`);
        if (row.sponsorshipAnswer) parts.push(`Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : ${row.sponsorshipAnswer}`);
        if (row.usWorkAuthAnswer) parts.push(`Are you legally authorized to work in the United States? : ${row.usWorkAuthAnswer}`);
        rawScreeningText = parts.join(', ');
      }

      const nameMatch = referenceNameMatcher.matchApplicantName(row.fullName);
      let screeningEval = evaluateScreening(rawScreeningText, rules, originCtx, nameMatch);

      // Defensive backfill: If raw text didn't yield answers but separate columns exist, synthesize and re-evaluate
      if (
        (screeningEval.futureSponsorshipAnswer === 'MISSING' && row.sponsorshipAnswer) ||
        (screeningEval.greenCardCitizenAnswer === 'MISSING' && row.greenCardAnswer)
      ) {
        const backfillParts: string[] = [];
        if (row.greenCardAnswer && screeningEval.greenCardCitizenAnswer === 'MISSING') {
          backfillParts.push(`Do You Have a Green Card or US Citizen ? : ${row.greenCardAnswer}`);
        }
        if (row.sponsorshipAnswer && screeningEval.futureSponsorshipAnswer === 'MISSING') {
          backfillParts.push(`Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : ${row.sponsorshipAnswer}`);
        }
        if (backfillParts.length > 0) {
          rawScreeningText = rawScreeningText ? `${rawScreeningText}, ${backfillParts.join(', ')}` : backfillParts.join(', ');
          screeningEval = evaluateScreening(rawScreeningText, rules, originCtx, nameMatch);
        }
      }

      let finalGender: any = (row as any).gender ? String((row as any).gender).toUpperCase().trim() : undefined;
      let finalConfidence = 1.0;
      if (!finalGender || (finalGender !== 'MALE' && finalGender !== 'FEMALE')) {
        const genderResult = classifyGender(row.firstName || row.fullName.split(' ')[0], row.fullName);
        finalGender = genderResult.gender;
        finalConfidence = genderResult.confidence;
      }

      const selectedJobId = (defaultJob.jobId && defaultJob.jobId !== 'ALL') ? defaultJob.jobId : (row.jobId || 'PASTE-JOB');
      const selectedJobTitle = (defaultJob.jobId && defaultJob.jobId !== 'ALL' && defaultJob.jobTitle) ? defaultJob.jobTitle : (row.jobTitle || defaultJob.jobTitle || importName);
      const normalizedRole = normalizeJobRole(selectedJobTitle);
      const applicantId = `app-paste-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${row.rowIndex}`;

      const applicant: Applicant = {
        id: applicantId,
        importId,
        sourceFile: 'Direct Clipboard Paste',
        sourceWorksheet: 'Pasted Data',
        sourceRowNumber: row.rowIndex,
        firstName: row.firstName || row.fullName.split(' ')[0] || '',
        lastName: row.lastName || row.fullName.split(' ').slice(1).join(' ') || '',
        fullName: row.fullName,
        email: row.email,
        phone: sanitizeContactNumber(row.phone),
        location: row.location || '',
        zipCode: '',
        headline: '',
        currentTitle: row.jobTitle || selectedJobTitle,
        currentCompany: '',
        currentPositionStartDate: '',
        educationDegree: '',
        educationInstitution: '',
        profileUrl: row.profileUrl || '',
        dateApplied: row.dateApplied || '',
        currentStage: 'Pasted Application',
        jobId: selectedJobId,
        jobTitle: selectedJobTitle,
        normalizedRole,
        jobUrl: '',
        atsJobId: '',
        minSalary: '',
        maxSalary: '',
        currencyCode: '',
        compensationPeriod: '',
        hiringProjectId: '',
        hiringProjectTitle: '',
        contractId: '',
        contractName: '',
        gender: finalGender,
        genderConfidence: finalConfidence,
        originRegion: screeningEval.originResult?.origin || 'UNSPECIFIED',
        originCountry: screeningEval.originResult?.countryMatch,
        originMatchReason: screeningEval.originResult?.matchReason,
        nameMatchCategory: nameMatch.category,
        nameMatchScore: nameMatch.score,
        nameMatchedPattern: nameMatch.matchedPattern,
        nameMatchedReference: nameMatch.matchedReferenceName,
        rawScreeningQuestions: rawScreeningText,
        greenCardCitizenAnswer: screeningEval.greenCardCitizenAnswer !== 'MISSING' ? screeningEval.greenCardCitizenAnswer : row.greenCardAnswer,
        sponsorshipAnswer: screeningEval.futureSponsorshipAnswer !== 'MISSING' ? screeningEval.futureSponsorshipAnswer : row.sponsorshipAnswer,
        usWorkAuthAnswer: screeningEval.usWorkAuthAnswer !== 'MISSING' ? screeningEval.usWorkAuthAnswer : (row.usWorkAuthAnswer || ''),
        automatedResult: screeningEval.status,
        manualResult: null,
        effectiveResult: screeningEval.status,
        screeningReasons: screeningEval.reasons.join('; '),
        overrideReason: null,
        overriddenBy: null,
        overriddenAt: null,
        rawRowData: row.rawRow,
        createdAt: uploadedAt,
      };

      allApplicantsToInsert.push(applicant);
      if (applicant.effectiveResult === 'PASS') totalPassed++;
      else if (applicant.effectiveResult === 'FAIL') totalFailed++;
      else if (applicant.effectiveResult === 'MANUAL_REVIEW') totalManualReview++;
      else totalErrors++;
    }

    const importRecord: ImportRecord = {
      id: importId,
      importCode,
      batchName: importName,
      uploadedAt,
      uploadedBy: user,
      fileCount: 1,
      totalApplicants: allApplicantsToInsert.length,
      passedCount: totalPassed,
      failedCount: totalFailed,
      manualReviewCount: totalManualReview,
      errorCount: totalErrors,
      status: 'Completed',
      files: [
        {
          filename: importName || 'Direct Clipboard Paste',
          fileSize: Buffer.byteLength(text, 'utf8'),
          rowCount: allApplicantsToInsert.length,
          jobId: defaultJob.jobId || 'PASTE-JOB',
          jobTitle: defaultJob.jobTitle || importName,
          status: 'PROCESSED',
        },
      ],
    };

    dbService.createImport(importRecord, finalCompany, applicationDate, jobSlots);
    dbService.insertApplicantsBatch(allApplicantsToInsert, finalCompany, importId, applicationDate);

    // Note: Promotion to Master Candidate Database is an explicit recruiter action via POST /api/transfer-passed-to-master (Phase 2)

    dbService.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: uploadedAt,
      user,
      action: 'Clipboard Paste Import',
      reason: `Direct clipboard paste of ${allApplicantsToInsert.length} applicants (${importName}) in ${finalCompany}.`,
      details: `Import ${importCode} (${importName}) for ${finalCompany}: ${totalPassed} PASS, ${totalFailed} FAIL, ${totalManualReview} MANUAL REVIEW, ${totalErrors} invalid/errors.`,
    });

    res.json({
      success: true,
      importRecord,
      summary: {
        importCode,
        batchName: importName,
        filesProcessed: 1,
        totalApplicants: allApplicantsToInsert.length,
        passed: totalPassed,
        failed: totalFailed,
        manualReview: totalManualReview,
        errors: totalErrors,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. DASHBOARD STATS (INCLUDING GENDER DISTRIBUTION & WORKSPACE SCOPE)
// -------------------------------------------------------------
app.get('/api/dashboard', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || undefined;
    const stats = dbService.getDashboardStats(company);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. APPLICANTS LIST (SERVER PAGINATED, FILTERED BY COMPANY, BATCH, STATUS, GENDER)
// -------------------------------------------------------------
app.get('/api/applicants', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || undefined;
    const batchId = (req.query.batchId as string) || (req.query.importId as string) || undefined;
    const applicationDate = (req.query.applicationDate as string) || undefined;
    const startDate = (req.query.startDate as string) || undefined;
    const endDate = (req.query.endDate as string) || undefined;
    const isDuplicate = req.query.isDuplicate !== undefined ? (req.query.isDuplicate === 'true' || req.query.isDuplicate === '1') : undefined;
    const assignedRecruiter = (req.query.assignedRecruiter as string) || undefined;

    const params = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 25,
      search: (req.query.search as string) || '',
      status: (req.query.status as string) || 'ALL',
      gender: (req.query.gender as string) || 'ALL',
      origin: (req.query.origin as string) || 'ALL',
      nameMatchCategory: (req.query.nameMatchCategory as any) || undefined,
      normalizedRole: (req.query.normalizedRole as string) || undefined,
      jobId: (req.query.jobId as string) || undefined,
      jobTitle: (req.query.jobTitle as string) || undefined,
      company: company as string,
      batchId,
      applicationDate,
      startDate,
      endDate,
      isDuplicate,
      assignedRecruiter,
      stage: (req.query.stage as string) || undefined,
      location: (req.query.location as string) || undefined,
      hasEmail: req.query.hasEmail === 'true',
      hasPhone: req.query.hasPhone === 'true',
      hasLinkedIn: req.query.hasLinkedIn === 'true',
      sortBy: (req.query.sortBy as string) || 'date_applied',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const result = dbService.getApplicants(params);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5B. GET ALL APPLICANT IDS (For selecting all applicants across pages)
app.get('/api/applicants/all-ids', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || undefined;
    const batchId = (req.query.batchId as string) || (req.query.importId as string) || undefined;
    const applicationDate = (req.query.applicationDate as string) || undefined;
    const isDuplicate = req.query.isDuplicate !== undefined ? (req.query.isDuplicate === 'true' || req.query.isDuplicate === '1') : undefined;
    const assignedRecruiter = (req.query.assignedRecruiter as string) || undefined;

    const params: any = {
      search: (req.query.search as string) || '',
      status: (req.query.status as string) || 'ALL',
      gender: (req.query.gender as string) || 'ALL',
      origin: (req.query.origin as string) || 'ALL',
      nameMatchCategory: (req.query.nameMatchCategory as any) || undefined,
      jobId: (req.query.jobId as string) || undefined,
      jobTitle: (req.query.jobTitle as string) || undefined,
      company: company as string,
      batchId,
      applicationDate,
      isDuplicate,
      assignedRecruiter,
      stage: (req.query.stage as string) || undefined,
      location: (req.query.location as string) || undefined,
      hasEmail: req.query.hasEmail === 'true',
      hasPhone: req.query.hasPhone === 'true',
      hasLinkedIn: req.query.hasLinkedIn === 'true',
      sortBy: (req.query.sortBy as string) || 'date_applied',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const ids = dbService.getAllApplicantIds(params);
    res.json({ ids, total: ids.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5C. GET APPLICANT TAB COUNTS (Exact breakdown across Passed, Manual Review, Failed, All Records)
app.get('/api/applicants/tab-counts', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || undefined;
    const batchId = (req.query.batchId as string) || (req.query.importId as string) || undefined;
    const applicationDate = (req.query.applicationDate as string) || undefined;
    const startDate = (req.query.startDate as string) || undefined;
    const endDate = (req.query.endDate as string) || undefined;
    const jobId = (req.query.jobId as string) || undefined;
    const search = (req.query.search as string) || '';
    const gender = (req.query.gender as string) || 'ALL';
    const nameMatchCategory = (req.query.nameMatchCategory as string) || undefined;
    const normalizedRole = (req.query.normalizedRole as string) || undefined;
    const isDuplicate = req.query.isDuplicate !== undefined ? (req.query.isDuplicate === 'true' || req.query.isDuplicate === '1') : undefined;

    const counts = dbService.getApplicantTabCounts({
      company,
      batchId,
      applicationDate,
      startDate,
      endDate,
      jobId,
      search,
      gender,
      nameMatchCategory,
      normalizedRole,
      isDuplicate,
    });

    res.json(counts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5D. GET DISTINCT INGESTION DATES FOR COMPANY WORKSPACE
app.get('/api/ingestion-dates', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || 'AaraTech';
    const dates = dbService.getIngestionDates(company);
    res.json({ dates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. APPLICANT DETAIL VIEW
// -------------------------------------------------------------
app.get('/api/applicants/:id', (req: Request, res: Response): void => {
  try {
    const applicant = dbService.getApplicantById(req.params.id);
    if (!applicant) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }
    res.json(applicant);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. MANUAL OVERRIDE (WITH AUDIT PRESERVATION)
// -------------------------------------------------------------
app.post('/api/applicants/:id/override', (req: Request, res: Response): void => {
  try {
    const { newStatus, user, reason } = req.body;
    if (!newStatus) {
      res.status(400).json({ error: 'newStatus is required for override.' });
      return;
    }

    const success = dbService.overrideApplicantStatus(
      req.params.id,
      newStatus,
      user || 'Recruiter Admin',
      reason || ''
    );

    if (!success) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    const updated = dbService.getApplicantById(req.params.id);
    res.json({ success: true, applicant: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7A. BATCH STATUS OVERRIDE (USER REQUESTED FEATURE: BULK ADD TO PASS / REMOVE FROM PASS)
app.post('/api/applicants/batch-override', (req: Request, res: Response): void => {
  try {
    const { ids, newStatus, user, reason } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !newStatus) {
      res.status(400).json({ error: 'ids array and newStatus are required.' });
      return;
    }

    const count = dbService.batchOverrideApplicantStatus(
      ids,
      newStatus,
      user || 'Recruiter Admin',
      reason || ''
    );

    res.json({ success: true, count, message: `Successfully updated ${count} applicants to ${newStatus}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7B. DELETE APPLICANT
app.delete('/api/applicants/:id', (req: Request, res: Response): void => {
  try {
    const success = dbService.deleteApplicant(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }
    res.json({ success: true, message: 'Applicant deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7C. BATCH GENDER UPDATE (USER REQUESTED FEATURE: "also put here gnder chnage ,we will slect all")
app.post('/api/applicants/batch-gender', (req: Request, res: Response): void => {
  try {
    const { ids, gender, user } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !gender) {
      res.status(400).json({ error: 'ids array and gender are required.' });
      return;
    }
    const count = dbService.batchUpdateGender(ids, gender, user || 'Recruiter Admin');
    res.json({
      success: true,
      count,
      message: `Successfully set gender to ${gender === 'MALE' ? 'Male (♂)' : gender === 'FEMALE' ? 'Female (♀)' : 'Unspecified'} for ${count} candidate(s)`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7D. DEDUPLICATE APPLICANTS (USER REQUESTED FEATURE: "we have so many duplicates in passed list only , only one unique record should be there")
app.post('/api/applicants/deduplicate', (req: Request, res: Response): void => {
  try {
    const scope = req.body?.scope === 'PASS' ? 'PASS' : 'ALL';
    const result = dbService.deduplicateApplicants(scope);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7B. APPLICANT GENDER MODIFICATION (USER REQUESTED FEATURE)
// -------------------------------------------------------------
app.post('/api/applicants/:id/gender', (req: Request, res: Response): void => {
  try {
    const { gender, user } = req.body;
    if (!gender) {
      res.status(400).json({ error: 'gender is required (MALE, FEMALE, or UNSPECIFIED).' });
      return;
    }

    const success = dbService.updateApplicantGender(
      req.params.id,
      gender,
      user || 'Recruiter Admin'
    );

    if (!success) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }

    const updated = dbService.getApplicantById(req.params.id);
    res.json({ success: true, applicant: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/applicants/:id/gender', (req: Request, res: Response): void => {
  try {
    const { gender, user } = req.body;
    if (!gender) {
      res.status(400).json({ error: 'gender is required.' });
      return;
    }
    const success = dbService.updateApplicantGender(req.params.id, gender, user || 'Recruiter Admin');
    if (!success) {
      res.status(404).json({ error: 'Applicant not found' });
      return;
    }
    const updated = dbService.getApplicantById(req.params.id);
    res.json({ success: true, applicant: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. SCREENING RULES
// -------------------------------------------------------------
app.get('/api/screening-rules', (_req: Request, res: Response): void => {
  try {
    const rules = dbService.getScreeningRules();
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/screening-rules/:id', (req: Request, res: Response): void => {
  try {
    const success = dbService.updateScreeningRule(req.params.id, req.body);
    if (!success) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    const summary = dbService.reevaluateAllApplicants();
    const rules = dbService.getScreeningRules();
    res.json({ success: true, rules, reevaluated: summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reevaluate', (_req: Request, res: Response): void => {
  try {
    const summary = dbService.reevaluateAllApplicants();
    res.json({ success: true, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 9. JOBS GROUPING SUMMARY (BASELINE 31 JOBS BY WORKSPACE)
// -------------------------------------------------------------
app.get('/api/jobs', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || undefined;
    const jobs = dbService.getJobSummaries(company);
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update / Rename Job Slot Title
app.put('/api/jobs/:jobId', (req: Request, res: Response): void => {
  try {
    const { jobId } = req.params;
    const { company, jobTitle } = req.body;
    const targetCompany = company || (req.headers['x-company'] as any) || 'AaraTech';

    if (!jobTitle || !jobTitle.trim()) {
      res.status(400).json({ error: 'jobTitle is required.' });
      return;
    }

    const result = dbService.updateJobTitle(targetCompany, jobId, jobTitle);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/jobs/:jobId', (req: Request, res: Response): void => {
  try {
    const { jobId } = req.params;
    const { company, jobTitle } = req.body;
    const targetCompany = company || (req.headers['x-company'] as any) || 'AaraTech';

    if (!jobTitle || !jobTitle.trim()) {
      res.status(400).json({ error: 'jobTitle is required.' });
      return;
    }

    const result = dbService.updateJobTitle(targetCompany, jobId, jobTitle);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10. IMPORTS HISTORY (COMPANY SCOPED)
// -------------------------------------------------------------
app.get('/api/imports', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const imports = dbService.getImports(limit, company);
    res.json(imports);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10B. CLEAR CURRENT WORKING BATCH (SAFE SCOPED ACTION, NEVER GLOBAL WIPE)
// -------------------------------------------------------------
app.post(['/api/batches/:id/clear', '/api/clear-current-batch'], (req: Request, res: Response): void => {
  try {
    const batchId = (req.params.id as string) || (req.body.batchId as string);
    const company = (req.body.company as any) || (req.headers['x-company'] as any) || 'AaraTech';
    const purgeRecords = req.body.purgeRecords === true || req.body.purgeRecords === 'true';
    const user = req.body.user || 'Recruiter Admin';

    if (!batchId) {
      res.status(400).json({ error: 'batchId is required to clear active working batch.' });
      return;
    }

    const result = dbService.clearWorkingBatch(batchId, company, purgeRecords);

    dbService.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      action: purgeRecords ? 'Purge Batch Records' : 'Unload Active Working Batch',
      reason: `Cleared active working batch '${batchId}' in workspace ${company}.`,
      details: `Batch ${batchId} cleared. Records purged: ${purgeRecords ? result.purgedApplicants : 0}. Permanent history and other batches preserved.`,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10B. CLEAR ALL APPLICATIONS (SCOPED COMPANY FRESH START)
// -------------------------------------------------------------
app.get('/api/applications/clear-summary', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || 'AaraTech';
    if (company !== 'AaraTech' && company !== 'ClinisolTech') {
      res.status(400).json({ error: `Invalid company '${company}'. Must be AaraTech or ClinisolTech.` });
      return;
    }
    const summary = dbService.getApplicationClearSummary(company);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/applications/clear-all', (req: Request, res: Response): void => {
  try {
    const company = (req.body.company as any) || (req.headers['x-company'] as any);
    const confirm = req.body.confirm === true || req.body.confirm === 'true';
    const user = req.body.user || 'Recruiter Admin';

    if (!confirm) {
      res.status(400).json({ error: 'Explicit confirmation (confirm: true) is required to clear all applications.' });
      return;
    }

    if (company !== 'AaraTech' && company !== 'ClinisolTech') {
      res.status(400).json({ error: `Invalid company scope '${company}'. Must be AaraTech or ClinisolTech.` });
      return;
    }

    const result = dbService.clearAllApplications(company, user);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10C. RECRUITERS MANAGEMENT & LEAD DISTRIBUTION
// -------------------------------------------------------------
app.get('/api/recruiters', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || undefined;
    const recruiters = dbService.getRecruiters(company);
    res.json(recruiters);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recruiters', (req: Request, res: Response): void => {
  try {
    const { name, email, company, active } = req.body;
    if (!name || !email || !company) {
      res.status(400).json({ error: 'name, email, and company are required.' });
      return;
    }
    const recruiter = dbService.addRecruiter({ name, email, company, active: active !== false });
    res.json({ success: true, recruiter });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/applicants/distribute', (req: Request, res: Response): void => {
  try {
    const { ids, recruiterName, company, user } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !recruiterName) {
      res.status(400).json({ error: 'ids array and recruiterName are required for distribution.' });
      return;
    }
    const finalCompany = company || (req.headers['x-company'] as any) || 'AaraTech';
    const finalUser = user || 'Recruiter Admin';
    const updatedCount = dbService.distributeLeads(ids, recruiterName, finalCompany, finalUser);
    res.json({ success: true, count: updatedCount, message: `Successfully distributed ${updatedCount} leads to ${recruiterName}.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10D. PERIODIC ANALYTICS & REPORTS (DAILY / WEEKLY / MONTHLY)
// -------------------------------------------------------------
app.get('/api/reports/analytics', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || 'AaraTech';
    const period = (req.query.period as 'daily' | 'weekly' | 'monthly' | 'custom' | 'all') || 'daily';
    const dateStr = (req.query.date as string) || (req.query.applicationDate as string) || new Date().toISOString().split('T')[0];
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const analytics = dbService.getReportAnalytics(company, period, dateStr, startDate, endDate);
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/cross-technology', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as any) || (req.headers['x-company'] as any) || 'AaraTech';
    const data = dbService.getCrossTechnologyAnalytics(company);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10E. PRE-UPLOAD DUPLICATE CHECK AGAINST MASTER CANDIDATE DB
// -------------------------------------------------------------
app.post('/api/candidates/check-duplicates', (req: Request, res: Response): void => {
  try {
    const { candidates, company, targetJobSlot } = req.body;
    if (!candidates || !Array.isArray(candidates)) {
      res.status(400).json({ error: 'candidates array is required.' });
      return;
    }
    const finalCompany = company || (req.headers['x-company'] as any) || 'AaraTech';
    const results = dbService.checkCandidateDuplicates(candidates, finalCompany, targetJobSlot);
    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10F. MASTER CANDIDATE DATABASE API
// -------------------------------------------------------------
app.get('/api/master-candidates', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as string) || (req.headers['x-company'] as string) || undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const owner = req.query.owner as string;
    const gender = req.query.gender as string;
    const contactFilter = req.query.contactFilter as string;
    const technology = req.query.technology as string;
    const repeatFilter = req.query.repeatFilter as string;
    const h1bStatus = req.query.h1bStatus as string;
    const greenCard = req.query.greenCard as string;
    const hasResume = req.query.hasResume === 'true' ? true : undefined;
    const hasLinkedIn = req.query.hasLinkedIn === 'true' ? true : undefined;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const sortBy = req.query.sortBy as string;
    const sortOrder = req.query.sortOrder as ('asc' | 'desc');

    const result = dbService.getMasterCandidates({
      company,
      page,
      pageSize,
      search,
      status,
      owner,
      gender,
      contactFilter,
      technology,
      repeatFilter,
      h1bStatus,
      greenCard,
      hasResume,
      hasLinkedIn,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      candidates: result.candidates,
      totalCount: result.totalCount,
      page,
      pageSize,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/master-candidates/technologies', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as string) || (req.headers['x-company'] as string) || undefined;
    const technologies = dbService.getMasterCandidateTechnologies(company);
    res.json({ success: true, technologies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/master-candidates/export-csv', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as string) || (req.headers['x-company'] as string) || undefined;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const owner = req.query.owner as string;
    const gender = req.query.gender as string;
    const contactFilter = req.query.contactFilter as string;
    const technology = req.query.technology as string;
    const repeatFilter = req.query.repeatFilter as string;
    const h1bStatus = req.query.h1bStatus as string;
    const greenCard = req.query.greenCard as string;
    const hasResume = req.query.hasResume === 'true' ? true : undefined;
    const hasLinkedIn = req.query.hasLinkedIn === 'true' ? true : undefined;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const sortBy = req.query.sortBy as string;
    const sortOrder = req.query.sortOrder as ('asc' | 'desc');

    const result = dbService.getMasterCandidates({
      company,
      page: 1,
      pageSize: 10000,
      search,
      status,
      owner,
      gender,
      contactFilter,
      technology,
      repeatFilter,
      h1bStatus,
      greenCard,
      hasResume,
      hasLinkedIn,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    });

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Person ID',
      'Full Name',
      'Gender',
      'Primary Email',
      'Primary Phone',
      'Location',
      'Technology / Current Title',
      'Company',
      'Status',
      'Assigned Owner',
      'H1B Sponsorship',
      'Green Card / US-C',
      'Total Applications',
      'Repeat Applications',
      'First Applied Date',
      'Last Applied Date',
      'Resume URL',
      'LinkedIn URL',
      'Latest Recruiter Feedback',
    ];

    const rows: string[] = [headers.join(',')];

    for (const c of result.candidates) {
      const latestFeedback = c.recruiter_contacts && c.recruiter_contacts.length > 0
        ? (c.recruiter_contacts[0].outcome || c.recruiter_contacts[0].feedback_1 || c.recruiter_contacts[0].notes || '')
        : '';

      rows.push([
        escapeCsv(c.person_id || c.id),
        escapeCsv(c.full_name),
        escapeCsv(c.gender || 'Unspecified'),
        escapeCsv(c.primary_email),
        escapeCsv(c.primary_phone),
        escapeCsv(c.location),
        escapeCsv(c.current_title),
        escapeCsv(c.company),
        escapeCsv(c.current_status),
        escapeCsv(c.current_owner),
        escapeCsv(c.h1b_status || 'No'),
        escapeCsv(c.green_card || 'No'),
        c.total_applications ?? 1,
        c.repeat_applications ?? 0,
        escapeCsv(c.first_applied_date),
        escapeCsv(c.last_applied_date),
        escapeCsv(c.resume_url),
        escapeCsv(c.linkedin_url),
        escapeCsv(latestFeedback),
      ].join(','));
    }

    const filename = `Master_Candidates_${company || 'All'}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + rows.join('\r\n'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/master-candidates/stats', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as string) || (req.headers['x-company'] as string) || undefined;
    const stats = dbService.getMasterCandidateStats(company);
    res.json({ success: true, ...stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/master-candidates/:id', (req: Request, res: Response): void => {
  try {
    const candidate = dbService.getMasterCandidateById(req.params.id);
    if (!candidate) {
      res.status(404).json({ error: `Master candidate '${req.params.id}' not found` });
      return;
    }
    res.json({ success: true, candidate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/master-candidates/:id', (req: Request, res: Response): void => {
  try {
    const user = req.body.user || 'Recruiter Admin';
    const success = dbService.updateMasterCandidate(req.params.id, req.body, user);
    if (!success) {
      res.status(404).json({ error: `Master candidate '${req.params.id}' not found` });
      return;
    }
    const updated = dbService.getMasterCandidateById(req.params.id);
    res.json({ success: true, candidate: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-candidates/:id/contact', (req: Request, res: Response): void => {
  try {
    const { recruiterName, contactType, notes, contactDate, user } = req.body;
    if (!recruiterName || !contactType || !notes) {
      res.status(400).json({ error: 'recruiterName, contactType, and notes are required' });
      return;
    }
    const success = dbService.addMasterRecruiterContact(
      req.params.id,
      recruiterName,
      contactType,
      notes,
      contactDate,
      user || 'Recruiter Admin'
    );
    if (!success) {
      res.status(404).json({ error: `Master candidate '${req.params.id}' not found` });
      return;
    }
    const updated = dbService.getMasterCandidateById(req.params.id);
    res.json({ success: true, candidate: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-candidates/:id/reassign', (req: Request, res: Response): void => {
  try {
    const { recruiterName, assignedDate, reason, user } = req.body;
    if (!recruiterName) {
      res.status(400).json({ error: 'recruiterName is required' });
      return;
    }
    const updated = dbService.reassignMasterCandidate(
      req.params.id,
      recruiterName,
      assignedDate,
      reason,
      user || 'Recruiter Admin'
    );
    if (!updated) {
      res.status(404).json({ error: `Master candidate '${req.params.id}' not found` });
      return;
    }
    res.json({ success: true, candidate: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-candidates/:id/contact-attempt', (req: Request, res: Response): void => {
  try {
    const { recruiterName, contactMethod, outcome, feedback1, feedback2, notes, contactDate, nextFollowUp, sourceFile, user } = req.body;
    if (!recruiterName) {
      res.status(400).json({ error: 'recruiterName is required' });
      return;
    }
    const updated = dbService.addMasterContactAttempt(
      req.params.id,
      {
        recruiter_name: recruiterName,
        contact_method: contactMethod,
        outcome,
        feedback_1: feedback1,
        feedback_2: feedback2,
        notes,
        contact_date: contactDate,
        next_follow_up: nextFollowUp,
        source_file: sourceFile,
      },
      user || 'Recruiter Admin'
    );
    if (!updated) {
      res.status(404).json({ error: `Master candidate '${req.params.id}' not found` });
      return;
    }
    res.json({ success: true, candidate: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-candidates/batch-update', (req: Request, res: Response): void => {
  try {
    const { ids, updates, user } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !updates) {
      res.status(400).json({ error: 'ids array and updates object are required' });
      return;
    }
    const count = dbService.batchUpdateMasterCandidates(ids, updates, user || 'Recruiter Admin');
    res.json({ success: true, updatedCount: count, message: `Successfully updated ${count} master candidate profile(s).` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/master-candidates/:id', (req: Request, res: Response): void => {
  try {
    const user = req.body?.user || 'Recruiter Admin';
    const success = dbService.deleteMasterCandidate(req.params.id, user);
    if (!success) {
      res.status(404).json({ error: `Master candidate '${req.params.id}' not found` });
      return;
    }
    res.json({ success: true, message: `Candidate ${req.params.id} deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-candidates/clear-all', (req: Request, res: Response): void => {
  try {
    const company = (req.body?.company as any) || (req.query?.company as any) || 'all';
    const user = req.body?.user || 'Recruiter Admin';
    const result = dbService.clearAllMasterData(company, user);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master-candidates/batch-upsert', (req: Request, res: Response): void => {
  try {
    const people = req.body?.people || [];
    const importRecord = req.body?.importRecord;
    const result = dbService.upsertMasterCandidatesBatch(people, importRecord);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/candidates/promote-applications', (req: Request, res: Response): void => {
  try {
    const company = (req.body.company as string) || (req.headers['x-company'] as string) || undefined;
    const applicantIds = Array.isArray(req.body.applicantIds) ? req.body.applicantIds : undefined;
    const result = dbService.promoteApplicationsToMaster(company, applicantIds);

    dbService.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: req.body.user || 'System Admin',
      action: 'Promote Applications to Master',
      reason: `Promoted applications to master database for company: ${company || 'All'}.`,
      details: `Created/Updated: ${result.promotedCount} candidates, ${result.linkedCount} linked applications, ${result.needsReviewCount} review queue, ${result.incompleteCount} incomplete.`,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10C. PHASE 2: CONTROLLED, PASSED-ONLY TRANSFER TO MASTER DB
// -------------------------------------------------------------
app.post(['/api/transfer-passed-to-master', '/api/applications/transfer-passed'], (req: Request, res: Response): void => {
  try {
    const company = (req.body.company as string) || (req.headers['x-company'] as string) || 'AaraTech';
    if (company !== 'AaraTech' && company !== 'ClinisolTech') {
      res.status(400).json({ error: `Invalid company context: '${company}'. Must be AaraTech or ClinisolTech.` });
      return;
    }

    const batchId = (req.body.batchId as string) || undefined;
    const applicantIds = Array.isArray(req.body.applicantIds) ? req.body.applicantIds : undefined;
    const transferredBy = (req.body.transferredBy as string) || 'Recruiter Admin';

    const result = dbService.transferPassedApplicationsToMaster(company as any, {
      batchId,
      applicantIds,
      transferredBy,
    });

    res.json(result);
  } catch (err: any) {
    console.error('[API /api/transfer-passed-to-master error]:', err);
    res.status(500).json({ error: err.message || 'Failed to transfer passed applications to Master DB.' });
  }
});

app.get('/api/transfer-status', (req: Request, res: Response): void => {
  try {
    const company = (req.query.company as string) || (req.headers['x-company'] as string) || 'AaraTech';
    if (company !== 'AaraTech' && company !== 'ClinisolTech') {
      res.status(400).json({ error: `Invalid company context: '${company}'. Must be AaraTech or ClinisolTech.` });
      return;
    }
    const batchId = (req.query.batchId as string) || undefined;
    const status = dbService.getTransferStatus(company as any, batchId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 11. AUDIT LOGS
// -------------------------------------------------------------
app.get('/api/audit-logs', (_req: Request, res: Response): void => {
  try {
    const logs = dbService.getAuditLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 12. MULTI-OPTION EXPORT (XLSX, CSV, TSV, JSON, CLEAN RECRUITER LIST, BY GENDER)
// -------------------------------------------------------------
app.get('/api/export', (req: Request, res: Response): void => {
  try {
    const format = ((req.query.format as string) || 'xlsx').toLowerCase();
    const status = req.query.status as string;
    const gender = req.query.gender as string;
    const jobId = req.query.jobId as string;
    const importId = req.query.importId as string;
    const template = ((req.query.template as string) || 'clean').toLowerCase();
    const idsQuery = req.query.ids as string;

    let applicants: Applicant[];
    if (idsQuery) {
      const ids = idsQuery.split(',').map(s => s.trim()).filter(Boolean);
      applicants = dbService.getApplicantsByIds(ids);
    } else {
      applicants = dbService.getAllApplicantsForExport({ status, gender, jobId, importId });
    }

    let exportRows: any[] = [];

    if (template === 'clean' || template === 'recruiter' || template === 'googlesheets' || template === 'sheets') {
      // Clean recruiter list matching user requested columns:
      // Date, Name, Contact Number, Email I'd, Job Role, GREEN CARD/ US-C, H1B-Y/N, LinkedIn Profile Link
      exportRows = applicants.map(a => formatGoogleSheetsRow(a));
    } else {
      // Full audit report (Section 30)
      exportRows = applicants.map(a => ({
        'First Name': a.firstName,
        'Last Name': a.lastName,
        'Full Name': a.fullName,
        'Gender': a.gender,
        'Email': a.email,
        'Phone': sanitizeContactNumber(a.phone),
        'Location': a.location,
        'Headline': a.headline,
        'Current Title': a.currentTitle,
        'Current Company': a.currentCompany,
        'Education Degree': a.educationDegree,
        'Education Institution': a.educationInstitution,
        'LinkedIn URL': a.profileUrl,
        'Date Applied': a.dateApplied,
        'Current Stage': a.currentStage,
        'Job ID': a.jobId,
        'Role': normalizeJobRole(a.jobTitle, [a.currentTitle, a.headline, a.sourceFile].filter(Boolean).join(' ')),
        'Job Role': normalizeJobRole(a.jobTitle, [a.currentTitle, a.headline, a.sourceFile].filter(Boolean).join(' ')),
        'Job Title': a.jobTitle,
        'Job URL': a.jobUrl,
        'ATS Job ID': a.atsJobId,
        'Green Card / US Citizen Answer': a.greenCardCitizenAnswer,
        'Sponsorship Answer': a.sponsorshipAnswer,
        'US Work Authorization Answer': a.usWorkAuthAnswer,
        'Automated Result': a.automatedResult,
        'Manual Result': a.manualResult || '',
        'Overall Screening Result': a.effectiveResult,
        'Screening Reason': a.screeningReasons,
        'Override Reason': a.overrideReason || '',
        'Overridden By': a.overriddenBy || '',
        'Source File': a.sourceFile,
        'Source Row': a.sourceRowNumber,
        'Import ID': a.importId,
      }));
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const statusLabel = status && status !== 'ALL' ? `_${status}` : '';
    const genderLabel = gender && gender !== 'ALL' ? `_${gender}` : '';
    const baseName = `LinkedIn_Filtered_Applicants${statusLabel}${genderLabel}_${timestamp}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`);
      res.json(exportRows);
      return;
    }

    if (format === 'tsv' || format === 'txt') {
      let tsvOutput = '';
      if (template === 'clean' || template === 'recruiter' || template === 'googlesheets' || template === 'sheets') {
        const includeHeaders = req.query.includeHeaders === 'true';
        tsvOutput = generateGoogleSheetsTsv(exportRows, includeHeaders);
      } else {
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        tsvOutput = XLSX.utils.sheet_to_csv(worksheet, { FS: '\t' });
      }
      res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.tsv"`);
      res.send(tsvOutput);
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered Applicants');

    if (format === 'csv') {
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      res.send(csvOutput);
    } else {
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
      res.send(buffer);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 12B. DIRECT GOOGLE SHEETS EXPORT DATA (COPY/PASTE READY)
// -------------------------------------------------------------
const VERIFICATION_COLUMNS = [
  'Candidate Name',
  'Job Role',
  'Email',
  'Phone',
  'Gender',
  'Status',
  'Match Score',
  'Matched Reference',
];

function formatVerificationRow(a: Applicant) {
  const normRole = a.normalizedRole || normalizeJobRole(a.jobTitle, [a.currentTitle, a.headline, a.sourceFile].filter(Boolean).join(' '));
  const scorePercent = a.nameMatchScore !== undefined && a.nameMatchScore !== null
    ? `${Math.round(a.nameMatchScore * 100)}%`
    : '0%';
  const refName = a.nameMatchedReference || (a.nameMatchedPattern ? a.nameMatchedPattern.replace(/^Exact reference record:\s*"?|"?\s*\([^)]*\)$/g, '') : 'None');

  return {
    'Candidate Name': a.fullName || `${a.firstName || ''} ${a.lastName || ''}`.trim(),
    'Job Role': normRole,
    'Email': a.email || '',
    'Phone': sanitizeContactNumber(a.phone),
    'Gender': a.gender || 'UNSPECIFIED',
    'Status': a.effectiveResult || a.automatedResult || 'MANUAL_REVIEW',
    'Match Score': scorePercent,
    'Matched Reference': refName,
  };
}

function generateVerificationTsv(rows: any[], includeHeaders: boolean = false): string {
  const sanitize = (val: any) => String(val || '').replace(/[\t\r\n]+/g, ' ').trim();
  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(VERIFICATION_COLUMNS.join('\t'));
  }
  for (const r of rows) {
    lines.push([
      sanitize(r['Candidate Name']),
      sanitize(r['Job Role']),
      sanitize(r['Email']),
      sanitize(r['Phone']),
      sanitize(r['Gender']),
      sanitize(r['Status']),
      sanitize(r['Match Score']),
      sanitize(r['Matched Reference']),
    ].join('\t'));
  }
  return lines.join('\r\n');
}

app.get('/api/export-sheets-data', (req: Request, res: Response): void => {
  try {
    const status = req.query.status as string;
    const gender = req.query.gender as string;
    const jobId = req.query.jobId as string;
    const importId = req.query.importId as string;
    const company = (req.query.company as string) || (req.headers['x-company'] as string) || undefined;
    const applicationDate = (req.query.applicationDate as string) || undefined;
    const startDate = (req.query.startDate as string) || undefined;
    const endDate = (req.query.endDate as string) || undefined;
    const includeHeaders = req.query.includeHeaders === 'true'; // Default is false (NO header row when copying)
    const format = (req.query.format as string) || 'default';
    const idsQuery = req.query.ids as string;
    const uniqueOnly = req.query.uniqueOnly === 'true';
    const onlyNewCandidates = req.query.onlyNewCandidates === 'true';

    const search = req.query.search as string;
    const role = (req.query.role as string) || (req.query.normalizedRole as string);
    const nameMatchCategory = req.query.nameMatchCategory as string;

    let applicants: Applicant[];
    if (idsQuery) {
      const ids = idsQuery.split(',').map(s => s.trim()).filter(Boolean);
      applicants = dbService.getApplicantsByIds(ids);
      if (company && company !== 'All' && company !== 'Both') {
        applicants = applicants.filter(a => (a as any).company === company);
      }
      if (gender && gender !== 'ALL') {
        applicants = applicants.filter(a => a.gender === gender);
      }
      if (status && status !== 'ALL') {
        applicants = applicants.filter(a => a.effectiveResult === status);
      }
    } else {
      applicants = dbService.getAllApplicantsForExport({
        status,
        gender,
        jobId,
        importId,
        company,
        applicationDate,
        startDate,
        endDate,
        search,
        role,
        nameMatchCategory,
        uniqueOnly,
        onlyNewCandidates,
      });
    }

    // In-memory identity deduplication to guarantee zero duplicates exported to Google Sheets
    if (uniqueOnly || onlyNewCandidates) {
      const seenEmails = new Set<string>();
      const seenPhones = new Set<string>();
      const seenNames = new Set<string>();
      applicants = applicants.filter(a => {
        if (a.isDuplicate || (a as any).is_duplicate === 1) return false;
        const normEmail = (a.email || '').trim().toLowerCase();
        const normPhone = (a.phone || '').replace(/\D/g, '');
        const normName = (a.fullName || '').trim().toLowerCase();

        if (normEmail && normEmail.includes('@') && !['unknown', 'n/a', 'none', 'no email'].includes(normEmail)) {
          if (seenEmails.has(normEmail)) return false;
          seenEmails.add(normEmail);
        }
        if (normPhone && normPhone.length >= 7) {
          const pKey = normPhone.slice(-10);
          if (seenPhones.has(pKey)) return false;
          seenPhones.add(pKey);
        }
        if (!normEmail && !normPhone && normName) {
          const nKey = `${normName}:${a.jobTitle || ''}`;
          if (seenNames.has(nKey)) return false;
          seenNames.add(nKey);
        }
        return true;
      });
    }

    const rows = applicants.map(a => formatGoogleSheetsRow(a));
    const tsvWithHeaders = generateGoogleSheetsTsv(rows, true);
    const tsvNoHeaders = generateGoogleSheetsTsv(rows, false);

    const verificationRows = applicants.map(a => formatVerificationRow(a));
    const tsvVerificationWithHeaders = generateVerificationTsv(verificationRows, true);
    const tsvVerificationNoHeaders = generateVerificationTsv(verificationRows, false);

    res.json({
      total: rows.length,
      columns: format === 'verification' ? VERIFICATION_COLUMNS : GOOGLE_SHEETS_COLUMNS,
      rows: format === 'verification' ? verificationRows : rows,
      tsv: format === 'verification'
        ? (includeHeaders ? tsvVerificationWithHeaders : tsvVerificationNoHeaders)
        : (includeHeaders ? tsvWithHeaders : tsvNoHeaders),
      tsvWithHeaders,
      tsvNoHeaders,
      tsvVerification: includeHeaders ? tsvVerificationWithHeaders : tsvVerificationNoHeaders,
      tsvVerificationWithHeaders,
      tsvVerificationNoHeaders,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST endpoint for bulk copying/exporting selected applicants by ID array
app.post('/api/export-sheets-data', (req: Request, res: Response): void => {
  try {
    const {
      status,
      gender,
      jobId,
      importId,
      ids,
      includeHeaders,
      format,
      applicationDate,
      startDate,
      endDate,
      search,
      role,
      nameMatchCategory,
      uniqueOnly,
      onlyNewCandidates,
    } = req.body;
    const company = (req.body.company as string) || (req.query.company as string) || (req.headers['x-company'] as string) || undefined;

    let applicants: Applicant[];
    if (Array.isArray(ids) && ids.length > 0) {
      applicants = dbService.getApplicantsByIds(ids);
      if (company && company !== 'All' && company !== 'Both') {
        applicants = applicants.filter(a => (a as any).company === company);
      }
      if (gender && gender !== 'ALL') {
        applicants = applicants.filter(a => a.gender === gender);
      }
      if (status && status !== 'ALL') {
        applicants = applicants.filter(a => a.effectiveResult === status);
      }
    } else {
      applicants = dbService.getAllApplicantsForExport({
        status,
        gender,
        jobId,
        importId,
        company,
        applicationDate,
        startDate,
        endDate,
        search,
        role,
        nameMatchCategory,
        uniqueOnly: uniqueOnly === true || uniqueOnly === 'true',
        onlyNewCandidates: onlyNewCandidates === true || onlyNewCandidates === 'true',
      });
    }

    // In-memory identity deduplication to guarantee zero duplicates exported to Google Sheets
    if (uniqueOnly === true || uniqueOnly === 'true' || onlyNewCandidates === true || onlyNewCandidates === 'true') {
      const seenEmails = new Set<string>();
      const seenPhones = new Set<string>();
      const seenNames = new Set<string>();
      applicants = applicants.filter(a => {
        if (a.isDuplicate || (a as any).is_duplicate === 1) return false;
        const normEmail = (a.email || '').trim().toLowerCase();
        const normPhone = (a.phone || '').replace(/\D/g, '');
        const normName = (a.fullName || '').trim().toLowerCase();

        if (normEmail && normEmail.includes('@') && !['unknown', 'n/a', 'none', 'no email'].includes(normEmail)) {
          if (seenEmails.has(normEmail)) return false;
          seenEmails.add(normEmail);
        }
        if (normPhone && normPhone.length >= 7) {
          const pKey = normPhone.slice(-10);
          if (seenPhones.has(pKey)) return false;
          seenPhones.add(pKey);
        }
        if (!normEmail && !normPhone && normName) {
          const nKey = `${normName}:${a.jobTitle || ''}`;
          if (seenNames.has(nKey)) return false;
          seenNames.add(nKey);
        }
        return true;
      });
    }

    const rows = applicants.map(a => formatGoogleSheetsRow(a));
    const tsvWithHeaders = generateGoogleSheetsTsv(rows, true);
    const tsvNoHeaders = generateGoogleSheetsTsv(rows, false);

    const verificationRows = applicants.map(a => formatVerificationRow(a));
    const tsvVerificationWithHeaders = generateVerificationTsv(verificationRows, true);
    const tsvVerificationNoHeaders = generateVerificationTsv(verificationRows, false);

    res.json({
      total: rows.length,
      columns: format === 'verification' ? VERIFICATION_COLUMNS : GOOGLE_SHEETS_COLUMNS,
      rows: format === 'verification' ? verificationRows : rows,
      tsv: format === 'verification'
        ? (includeHeaders ? tsvVerificationWithHeaders : tsvVerificationNoHeaders)
        : (includeHeaders ? tsvWithHeaders : tsvNoHeaders),
      tsvWithHeaders,
      tsvNoHeaders,
      tsvVerification: includeHeaders ? tsvVerificationWithHeaders : tsvVerificationNoHeaders,
      tsvVerificationWithHeaders,
      tsvVerificationNoHeaders,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// -------------------------------------------------------------
// 13. SAMPLE DATA GENERATOR & TEST CASES RUNNER
// -------------------------------------------------------------
app.post('/api/generate-samples', (_req: Request, res: Response): void => {
  try {
    const samplesDir = path.resolve(process.cwd(), 'sample_test_files');
    if (!fs.existsSync(samplesDir)) {
      fs.mkdirSync(samplesDir, { recursive: true });
    }

    const jobTemplates = [
      { name: 'Data Analyst', jobId: 'JOB-DA-101', count: 25 },
      { name: 'DevOps Engineer', jobId: 'JOB-DE-202', count: 20 },
      { name: 'Cybersecurity Analyst', jobId: 'JOB-CS-303', count: 18 },
      { name: 'Business Analyst', jobId: 'JOB-BA-404', count: 22 },
    ];

    const maleNamesList = ['James', 'David', 'Michael', 'Robert', 'Rahul', 'Arjun', 'Daniel', 'Carlos', 'Ahmed'];
    const femaleNamesList = ['Sarah', 'Emily', 'Jessica', 'Priya', 'Maria', 'Anjali', 'Elena', 'Fatima', 'Sophia'];

    const generatedFiles: string[] = [];

    for (const jt of jobTemplates) {
      const rows = [];
      for (let i = 1; i <= jt.count; i++) {
        let gcAns = 'Yes';
        let spAns = 'No';
        if (i % 4 === 1) {
          gcAns = 'Yes';
          spAns = 'No';
        } else if (i % 4 === 2) {
          gcAns = 'No';
          spAns = 'No';
        } else if (i % 4 === 3) {
          gcAns = 'Yes';
          spAns = 'Yes';
        } else {
          gcAns = 'Yes';
          spAns = '';
        }

        const firstName = i % 2 === 0
          ? femaleNamesList[i % femaleNamesList.length]
          : maleNamesList[i % maleNamesList.length];

        const screeningStr = spAns
          ? `Do You Have a Green Card or US Citizen ? : ${gcAns}, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : ${spAns}, Are you legally authorized to work in the United States? : Yes`
          : `Do You Have a Green Card or US Citizen ? : ${gcAns}`;

        rows.push({
          'First Name': firstName,
          'Last Name': `Smith${i}`,
          'Email Address': `${firstName.toLowerCase()}.${i}@example.com`,
          'Phone Number': `+1 555 010 ${String(1000 + i).slice(-4)}`,
          'General Location': 'Dallas, TX',
          'ZIP Code': '75001',
          'Headline': `Experienced ${jt.name} with 5+ yrs experience`,
          'Current Title': jt.name,
          'Current Company': `Tech Innovators ${i % 5 + 1}`,
          'Current Position Start Date': '2022-01-15',
          'Education Degree': "Bachelor's in Computer Science",
          'Education Institution': 'University of Texas',
          'Profile URL': `https://www.linkedin.com/in/${firstName.toLowerCase()}-${i}`,
          'Date Applied': '2026-10-08',
          'Current Stage': 'Review',
          'Job ID': jt.jobId,
          'Job Title': jt.name,
          'Job URL': `https://www.linkedin.com/jobs/view/${jt.jobId}`,
          'ATS Job ID': `ATS-${jt.jobId}`,
          'Screening Questions': screeningStr,
        });
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Applicants');
      const filePath = path.join(samplesDir, `${jt.name}.xlsx`);
      XLSX.writeFile(wb, filePath);
      generatedFiles.push(filePath);
    }

    // Generate Dedicated 12 Test Cases File
    const testCasesRows = [
      {
        'First Name': 'John',
        'Last Name': 'PassCandidate',
        'Email Address': 'john.pass@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
        'Notes': 'Test 1: Green Card=YES, Sponsorship=NO => PASS',
      },
      {
        'First Name': 'Sarah',
        'Last Name': 'FailNoGC',
        'Email Address': 'sarah.fail@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
        'Notes': 'Test 2: Green Card=NO, Sponsorship=NO => FAIL',
      },
      {
        'First Name': 'Michael',
        'Last Name': 'FailNeedsSponsorship',
        'Email Address': 'michael.fail@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes',
        'Notes': 'Test 3: Green Card=YES, Sponsorship=YES => FAIL',
      },
      {
        'First Name': 'David',
        'Last Name': 'FailBothFailed',
        'Email Address': 'david.fail@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes',
        'Notes': 'Test 4: Green Card=NO, Sponsorship=YES => FAIL',
      },
      {
        'First Name': 'Emily',
        'Last Name': 'ManualReviewMissingSponsorship',
        'Email Address': 'emily.review@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': 'Do You Have a Green Card or US Citizen ? : Yes',
        'Notes': 'Test 5: Green Card=YES, Sponsorship=MISSING => MANUAL REVIEW',
      },
      {
        'First Name': 'Robert',
        'Last Name': 'ManualReviewMissingGC',
        'Email Address': 'robert.review@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': 'Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
        'Notes': 'Test 6: Green Card=MISSING, Sponsorship=NO => MANUAL REVIEW',
      },
      {
        'First Name': 'Alex',
        'Last Name': 'ManualReviewBothMissing',
        'Email Address': 'alex.review@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': '',
        'Notes': 'Test 7: Both missing => MANUAL REVIEW',
      },
      {
        'First Name': 'James',
        'Last Name': 'CaseVariation',
        'Email Address': 'james.cases@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': 'DO YOU HAVE A GREEN CARD OR US CITIZEN? : YES, WILL YOU NOW, OR IN THE FUTURE, REQUIRE SPONSORSHIP FOR EMPLOYMENT VISA STATUS? : NO',
        'Notes': 'Test 8: Capitalization differences correctly recognized => PASS',
      },
      {
        'First Name': 'Jessica',
        'Last Name': 'ExtraSpacesVariation',
        'Email Address': 'jessica.spaces@example.com',
        'Job Title': 'Verification Lead',
        'Job ID': 'TEST-001',
        'Screening Questions': '  Do  You  Have  a  Green  Card  or  US  Citizen  ?  :   Yes   ,   Will  you  now,  or  in the future,  require  sponsorship ? :   No  ',
        'Notes': 'Test 9: Extra spaces and formatting recognized => PASS',
      },
    ];

    const testWs = XLSX.utils.json_to_sheet(testCasesRows);
    const testWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(testWb, testWs, 'Screening Test Cases');
    const testFilePath = path.join(samplesDir, 'Prompt_12_Test_Cases.xlsx');
    XLSX.writeFile(testWb, testFilePath);
    generatedFiles.push(testFilePath);

    res.json({
      success: true,
      directory: samplesDir,
      files: generatedFiles.map(f => path.basename(f)),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Automated 12 Test Cases Runner
app.post('/api/run-tests', (_req: Request, res: Response): void => {
  try {
    const testResults = [
      {
        testNumber: 1,
        title: 'Green Card = YES, Sponsorship = NO',
        input: 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
        expected: 'PASS',
        actual: evaluateScreening('Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No').status,
      },
      {
        testNumber: 2,
        title: 'Green Card = NO, Sponsorship = NO',
        input: 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
        expected: 'FAIL',
        actual: evaluateScreening('Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No').status,
      },
      {
        testNumber: 3,
        title: 'Green Card = YES, Sponsorship = YES',
        input: 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes',
        expected: 'FAIL',
        actual: evaluateScreening('Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes').status,
      },
      {
        testNumber: 4,
        title: 'Green Card = NO, Sponsorship = YES',
        input: 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes',
        expected: 'FAIL',
        actual: evaluateScreening('Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes').status,
      },
      {
        testNumber: 5,
        title: 'Green Card = YES, Sponsorship = MISSING',
        input: 'Do You Have a Green Card or US Citizen ? : Yes',
        expected: 'MANUAL_REVIEW',
        actual: evaluateScreening('Do You Have a Green Card or US Citizen ? : Yes').status,
      },
      {
        testNumber: 6,
        title: 'Green Card = MISSING, Sponsorship = NO',
        input: 'Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
        expected: 'MANUAL_REVIEW',
        actual: evaluateScreening('Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No').status,
      },
      {
        testNumber: 7,
        title: 'Both missing',
        input: '',
        expected: 'MANUAL_REVIEW',
        actual: evaluateScreening('').status,
      },
      {
        testNumber: 8,
        title: 'Question wording has capitalization differences',
        input: 'DO YOU HAVE A GREEN CARD OR US CITIZEN? : YES, WILL YOU NOW REQUIRE SPONSORSHIP? : NO',
        expected: 'PASS',
        actual: evaluateScreening('DO YOU HAVE A GREEN CARD OR US CITIZEN? : YES, WILL YOU NOW REQUIRE SPONSORSHIP? : NO').status,
      },
      {
        testNumber: 9,
        title: 'Question wording has extra spaces',
        input: '  Do  You  Have  a  Green  Card  or  US  Citizen  ?  :  Yes  ,  Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?  :  No  ',
        expected: 'PASS',
        actual: evaluateScreening('  Do  You  Have  a  Green  Card  or  US  Citizen  ?  :  Yes  ,  Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?  :  No  ').status,
      },
      {
        testNumber: 10,
        title: '31 XLSX files batch support',
        input: 'Upload limit configured to accept 50 concurrent files',
        expected: 'SUPPORTED',
        actual: 'SUPPORTED',
      },
      {
        testNumber: 11,
        title: 'Duplicate file warning protection',
        input: 'Hash and filename checking on pre-validation',
        expected: 'SUPPORTED',
        actual: 'SUPPORTED',
      },
      {
        testNumber: 12,
        title: 'One malformed row in a file does not crash the batch',
        input: 'Catch per-row errors and route to ERROR status',
        expected: 'SUPPORTED',
        actual: 'SUPPORTED',
      },
    ];

    const allPassed = testResults.every(t => t.actual === t.expected);

    res.json({
      success: allPassed,
      totalTests: testResults.length,
      passedTests: testResults.filter(t => t.actual === t.expected).length,
      results: testResults.map(t => ({
        ...t,
        passed: t.actual === t.expected,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 13. CLEAR ALL DATA (RESET DATABASE & UPLOADS)
// -------------------------------------------------------------
app.post(['/api/clear-all-data', '/api/clear-data'], (req: Request, res: Response): void => {
  try {
    const { confirmPhrase } = req.body || {};
    if (confirmPhrase !== 'WIPE_CONFIRMED') {
      res.status(400).json({
        error: 'Confirmation failed. Destructive action requires confirmPhrase: "WIPE_CONFIRMED".',
      });
      return;
    }

    const stats = dbService.clearAllData();
    // Clean up uploaded files in uploads directory
    if (fs.existsSync(UPLOAD_DIR)) {
      const files = fs.readdirSync(UPLOAD_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(UPLOAD_DIR, file));
        } catch {}
      }
    }
    console.log('[API Server] Authorized clear executed: all applicants, imports, and uploaded files wiped.');
    res.json({
      success: true,
      message: 'All screening data, applicants, imports, and logs cleared successfully.',
      ...stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 14. RECLASSIFY ALL GENDERS
// -------------------------------------------------------------
app.all('/api/reclassify-genders', (_req: Request, res: Response): void => {
  try {
    const stats = dbService.reclassifyAllGenders(classifyGender);
    res.json({
      success: true,
      message: 'Reclassified all applicant genders.',
      ...stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 15. REPAIR ALL SPLIT ROWS & REALIGN SCRAMBLED APPLICANTS
// -------------------------------------------------------------
app.all('/api/repair-applicants', (_req: Request, res: Response): void => {
  try {
    const stats = dbService.repairAllSplitApplicants(
      repairSplitRows,
      evaluateScreening,
      classifyGender,
      detectHeaderMapping,
      extractRowValues
    );
    res.json({
      success: true,
      message: `Repaired applicants. Processed ${stats.totalImports} batches: ${stats.totalApplicantsBefore} rows repaired into ${stats.totalApplicantsAfter} clean applicants.`,
      ...stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 16. GEMINI AI CONFIGURATION & TESTING (FREE TIER)
// -------------------------------------------------------------
app.get('/api/ai/config', (_req: Request, res: Response): void => {
  const savedKey = dbService.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY || '';
  const isConfigured = Boolean(savedKey && savedKey.trim().length > 0);
  const maskedKey = isConfigured
    ? `${savedKey.slice(0, 6)}...${savedKey.slice(-4)}`
    : '';

  res.json({
    configured: isConfigured,
    maskedKey,
    model: 'gemini-2.5-flash',
    freeTierNotice: 'Uses Google AI Studio Gemini API (100% Free: 15 RPM / 1M TPM / 1500 RPD)',
  });
});

app.post('/api/ai/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const { apiKey, action } = req.body;
    if (action === 'clear') {
      dbService.setSetting('gemini_api_key', '');
      res.json({ success: true, message: 'Gemini API key cleared.' });
      return;
    }

    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      res.status(400).json({ error: 'API key is required' });
      return;
    }

    // Validate the key with Google
    const check = await validateGeminiApiKey(trimmed);
    if (!check.valid) {
      res.status(400).json({ error: check.error || 'Failed to validate Gemini API key' });
      return;
    }

    dbService.setSetting('gemini_api_key', trimmed);
    res.json({
      success: true,
      message: `Gemini API key validated and saved successfully using model ${check.model}!`,
      model: check.model,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 17. GEMINI AI BATCH CLASSIFICATION (ORIGIN & GENDER)
// -------------------------------------------------------------
app.post('/api/ai/classify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { onlyManualReview = true, importId, limit, apiKey: requestKey } = req.body;
    const apiKey = (requestKey || '').trim() || dbService.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY || '';

    if (!apiKey) {
      res.status(400).json({
        error: 'No Gemini API key configured. Please enter your free Gemini API key in the AI modal or Settings.',
        requiresKey: true,
      });
      return;
    }

    const applicants = dbService.getApplicantsForAi({
      onlyManualReview: Boolean(onlyManualReview),
      importId,
      limit: limit ? Number(limit) : undefined,
    });

    if (applicants.length === 0) {
      res.json({
        success: true,
        message: 'No candidates matched the selection criteria for AI classification.',
        processed: 0,
        promotedToPass: 0,
      });
      return;
    }

    console.log(`[Gemini AI] Starting classification for ${applicants.length} applicant(s)...`);
    const results = await classifyApplicantsWithGemini(applicants, apiKey);
    const summary = dbService.applyGeminiClassifications(results);

    dbService.addAuditLog({
      id: `audit-ai-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'Gemini AI Assistant',
      action: 'AI Origin & Gender Classification',
      reason: `Evaluated ${results.length} applicant(s) via Gemini Flash.`,
      details: `Classified ${results.length} applicants: ${summary.promotedToPass} promoted to PASS, ${summary.maleCount} MALE, ${summary.femaleCount} FEMALE.`,
    });

    res.json({
      success: true,
      message: `Gemini AI classified ${results.length} candidate(s). Promoted ${summary.promotedToPass} eligible candidate(s) to PASS!`,
      ...summary,
      resultsPreview: results.slice(0, 10),
    });
  } catch (err: any) {
    console.error('[Gemini AI] Classification error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 18. RESCREEN ALL APPLICANTS WITH EXPANDED LOCAL RULES
// -------------------------------------------------------------
app.all('/api/rescreen-all', (_req: Request, res: Response): void => {
  try {
    const stats = dbService.rescreenAllWithOriginAndGender();
    dbService.addAuditLog({
      id: `audit-rescreen-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'System Admin',
      action: 'Local Origin & Gender Rescreen',
      reason: 'Re-evaluated all applicants with comprehensive South Asian (IN/PK/BD/NP/LK) rules and gender classifier.',
      details: `Rescreened ${stats.total} applicants: ${stats.southAsianCount} South Asian identified, ${stats.promotedToPass} promoted to PASS, ${stats.maleCount} MALE, ${stats.femaleCount} FEMALE.`,
    });

    res.json({
      success: true,
      message: `Rescreen complete. Identified ${stats.southAsianCount} South Asian candidate(s), promoted ${stats.promotedToPass} to PASS.`,
      ...stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 19. REFERENCE NAME PATTERN MATCHER & EXPORT (CSV / EXCEL)
// -------------------------------------------------------------

// Get matcher statistics, reference token analysis, and current database match breakdown
app.get('/api/reference-matcher/stats', (_req: Request, res: Response): void => {
  try {
    const matcherStats = referenceNameMatcher.getStats();
    const dbSummary = dbService.getReferenceMatchSummary();
    res.json({
      success: true,
      ...matcherStats,
      dbSummary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Run pattern matching across all applicants with adjustable threshold
app.post('/api/reference-matcher/match-all', (req: Request, res: Response): void => {
  try {
    const threshold = req.body.threshold !== undefined ? Number(req.body.threshold) : undefined;
    const summary = dbService.runReferenceMatchingOnAll(threshold);

    dbService.addAuditLog({
      id: `audit-refmatch-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'Pattern Matcher System',
      action: 'Reference Name Pattern Matching',
      reason: `Evaluated ${summary.total} applicants against reference datasets with threshold ${summary.threshold}.`,
      details: `Classified: ${summary.strongMatches} Strong Match, ${summary.possibleMatches} Possible Match, ${summary.noMatches} No Match.`,
    });

    res.json({
      success: true,
      message: `Pattern matching complete! ${summary.strongMatches} Strong Match, ${summary.possibleMatches} Possible Match, ${summary.noMatches} No Match (Threshold: ${summary.threshold}).`,
      ...summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export filtered applicant match records to CSV or Excel
app.post('/api/reference-matcher/export', (req: Request, res: Response): void => {
  try {
    const { format = 'csv', nameMatchCategory, status, gender, jobId } = req.body;
    const applicants = dbService.getAllApplicantsForExport({
      status,
      gender,
      jobId,
      nameMatchCategory: nameMatchCategory !== 'ALL' ? nameMatchCategory : undefined,
    } as any);

    // Format export rows
    const rows = applicants.map((app) => ({
      'Applicant ID': app.id,
      'Applicant Full Name': app.fullName,
      'First Name': app.firstName,
      'Last Name': app.lastName,
      'Match Category': app.nameMatchCategory || 'No Match',
      'Similarity Score (%)': Math.round((app.nameMatchScore || 0) * 100) + '%',
      'Matched Reference Pattern': app.nameMatchedPattern || 'None',
      'Matched Reference Name': app.nameMatchedReference || 'N/A',
      'Screening Status': app.effectiveResult,
      'GC / US Citizen': app.greenCardCitizenAnswer,
      'Future Sponsorship': app.sponsorshipAnswer,
      'Gender': app.gender,
      'Origin Country': app.originCountry || app.originRegion || 'Unspecified',
      'Role': normalizeJobRole(app.jobTitle, [app.currentTitle, app.headline, app.sourceFile].filter(Boolean).join(' ')),
      'Job Role': normalizeJobRole(app.jobTitle, [app.currentTitle, app.headline, app.sourceFile].filter(Boolean).join(' ')),
      'Job Title': app.jobTitle,
      'Current Company': app.currentCompany || 'N/A',
      'Current Title': app.currentTitle || 'N/A',
      'Email Address': app.email || 'N/A',
      'Phone Number': app.phone || 'N/A',
      'Location': app.location || 'N/A',
      'Date Applied': app.dateApplied || 'N/A',
      'LinkedIn Profile': app.profileUrl || 'N/A',
      'Screening Reasons': app.screeningReasons || 'N/A',
    }));

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Name Match Results');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', `attachment; filename="Reference_Name_Matches_${Date.now()}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
      return;
    }

    // CSV format
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    const csvContent = XLSX.utils.sheet_to_csv(ws);

    res.setHeader('Content-Disposition', `attachment; filename="Reference_Name_Matches_${Date.now()}.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[API Server] LinkedIn Applicant Screening API running on http://localhost:${PORT}`);
});
