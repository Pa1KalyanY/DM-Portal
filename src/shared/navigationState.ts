// Comprehensive Navigation & URL State Management for DM Portal
// Supports bookmarkable, shareable URL query parameters and safe browser state restoration on refresh.

import { CompanyName } from '../types/masterDatabase';

export type MainNavSection =
  | 'home'
  | 'marketing'
  | 'settings'
  | 'recruitment-overview'
  | 'filter'
  | 'master-candidates'
  | 'reports'
  | 'company-settings';

export interface NavigationState {
  section: MainNavSection;
  company: CompanyName;
  candidateId?: string | null;
  candidateTab?: string;

  // Recruitment: LinkedIn Application Filter (8-Step Pipeline)
  slot?: string;
  tab?: 'PASS' | 'UNIQUE_PASSED' | 'ALL_PASSED' | 'MANUAL_REVIEW' | 'FAIL' | 'DUPLICATE' | 'ALL';
  batchId?: string;
  viewMode?: 'working_batch' | 'permanent_history';
  method?: 'upload' | 'paste';
  date?: string;
  resultsDate?: string;
  historyStartDate?: string;
  historyEndDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  gender?: string;
  nameMatch?: string;
  role?: string;

  // Recruitment: Periodic Reports
  reportPeriod?: 'daily' | 'weekly' | 'monthly' | 'custom' | 'all';
  reportDate?: string;
  startDate?: string;
  endDate?: string;

  // Recruitment: Master Candidates
  masterStatus?: string;
  masterOwner?: string;
  masterGender?: string;
  masterContact?: string;
  masterTechnology?: string;
  masterRepeatFilter?: string;
  masterH1b?: string;
  masterGreenCard?: string;
  masterTab?: 'completed' | 'incomplete' | 'upload';
  masterPage?: number;
  masterSortBy?: string;
  masterSortOrder?: 'asc' | 'desc';

  // Shared DM Portal: Marketing Operations
  mktTab?: 'attendance' | 'tasks' | 'content' | 'reports' | 'team';
  mktFilter?: 'All' | 'AaraTech' | 'ClinisolTech' | 'Shared';
  mktMemberId?: string;
}

const STORAGE_KEYS = {
  NAV_SECTION: 'aat_nav_section',
  RECRUITMENT_COMPANY: 'aat_recruitment_company',
  WORKSPACE_SELECTED: 'aat_workspace_selected',
  ACTIVE_AREA: 'aat_active_area',
  NAV_STATE_BACKUP: 'aat_nav_state_backup_v2',
  UNSAVED_PASTE_TEXT: 'aat_unsaved_paste_text',
  UNSAVED_PASTE_LABEL: 'aat_unsaved_paste_label',
};

export const AARATECH_JOB_SLOTS = [
  'AT-001', 'AT-002', 'AT-003', 'AT-004', 'AT-005',
  'AT-006', 'AT-007', 'AT-008', 'AT-009', 'AT-010',
  'AT-011', 'AT-012', 'AT-013', 'AT-014', 'AT-015',
  'AT-016', 'AT-017', 'AT-018', 'AT-019', 'AT-020', 'AT-021',
];

export const CLINISOLTECH_JOB_SLOTS = [
  'CT-001', 'CT-002', 'CT-003', 'CT-004', 'CT-005',
  'CT-006', 'CT-007', 'CT-008', 'CT-009', 'CT-010',
];

export const VALID_SECTIONS: MainNavSection[] = [
  'home',
  'marketing',
  'settings',
  'recruitment-overview',
  'filter',
  'master-candidates',
  'reports',
  'company-settings',
];

/**
 * Parses query parameters from window.location.search
 */
