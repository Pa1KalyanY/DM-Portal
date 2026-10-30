export type ScreeningStatus = 'PASS' | 'FAIL' | 'MANUAL_REVIEW' | 'ERROR';
export type AnswerValue = 'YES' | 'NO' | 'MISSING' | 'UNCLEAR';

export interface ParsedScreeningInfo {
  greenCardCitizenAnswer: AnswerValue;
  greenCardCitizenRaw: string;
  greenCardCitizenStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
  futureSponsorshipAnswer: AnswerValue;
  futureSponsorshipRaw: string;
  futureSponsorshipStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
  usWorkAuthAnswer: AnswerValue;
  usWorkAuthRaw: string;
  usWorkAuthStatus?: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
  originResult?: {
    origin: 'SOUTH_ASIAN' | 'UNCERTAIN' | 'OTHER';
    countryMatch?: string;
    confidence: number;
    matchReason: string;
    isSouthAsian: boolean;
  };
  status: ScreeningStatus;
  reasons: string[];
  rawText: string;
  allParsedPairs: { question: string; answer: string; normalizedKey?: string }[];
}

export type NameMatchCategory = 'Strong Match' | 'Possible Match' | 'No Match';

export interface Applicant {
  id: string;
  importId: string;
  sourceFile: string;
  sourceWorksheet: string;
  sourceRowNumber: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  zipCode: string;
  headline: string;
  currentTitle: string;
  currentCompany: string;
  currentPositionStartDate: string;
  educationDegree: string;
  educationInstitution: string;
  profileUrl: string;
  dateApplied: string;
  currentStage: string;
  jobId: string;
  jobTitle: string;
  normalizedRole?: string;
  jobUrl: string;
  atsJobId: string;
  minSalary: string;
  maxSalary: string;
  currencyCode: string;
  compensationPeriod: string;
  hiringProjectId: string;
  hiringProjectTitle: string;
  contractId: string;
  contractName: string;
  gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED';
  genderConfidence?: number;
  originRegion?: 'SOUTH_ASIAN' | 'UNCERTAIN' | 'OTHER';
  originCountry?: string;
  originMatchReason?: string;
  nameMatchCategory?: NameMatchCategory;
  nameMatchScore?: number;
  nameMatchedPattern?: string | null;
  nameMatchedReference?: string | null;
  rawScreeningQuestions: string;
  greenCardCitizenAnswer: AnswerValue;
  sponsorshipAnswer: AnswerValue;
  usWorkAuthAnswer: AnswerValue;
  automatedResult: ScreeningStatus;
  manualResult: ScreeningStatus | null;
  effectiveResult: ScreeningStatus;
  screeningReasons: string;
  overrideReason: string | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
  rawRowData: Record<string, any>;
  createdAt: string;
  company?: 'AaraTech' | 'ClinisolTech';
  batchId?: string;
  applicationDate?: string;
  assignedRecruiter?: string | null;
  distributedAt?: string | null;
  isDuplicate?: boolean;
  duplicateReason?: string | null;
  masterPersonId?: string | null;
  linkStatus?: string | null;
  linkError?: string | null;
  reviewDecision?: 'APPROVED' | 'REJECTED' | 'PENDING' | null;
  reviewNotes?: string | null;
}

export interface ImportFileRecord {
  filename: string;
  fileSize: number;
  rowCount: number;
  jobId: string;
  jobTitle: string;
  status: 'READY' | 'PROCESSED' | 'ERROR';
  errorMessage?: string;
  hash?: string;
}

export interface ImportRecord {
  id: string;
  importCode: string; // e.g. IMP-00001
  batchName?: string; // Given batch/requisition name (e.g. CY-1 12/10)
  uploadedAt: string;
  uploadedBy: string;
  fileCount: number;
  totalApplicants: number;
  passedCount: number;
  failedCount: number;
  manualReviewCount: number;
  errorCount: number;
  status: 'Completed' | 'Processing' | 'Failed';
  files: ImportFileRecord[];
  company?: 'AaraTech' | 'ClinisolTech';
  applicationDate?: string;
  jobSlots?: string[];
  activeWorkingBatch?: boolean;
}

export type CompanyWorkspace = 'AaraTech' | 'ClinisolTech';

export interface Recruiter {
  id: string;
  company: 'AaraTech' | 'ClinisolTech';
  name: string;
  email: string;
  role?: string;
  active: boolean;
  leadsCount?: number;
  createdAt?: string;
}

export interface JobSlot {
  id: string;
  company: 'AaraTech' | 'ClinisolTech';
  jobId: string;
  jobTitle: string;
  status: 'Active' | 'Inactive';
  totalApplicants?: number;
  passedCount?: number;
  failedCount?: number;
  manualReviewCount?: number;
}

export interface ReportAnalytics {
  timeframe: 'daily' | 'weekly' | 'monthly' | 'all';
  date: string;
  company: 'AaraTech' | 'ClinisolTech';
  totalApplications: number;
  passedCount: number;
  failedCount: number;
  manualReviewCount: number;
  approvedLeadsCount: number;
  potentialDuplicatesCount: number;
  distributedLeadsCount: number;
  passRate: number;
  recruiterDistribution: Array<{
    recruiterName: string;
    leadsAssigned: number;
    email: string;
    lastDistributedAt?: string;
  }>;
  jobBreakdown: Array<{
    jobId: string;
    jobTitle: string;
    total: number;
    passed: number;
    failed: number;
    manualReview: number;
    approved: number;
  }>;
  dailyTrend: Array<{
    date: string;
    total: number;
    passed: number;
    failed: number;
    manualReview: number;
  }>;
}

export interface ScreeningRule {
  id: string;
  name: string;
  description: string;
  requiredAnswer: 'YES' | 'NO';
  status: 'ACTIVE' | 'INACTIVE';
  isMandatory: boolean;
  questionKey: 'GREEN_CARD_CITIZEN' | 'FUTURE_SPONSORSHIP' | 'US_WORK_AUTH';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  applicantId?: string;
  applicantName?: string;
  previousResult?: string;
  newResult?: string;
  reason: string;
  details?: string;
}

export interface DashboardStats {
  filesProcessed: number;
  applicantsProcessed: number;
  totalApplicants?: number;
  passedCount: number;
  failedCount: number;
  manualReviewCount: number;
  errorCount: number;
  greenCardYes: number;
  greenCardNo: number;
  greenCardMissing: number;
  sponsorshipNo: number;
  sponsorshipYes: number;
  sponsorshipMissing: number;
  maleCount: number;
  femaleCount: number;
  unspecifiedGenderCount: number;
  southAsianCount?: number;
  otherOriginCount?: number;
  topJobs: {
    jobTitle: string;
    jobId: string;
    company?: string;
    total: number;
    passed: number;
    failed: number;
    manualReview: number;
  }[];
  recentImports: ImportRecord[];
  company?: 'AaraTech' | 'ClinisolTech';
  approvedLeadsCount?: number;
  duplicateCount?: number;
  distributedCount?: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  gender?: string;
  origin?: string;
  nameMatchCategory?: string;
  normalizedRole?: string;
  jobId?: string;
  jobTitle?: string;
  company?: string;
  stage?: string;
  location?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasLinkedIn?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  batchId?: string;
  applicationDate?: string;
  startDate?: string;
  endDate?: string;
  sourceApplicationDate?: string;
  isDuplicate?: boolean;
  assignedRecruiter?: string;
  masterPersonId?: string;
  linkStatus?: string;
  activeBatchOnly?: boolean;
}

export interface TabCounts {
  pass: number;
  fail: number;
  review: number;
  all: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
