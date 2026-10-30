/**
 * DM-MSDB-V1 Version Specification
 * Milestone release marking the unified Master Candidate Database with:
 * - Dual-company isolation (AaraTech & ClinisolTech)
 * - Multi-application deduplication & canonical candidate profiles
 * - Automatic merged H1B/Resume Link column splitting
 * - Accurate subheader intelligence (Green Card / US-C & H1B Visa mapping)
 * - Chronological recruiter feedback & contact attempt tracking
 * - Safe rendering with React ErrorBoundary
 */

export const APP_VERSION_CODE = 'DM-MSDB-V1';
export const APP_VERSION_NAME = 'DM Portal: Master Database V1';
export const APP_VERSION_DATE = '2026-10-30';

export interface VersionInfo {
  code: string;
  name: string;
  date: string;
  features: string[];
}

export const CURRENT_VERSION: VersionInfo = {
  code: APP_VERSION_CODE,
  name: APP_VERSION_NAME,
  date: APP_VERSION_DATE,
  features: [
    'Master Candidate Database CRM (single profile per candidate across all applications)',
    'Strict AaraTech / ClinisolTech company separation',
    'Automated H1B & Resume Link column detection & splitting during file upload and preview',
    'Subheader-driven auto-mapping (GREEN CARD/ US-C and H1B Visa)',
    'Full recruiter feedback deduplication with verbatim notes preservation',
    'Candidate Profile Drawer with multi-application history and interactive timeline',
    'Comprehensive error boundary protection preventing blank page crashes',
  ],
};