export function readNavigationStateFromUrl(): Partial<NavigationState> {
  if (typeof window === 'undefined') return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const parsed: Partial<NavigationState> = {};

    const rawSection = params.get('section') || params.get('view') || params.get('page');
    if (rawSection && VALID_SECTIONS.includes(rawSection as MainNavSection)) {
      parsed.section = rawSection as MainNavSection;
    }

    const rawCompany = params.get('company');
    if (rawCompany === 'AaraTech' || rawCompany === 'ClinisolTech') {
      parsed.company = rawCompany;
    }

    if (params.has('candId')) {
      parsed.candidateId = params.get('candId') || null;
    }
    if (params.has('candTab')) {
      parsed.candidateTab = params.get('candTab') || undefined;
    }

    // Filter Workspace
    if (params.has('slot')) parsed.slot = params.get('slot') || 'ALL';
    const rawTab = params.get('tab');
    if (rawTab && ['PASS', 'UNIQUE_PASSED', 'ALL_PASSED', 'MANUAL_REVIEW', 'FAIL', 'DUPLICATE', 'ALL'].includes(rawTab)) {
      parsed.tab = rawTab as any;
    }
    if (params.has('batchId')) parsed.batchId = params.get('batchId') || undefined;
    const rawViewMode = params.get('viewMode');
    if (rawViewMode === 'working_batch' || rawViewMode === 'permanent_history') {
      parsed.viewMode = rawViewMode;
    }
    const rawMethod = params.get('method');
    if (rawMethod === 'upload' || rawMethod === 'paste') {
      parsed.method = rawMethod;
    }
    if (params.has('date')) parsed.date = params.get('date') || undefined;
    if (params.has('rDate') || params.has('resultsDate')) parsed.resultsDate = params.get('rDate') || params.get('resultsDate') || undefined;
    if (params.has('hStart') || params.has('historyStartDate')) parsed.historyStartDate = params.get('hStart') || params.get('historyStartDate') || undefined;
    if (params.has('hEnd') || params.has('historyEndDate')) parsed.historyEndDate = params.get('hEnd') || params.get('historyEndDate') || undefined;
    if (params.has('search')) parsed.search = params.get('search') || '';
    if (params.has('p')) {
      const p = parseInt(params.get('p') || '1', 10);
      if (!isNaN(p) && p > 0) parsed.page = p;
    }
    if (params.has('ps')) {
      const ps = parseInt(params.get('ps') || '25', 10);
      if (!isNaN(ps) && ps > 0) parsed.pageSize = ps;
    }
    if (params.has('gender')) parsed.gender = params.get('gender') || 'ALL';
    if (params.has('nameMatch')) parsed.nameMatch = params.get('nameMatch') || 'ALL';
    if (params.has('role')) parsed.role = params.get('role') || 'ALL';

    // Reports
    const rawPeriod = params.get('reportPeriod') || params.get('period');
    if (rawPeriod && ['daily', 'weekly', 'monthly', 'custom'].includes(rawPeriod)) {
      parsed.reportPeriod = rawPeriod as any;
    }
    if (params.has('reportDate')) parsed.reportDate = params.get('reportDate') || undefined;
    if (params.has('startDate')) parsed.startDate = params.get('startDate') || undefined;
    if (params.has('endDate')) parsed.endDate = params.get('endDate') || undefined;

    // Master Candidates
    if (params.has('mStatus')) parsed.masterStatus = params.get('mStatus') || 'All';
    if (params.has('mOwner')) parsed.masterOwner = params.get('mOwner') || 'All';
    if (params.has('mGender')) parsed.masterGender = params.get('mGender') || 'All';
    if (params.has('mContact')) parsed.masterContact = params.get('mContact') || 'all';
    if (params.has('mTech')) parsed.masterTechnology = params.get('mTech') || undefined;
    if (params.has('mRepeat')) parsed.masterRepeatFilter = params.get('mRepeat') || undefined;
    if (params.has('mH1b')) parsed.masterH1b = params.get('mH1b') || undefined;
    if (params.has('mGc')) parsed.masterGreenCard = params.get('mGc') || undefined;
    const rawMTab = params.get('mTab');
    if (rawMTab === 'completed' || rawMTab === 'incomplete' || rawMTab === 'upload') parsed.masterTab = rawMTab;
    if (params.has('mPage')) {
      const mp = parseInt(params.get('mPage') || '1', 10);
      if (!isNaN(mp) && mp > 0) parsed.masterPage = mp;
    }
    if (params.has('mSort')) parsed.masterSortBy = params.get('mSort') || undefined;
    if (params.has('mOrder')) {
      const mo = params.get('mOrder');
      if (mo === 'asc' || mo === 'desc') parsed.masterSortOrder = mo;
    }

    // Marketing Workspace
    const rawMktTab = params.get('mktTab');
    if (rawMktTab && ['attendance', 'tasks', 'content', 'reports', 'team'].includes(rawMktTab)) {
      parsed.mktTab = rawMktTab as any;
    }
    const rawMktFilter = params.get('mktFilter');
    if (rawMktFilter && ['All', 'AaraTech', 'ClinisolTech', 'Shared'].includes(rawMktFilter)) {
      parsed.mktFilter = rawMktFilter as any;
    }
    if (params.has('mktMember')) parsed.mktMemberId = params.get('mktMember') || undefined;

    return parsed;
  } catch (err) {
    console.warn('[NavigationState] Failed to parse URL:', err);
    return {};
  }
}

/**
 * Reads backup state from session storage / local storage
 */
