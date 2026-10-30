import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CompanyName } from '../types/masterDatabase';
import { authService, UserSession } from '../services/authService';
import { checkSupabaseHealth, HealthCheckResult } from '../services/supabase';

export type ApplicationArea = 'portal' | 'recruitment';

interface WorkspaceContextType {
  user: UserSession | null;
  // Independent Application Area
  activeArea: ApplicationArea;
  setActiveArea: (area: ApplicationArea) => void;
  // Independent Recruitment Company Context
  recruitmentCompany: CompanyName;
  setRecruitmentCompany: (company: CompanyName) => void;
  // Backwards compatibility aliases for existing recruitment views
  activeCompany: CompanyName;
  setActiveCompany: (company: CompanyName) => void;
  availableCompanies: CompanyName[];
  isDualCompany: boolean;
  hasSelectedWorkspace: boolean;
  selectWorkspace: (company: CompanyName) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  supabaseStatus: HealthCheckResult | null;
  refreshSupabase: (companyToTest?: CompanyName) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const RECRUITMENT_COMPANY_KEY = 'aat_recruitment_company';
const COMPANY_STORAGE_KEY = 'aat_active_company';
const ACTIVE_AREA_KEY = 'aat_active_area';
const WORKSPACE_SELECTED_KEY = 'aat_workspace_selected';

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(() => authService.getCurrentSession());

  // Independent Application Area ('portal' for Shared DM Portal, 'recruitment' for Recruitment Workspace)
  const [activeArea, setActiveAreaState] = useState<ApplicationArea>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const rawSec = params.get('section') || params.get('view') || params.get('page');
      if (rawSec) {
        if (rawSec === 'home' || rawSec === 'marketing' || rawSec === 'settings') {
          return 'portal';
        }
        if (['recruitment-overview', 'filter', 'master-candidates', 'reports', 'company-settings'].includes(rawSec)) {
          return 'recruitment';
        }
      }
    }
    const stored = localStorage.getItem(ACTIVE_AREA_KEY);
    if (stored === 'portal' || stored === 'recruitment') {
      return stored as ApplicationArea;
    }
    return 'portal';
  });

  // Independent Recruitment Company ('AaraTech' | 'ClinisolTech')
  const [recruitmentCompany, setRecruitmentCompanyState] = useState<CompanyName>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlComp = params.get('company');
      if (urlComp === 'ClinisolTech' || urlComp === 'AaraTech') {
        return urlComp as CompanyName;
      }
    }
    const stored = localStorage.getItem(RECRUITMENT_COMPANY_KEY) || localStorage.getItem(COMPANY_STORAGE_KEY);
    if (stored === 'ClinisolTech' || stored === 'AaraTech') {
      return stored as CompanyName;
    }
    return 'AaraTech';
  });

  const [hasSelectedWorkspace, setHasSelectedWorkspace] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlComp = params.get('company');
      if (urlComp === 'ClinisolTech' || urlComp === 'AaraTech') {
        return true;
      }
    }
    return localStorage.getItem(WORKSPACE_SELECTED_KEY) === 'true';
  });

  const [supabaseStatus, setSupabaseStatus] = useState<HealthCheckResult | null>(null);

  const availableCompanies: CompanyName[] =
    user?.company === 'Both' || !user
      ? ['AaraTech', 'ClinisolTech']
      : [user.company as CompanyName];

  const isDualCompany = availableCompanies.length > 1;

  const setActiveArea = (area: ApplicationArea) => {
    setActiveAreaState(area);
    localStorage.setItem(ACTIVE_AREA_KEY, area);
  };

  const setRecruitmentCompany = (company: CompanyName) => {
    setRecruitmentCompanyState(company);
    localStorage.setItem(RECRUITMENT_COMPANY_KEY, company);
    // Keep backwards-compatible key updated as well
    localStorage.setItem(COMPANY_STORAGE_KEY, company);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('company', company);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  };

  const selectWorkspace = (company: CompanyName) => {
    setRecruitmentCompany(company);
    setHasSelectedWorkspace(true);
    localStorage.setItem(WORKSPACE_SELECTED_KEY, 'true');
  };

  const refreshSupabase = async (companyToTest?: CompanyName) => {
    try {
      const targetCompany = companyToTest || recruitmentCompany;
      const res = await checkSupabaseHealth(targetCompany);
      setSupabaseStatus(res);
    } catch {
      setSupabaseStatus({
        connected: false,
        status: 'error',
        message: 'Could not connect to Supabase',
        timestamp: new Date().toLocaleTimeString(),
        company: companyToTest || recruitmentCompany,
      });
    }
  };

  useEffect(() => {
    refreshSupabase(recruitmentCompany);
  }, [recruitmentCompany]);

  const login = async (email: string, password: string) => {
    const res = await authService.signIn(email, password);
    if (res.success && res.user) {
      setUser(res.user);
      if (res.user.company === 'AaraTech' || res.user.company === 'ClinisolTech') {
        setRecruitmentCompany(res.user.company);
        setHasSelectedWorkspace(true);
        localStorage.setItem(WORKSPACE_SELECTED_KEY, 'true');
      } else {
        // User has access to both; restore last authorized workspace if present
        const saved = (localStorage.getItem(RECRUITMENT_COMPANY_KEY) || localStorage.getItem(COMPANY_STORAGE_KEY)) as CompanyName;
        if (saved === 'AaraTech' || saved === 'ClinisolTech') {
          setRecruitmentCompany(saved);
          setHasSelectedWorkspace(true);
          localStorage.setItem(WORKSPACE_SELECTED_KEY, 'true');
        } else {
          setHasSelectedWorkspace(false);
          localStorage.removeItem(WORKSPACE_SELECTED_KEY);
        }
      }
      return { success: true };
    }
    return { success: false, error: res.error || 'Authentication failed' };
  };

  const logout = async () => {
    await authService.signOut();
    setUser(null);
    setHasSelectedWorkspace(false);
    localStorage.removeItem(WORKSPACE_SELECTED_KEY);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        user,
        activeArea,
        setActiveArea,
        recruitmentCompany,
        setRecruitmentCompany,
        activeCompany: recruitmentCompany,
        setActiveCompany: setRecruitmentCompany,
        availableCompanies,
        isDualCompany,
        hasSelectedWorkspace,
        selectWorkspace,
        login,
        logout,
        supabaseStatus,
        refreshSupabase,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

