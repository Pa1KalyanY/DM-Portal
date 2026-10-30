import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Clock,
  Coffee,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Layers,
  FileText
} from 'lucide-react';
import { MarketingService, INITIAL_MARKETING_TEAM } from '../../services/marketingService';
import { MarketingMember, MarketingPortalSettings, BreakType } from '../../types/marketing';

export const DmPortalSettingsView: React.FC = () => {
  const [teamMembers, setTeamMembers] = useState<MarketingMember[]>(INITIAL_MARKETING_TEAM);
  const [settings, setSettings] = useState<MarketingPortalSettings>(() =>
    MarketingService.getPortalSettings()
  );

  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Marketing Specialist');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    MarketingService.getMembers().then(setTeamMembers);
    setSettings(MarketingService.getPortalSettings());
  }, []);

  const handleSavePolicy = (updated: MarketingPortalSettings) => {
    setSettings(updated);
    MarketingService.savePortalSettings(updated);
    setSaveSuccess('Shared portal policy updated successfully.');
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;

    setIsAddingMember(true);
    const newMember: MarketingMember = {
      id: `mkt-${Date.now()}`,
      name: newMemberName.trim(),
      email: newMemberEmail.trim(),
      designation: newMemberRole.trim(),
      companyAccess: ['AaraTech', 'ClinisolTech'],
      isActive: true,
      avatarInitials: newMemberName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
    };

    const updatedList = [...teamMembers, newMember];
    setTeamMembers(updatedList);
    localStorage.setItem('aat_mkt_members_v1', JSON.stringify(updatedList));

    setNewMemberName('');
    setNewMemberEmail('');
    setIsAddingMember(false);
    setSaveSuccess(`Added ${newMember.name} to the shared marketing roster.`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const toggleBreakType = (type: BreakType) => {
    const current = settings.allowedBreakTypes || [];
    const exists = current.includes(type);
    const next = exists
      ? current.filter((t) => t !== type)
      : [...current, type];
    handleSavePolicy({ ...settings, allowedBreakTypes: next });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Shared DM Portal Identity */}
      <div className="card-premium p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge-info flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                <span>Shared DM Portal Settings</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-500">Cross-Company Marketing Operations</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
              DM Team, Roles &amp; Portal Preferences
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure the shared 5-member digital marketing roster, attendance compliance policies, and common portal rules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Shared Workspace Scope
            </span>
          </div>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fade-in font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Main Grid: Team Roster & Policy Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Shared Marketing Team Roster */}
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Shared Marketing Team Roster ({teamMembers.length})</span>
              </h2>
              <p className="text-xs text-slate-500">
                Authorized marketing personnel with cross-company operational permissions.
              </p>
            </div>
          </div>

          {/* Add Team Member Form */}
          <form onSubmit={handleAddMember} className="p-3 bg-[#F7F9FC] border border-[#E0E6EF] rounded-lg space-y-2.5 text-xs">
            <span className="font-semibold text-[#18243A] block">Add Team Member</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Full Name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-[#E0E6EF] rounded text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9]"
                required
              />
              <input
                type="email"
                placeholder="Email Address"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-[#E0E6EF] rounded text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9]"
                required
              />
              <input
                type="text"
                placeholder="Role / Title"
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-[#E0E6EF] rounded text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9]"
                required
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isAddingMember}
                className="btn-primary !text-xs !py-1.5 shadow-xs disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            </div>
          </form>

          {/* Members List */}
          <div className="space-y-2">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="p-3 rounded-lg border border-[#E0E6EF] bg-[#F7F9FC] hover:bg-[#F4F7FD] flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#E8EDFA] text-[#2948BC] font-bold flex items-center justify-center text-xs shrink-0">
                    {member.avatarInitials || member.name[0]}
                  </div>
                  <div className="truncate">
                    <div className="font-semibold text-[#18243A] leading-tight truncate">
                      {member.name}
                    </div>
                    <div className="text-[11px] text-[#65738B] truncate">
                      {member.designation} &bull; <span className="font-mono text-[10px]">{member.email}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {member.companyAccess.map((c) => (
                    <span
                      key={c}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#E0E6EF] text-[#65738B] uppercase"
                    >
                      {c}
                    </span>
                  ))}
                  <span className="badge-pass ml-1">
                    ACTIVE
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Attendance Policies & Shared Roles */}
        <div className="space-y-6">
          {/* Attendance & Break Policies */}
          <div className="card-premium p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Attendance &amp; Break Compliance Policies</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Portal-wide work hour standards and break duration thresholds.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Daily Break Time Allowance (Minutes)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="15"
                    max="180"
                    step="5"
                    value={settings.maxDailyBreakMinutes}
                    onChange={(e) =>
                      handleSavePolicy({
                        ...settings,
                        maxDailyBreakMinutes: parseInt(e.target.value) || 60,
                      })
                    }
                    className="w-32 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-slate-500 text-[11px]">
                    Alerts trigger when total break time exceeds this limit.
                  </span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Standard Work Hours Requirement
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="4"
                    max="12"
                    step="0.5"
                    value={settings.standardWorkHoursPerDay}
                    onChange={(e) =>
                      handleSavePolicy({
                        ...settings,
                        standardWorkHoursPerDay: parseFloat(e.target.value) || 8,
                      })
                    }
                    className="w-32 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-slate-500 text-[11px]">
                    Expected daily logged working hours per marketing member.
                  </span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Allowed Break Types
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['Lunch', 'Tea Break', 'Personal', 'Other'] as BreakType[]).map((type) => {
                    const isChecked = settings.allowedBreakTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleBreakType(type)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {isChecked ? '✓ ' : '+ '}
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-700">Require Daily EOD Report</span>
                <input
                  type="checkbox"
                  checked={settings.requireEodReport}
                  onChange={(e) =>
                    handleSavePolicy({
                      ...settings,
                      requireEodReport: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Shared Portal Roles & Preferences */}
          <div className="card-premium p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>Shared DM Portal Operational Roles</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authorized roles and capabilities across marketing channels and approvals.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60">
                <div className="font-bold text-slate-900">Marketing Lead (Admin)</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Full management of attendance, break overrides, content publishing approval, and campaign roadmap.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60">
                <div className="font-bold text-slate-900">Content &amp; Social Specialists</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Drafting articles, scheduling LinkedIn/X updates, managing task Kanban, and submitting daily EOD reports.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60">
                <div className="font-bold text-slate-900">Creative &amp; Performance Specialists</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Design deliverable tracking, SEO keyword audits, and candidate acquisition campaign performance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