export function readPersistedBackupState(): Partial<NavigationState> {
  if (typeof window === 'undefined') return {};
  try {
    const rawSession = sessionStorage.getItem(STORAGE_KEYS.NAV_STATE_BACKUP);
    if (rawSession) {
      return JSON.parse(rawSession);
    }
    const rawLocal = localStorage.getItem(STORAGE_KEYS.NAV_STATE_BACKUP);
    if (rawLocal) {
      return JSON.parse(rawLocal);
    }
  } catch (err) {
    console.warn('[NavigationState] Failed to read backup state:', err);
  }
  return {};
}

/**
 * Validates company & job-slot access to ensure no cross-contamination
 */
export function sanitizeCompanyAndSlot(
  company: CompanyName,
  slot?: string
): { company: CompanyName; slot: string } {
  const safeCompany: CompanyName =
    company === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech';

  let safeSlot = slot || 'ALL';
  if (safeSlot !== 'ALL') {
    const validSlots = safeCompany === 'AaraTech' ? AARATECH_JOB_SLOTS : CLINISOLTECH_JOB_SLOTS;
    if (!validSlots.includes(safeSlot)) {
      // Incompatible job slot from previous company selection -> reset safely
      safeSlot = 'ALL';
    }
  }

  return { company: safeCompany, slot: safeSlot };
}

/**
 * Updates browser URL query parameters and storage mirrors
 */
export function syncNavigationToUrlAndStorage(
  state: NavigationState,
  mode: 'replace' | 'push' = 'replace'
): void {
  if (typeof window === 'undefined') return;
  try {
    const currentParams = new URLSearchParams(window.location.search);

    // Section & Company
    currentParams.set('section', state.section);
    currentParams.set('company', state.company);

    // Candidate Drawer
    if (state.candidateId) {
      currentParams.set('candId', state.candidateId);
      if (state.candidateTab) currentParams.set('candTab', state.candidateTab);
      else currentParams.delete('candTab');
    } else {
      currentParams.delete('candId');
      currentParams.delete('candTab');
    }

    // Filter Workspace Specifics
    if (state.section === 'filter') {
      if (state.slot && state.slot !== 'ALL') currentParams.set('slot', state.slot);
      else currentParams.delete('slot');

      if (state.tab && state.tab !== 'PASS') currentParams.set('tab', state.tab);
      else currentParams.delete('tab');

      if (state.batchId) currentParams.set('batchId', state.batchId);
      else currentParams.delete('batchId');

      if (state.viewMode && state.viewMode !== 'working_batch') currentParams.set('viewMode', state.viewMode);
      else currentParams.delete('viewMode');

      if (state.method && state.method !== 'upload') currentParams.set('method', state.method);
      else currentParams.delete('method');

      if (state.date) currentParams.set('date', state.date);
      else currentParams.delete('date');

      if (state.resultsDate && state.resultsDate !== 'ALL') currentParams.set('rDate', state.resultsDate);
      else currentParams.delete('rDate');

      if (state.historyStartDate) currentParams.set('hStart', state.historyStartDate);
      else currentParams.delete('hStart');

      if (state.historyEndDate) currentParams.set('hEnd', state.historyEndDate);
      else currentParams.delete('hEnd');

      if (state.search) currentParams.set('search', state.search);
      else currentParams.delete('search');

      if (state.page && state.page > 1) currentParams.set('p', String(state.page));
      else currentParams.delete('p');

      if (state.pageSize && state.pageSize !== 25) currentParams.set('ps', String(state.pageSize));
      else currentParams.delete('ps');

      if (state.gender && state.gender !== 'ALL') currentParams.set('gender', state.gender);
      else currentParams.delete('gender');

      if (state.nameMatch && state.nameMatch !== 'ALL') currentParams.set('nameMatch', state.nameMatch);
      else currentParams.delete('nameMatch');

      if (state.role && state.role !== 'ALL') currentParams.set('role', state.role);
      else currentParams.delete('role');
    }

    // Reports Specifics
    if (state.section === 'reports') {
      if (state.reportPeriod && state.reportPeriod !== 'daily') currentParams.set('reportPeriod', state.reportPeriod);
      else currentParams.delete('reportPeriod');

      if (state.reportDate) currentParams.set('reportDate', state.reportDate);
      else currentParams.delete('reportDate');

      if (state.startDate) currentParams.set('startDate', state.startDate);
      else currentParams.delete('startDate');

      if (state.endDate) currentParams.set('endDate', state.endDate);
      else currentParams.delete('endDate');
    }

    // Master Candidates Specifics
    if (state.section === 'master-candidates') {
      if (state.masterStatus && state.masterStatus !== 'All') currentParams.set('mStatus', state.masterStatus);
      else currentParams.delete('mStatus');

      if (state.masterOwner && state.masterOwner !== 'All') currentParams.set('mOwner', state.masterOwner);
      else currentParams.delete('mOwner');

      if (state.masterGender && state.masterGender !== 'All') currentParams.set('mGender', state.masterGender);
      else currentParams.delete('mGender');

      if (state.masterContact && state.masterContact !== 'all') currentParams.set('mContact', state.masterContact);
      else currentParams.delete('mContact');

      if (state.masterTechnology && state.masterTechnology !== 'All') currentParams.set('mTech', state.masterTechnology);
      else currentParams.delete('mTech');

      if (state.masterRepeatFilter && state.masterRepeatFilter !== 'all') currentParams.set('mRepeat', state.masterRepeatFilter);
      else currentParams.delete('mRepeat');

      if (state.masterH1b && state.masterH1b !== 'All') currentParams.set('mH1b', state.masterH1b);
      else currentParams.delete('mH1b');

      if (state.masterGreenCard && state.masterGreenCard !== 'All') currentParams.set('mGc', state.masterGreenCard);
      else currentParams.delete('mGc');

      if (state.masterTab && state.masterTab !== 'completed') currentParams.set('mTab', state.masterTab);
      else currentParams.delete('mTab');

      if (state.masterPage && state.masterPage > 1) currentParams.set('mPage', String(state.masterPage));
      else currentParams.delete('mPage');

      if (state.masterSortBy) currentParams.set('mSort', state.masterSortBy);
      else currentParams.delete('mSort');

      if (state.masterSortOrder) currentParams.set('mOrder', state.masterSortOrder);
      else currentParams.delete('mOrder');
    }

    // Marketing Specifics
    if (state.section === 'marketing') {
      if (state.mktTab && state.mktTab !== 'attendance') currentParams.set('mktTab', state.mktTab);
      else currentParams.delete('mktTab');

      if (state.mktFilter && state.mktFilter !== 'All') currentParams.set('mktFilter', state.mktFilter);
      else currentParams.delete('mktFilter');

      if (state.mktMemberId) currentParams.set('mktMember', state.mktMemberId);
      else currentParams.delete('mktMember');
    }

    const newQuery = currentParams.toString();
    const newRelativePathQuery = newQuery ? `${window.location.pathname}?${newQuery}` : window.location.pathname;

    if (mode === 'push') {
      window.history.pushState(state, '', newRelativePathQuery);
    } else {
      window.history.replaceState(state, '', newRelativePathQuery);
    }

    // Keep localStorage & sessionStorage backup updated
    localStorage.setItem(STORAGE_KEYS.NAV_SECTION, state.section);
    localStorage.setItem(STORAGE_KEYS.RECRUITMENT_COMPANY, state.company);
    sessionStorage.setItem(STORAGE_KEYS.NAV_STATE_BACKUP, JSON.stringify(state));
    localStorage.setItem(STORAGE_KEYS.NAV_STATE_BACKUP, JSON.stringify(state));
  } catch (err) {
    console.warn('[NavigationState] Failed to sync URL & storage:', err);
  }
}

