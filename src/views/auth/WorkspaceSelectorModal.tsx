import React from 'react';
import { Building2, Stethoscope, ArrowRight, Layers, CheckCircle2, LogOut } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { CompanyName } from '../../types/masterDatabase';

export const WorkspaceSelectorModal: React.FC = () => {
  const { user, selectWorkspace, logout } = useWorkspace();

  const handleSelect = (company: CompanyName) => {
    selectWorkspace(company);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-5 bg-slate-50/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 tracking-tight">DM Portal</h1>
                <p className="text-xs text-slate-500">Recruitment & Operations Platform</p>
              </div>
            </div>
            {user && (
              <span className="text-xs text-slate-500 font-medium bg-white px-2.5 py-1 rounded-md border border-slate-200">
                {user.name}
              </span>
            )}
          </div>
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-slate-800">Select Company Workspace</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose your target organization to load job requisitions and candidate records.
            </p>
          </div>
        </div>

        {/* Company Cards Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white">
          {/* AaraTech Card */}
          <div
            onClick={() => handleSelect('AaraTech')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSelect('AaraTech'); }}
            className="group border border-slate-200 hover:border-blue-500 rounded-xl p-4 cursor-pointer transition-all hover:shadow-md bg-white hover:bg-blue-50/20 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                  <Building2 className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  21 Job Slots
                </span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                AaraTech
              </h3>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                Cloud Engineering, Enterprise Software, DevOps, and Technical Recruitment.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-600 group-hover:text-blue-700">
              <span>Open Workspace</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* ClinisolTech Card */}
          <div
            onClick={() => handleSelect('ClinisolTech')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSelect('ClinisolTech'); }}
            className="group border border-slate-200 hover:border-emerald-500 rounded-xl p-4 cursor-pointer transition-all hover:shadow-md bg-white hover:bg-emerald-50/20 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  10 Job Slots
                </span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                ClinisolTech
              </h3>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                Clinical Research, SAS Programming, Pharmacovigilance, and Healthcare.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-600 group-hover:text-emerald-700">
              <span>Open Workspace</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Company data is strictly isolated per workspace.</span>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-600 transition-colors font-medium"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