// Unsaved Paste Area Safety Storage
export function getUnsavedPasteDraft(): { text: string; label: string } {
  if (typeof window === 'undefined') return { text: '', label: '' };
  try {
    const text = sessionStorage.getItem(STORAGE_KEYS.UNSAVED_PASTE_TEXT) || '';
    const label = sessionStorage.getItem(STORAGE_KEYS.UNSAVED_PASTE_LABEL) || '';
    return { text, label };
  } catch {
    return { text: '', label: '' };
  }
}

export function saveUnsavedPasteDraft(text: string, label: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (text) {
      sessionStorage.setItem(STORAGE_KEYS.UNSAVED_PASTE_TEXT, text);
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.UNSAVED_PASTE_TEXT);
    }
    if (label) {
      sessionStorage.setItem(STORAGE_KEYS.UNSAVED_PASTE_LABEL, label);
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.UNSAVED_PASTE_LABEL);
    }
  } catch (err) {
    console.warn('[NavigationState] Failed to save paste draft:', err);
  }
}

export function clearUnsavedPasteDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEYS.UNSAVED_PASTE_TEXT);
    sessionStorage.removeItem(STORAGE_KEYS.UNSAVED_PASTE_LABEL);
    localStorage.removeItem(STORAGE_KEYS.UNSAVED_PASTE_TEXT);
    localStorage.removeItem(STORAGE_KEYS.UNSAVED_PASTE_LABEL);
  } catch {}
}
