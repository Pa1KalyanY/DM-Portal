import React, { useState, useEffect } from 'react';
import {
  GitMerge,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Search,
  User,
  ShieldCheck,
  History,
  FileText,
  Phone,
  Mail,
} from 'lucide-react';
import { dbService } from '../../services/masterDbService';
import { Person, MergeHistory, CompanyName } from '../../types/masterDatabase';

export const MergeCandidatesView: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState<CompanyName>('AaraTech');
  const [people, setPeople] = useState<Person[]>([]);
  const [targetPersonId, setTargetPersonId] = useState<string>('');
  const [sourcePersonId, setSourcePersonId] = useState<string>('');
  const [mergeHistories, setMergeHistories] = useState<MergeHistory[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedCompany]);

  const loadData = async () => {
    try {
      const { candidates } = await dbService.getCandidates({
        page: 1,
        pageSize: 300,
        company: selectedCompany,
      });
      setPeople(candidates);
      setTargetPersonId('');
      setSourcePersonId('');
      const histories = await dbService.getMergeHistories();
      setMergeHistories(histories);
    } catch (e) {
      console.error(e);
    }
  };

  const targetPerson = people.find(p => p.id === targetPersonId);
  const sourcePerson = people.find(p => p.id === sourcePersonId);

  const handleExecuteMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPersonId || !sourcePersonId || targetPersonId === sourcePersonId) {
      setErrorMessage('Please select two distinct candidate profiles to merge.');
      return;
    }

    if (targetPerson?.current_company !== sourcePerson?.current_company) {
      setErrorMessage('Cross-company merging is disabled. AaraTech and ClinisolTech databases are strictly separated.');
      return;
    }

    setErrorMessage(null);
    const success = await dbService.mergeCandidates(targetPersonId, sourcePersonId, 'Admin Recruiter');
    if (success) {
      setSuccessMessage(
        `Successfully merged candidate ${sourcePerson?.person_id} into primary profile ${targetPerson?.person_id} within ${selectedCompany}.`
      );
      setSourcePersonId('');
      loadData();
    } else {
      setErrorMessage('Could not execute merge. Check that both profiles belong to the same company.');
    }
  };

  const handleUnmerge = async (historyId: string) => {
    const success = await dbService.unmergeCandidates(historyId);
    if (success) {
      setSuccessMessage('Candidates successfully unmerged. Identities and separated records have been restored.');
      loadData();
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Admin Candidate Merge &amp; Unmerge Center
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Combine duplicate candidate identities while preserving 100% of historical emails, phones, applications,
          and verbatim recruiter notes. Merges are fully reversible.
        </p>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Merge Selection Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <GitMerge className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Merge Candidate Profiles
          </h2>
        </div>

        <form onSubmit={handleExecuteMerge} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Target Candidate Picker */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                1. Select Primary Candidate (Profile To Keep)
              </label>
              <select
                value={targetPersonId}
                onChange={(e) => setTargetPersonId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">— Choose Primary Person —</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.person_id} — {p.full_name} ({p.primary_email || p.primary_phone || 'No contact'})
                  </option>
                ))}
              </select>

              {targetPerson && (
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200/80 text-xs space-y-1.5">
                  <div className="font-bold text-blue-900">{targetPerson.full_name} ({targetPerson.person_id})</div>
                  <div className="text-slate-600">Emails: {(targetPerson.emails || []).map(e => e.email).join(', ') || 'None'}</div>
                  <div className="text-slate-600">Phones: {(targetPerson.phones || []).map(p => p.phone_original).join(', ') || 'None'}</div>
                  <div className="text-slate-600">Applications: {targetPerson.applications?.length || 0}</div>
                  <div className="text-slate-600">Recruiter Notes: {targetPerson.recruiter_contacts?.length || 0}</div>
                </div>
              )}
            </div>

            {/* Source Candidate Picker */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                2. Select Secondary Candidate (Profile To Merge In)
              </label>
              <select
                value={sourcePersonId}
                onChange={(e) => setSourcePersonId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">— Choose Duplicate Person to Merge —</option>
                {people
                  .filter(p => p.id !== targetPersonId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.person_id} — {p.full_name} ({p.primary_email || p.primary_phone || 'No contact'})
                    </option>
                  ))}
              </select>

              {sourcePerson && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="font-bold text-slate-900">{sourcePerson.full_name} ({sourcePerson.person_id})</div>
                  <div className="text-slate-600">Emails: {(sourcePerson.emails || []).map(e => e.email).join(', ') || 'None'}</div>
                  <div className="text-slate-600">Phones: {(sourcePerson.phones || []).map(p => p.phone_original).join(', ') || 'None'}</div>
                  <div className="text-slate-600">Applications: {sourcePerson.applications?.length || 0}</div>
                  <div className="text-slate-600">Recruiter Notes: {sourcePerson.recruiter_contacts?.length || 0}</div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-700" />
              <span>Full History Preservation Policy</span>
            </div>
            <div>
              Merging moves all historical emails, phones, applications, and recruiter feedback from{' '}
              <strong>{sourcePerson?.person_id || 'Secondary'}</strong> into{' '}
              <strong>{targetPerson?.person_id || 'Primary'}</strong>. No historical row is deleted. An unmerge snapshot
              is permanently archived.
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!targetPersonId || !sourcePersonId}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
            >
              <GitMerge className="w-4 h-4" />
              <span>
                Execute Merge into {targetPerson?.person_id || 'Primary'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Merged Candidates History & Unmerge Tool */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Merge Audit Log &amp; Reversible Unmerge
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {mergeHistories.length} historical merges recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Merge ID</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Primary Master Target</th>
                <th className="py-3 px-4">Merged Secondary Profile</th>
                <th className="py-3 px-4">Rule &amp; Reason</th>
                <th className="py-3 px-4">Merged By</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mergeHistories.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-400">
                    No candidate merges on record.
                  </td>
                </tr>
              ) : (
                mergeHistories.map((h) => {
                  const sourceSnap = h.snapshot?.source || h.snapshot || {};
                  const targetSnap = h.snapshot?.target || {};
                  const sourceHumanId = sourceSnap.person_id || h.merged_person_id;
                  const sourceName = sourceSnap.full_name || 'Candidate';
                  const targetHumanId = targetSnap.person_id || (people.find(p => p.id === h.primary_person_id)?.person_id) || h.primary_person_id;
                  const targetName = targetSnap.full_name || (people.find(p => p.id === h.primary_person_id)?.full_name) || '';

                  return (
                    <tr key={h.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {h.id.slice(0, 8)}...
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {h.is_automatic ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ⚡ Auto
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                            👤 Manual
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-blue-600 text-xs">
                        {targetHumanId} {targetName ? `(${targetName})` : ''}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 text-xs">
                        {sourceName} ({sourceHumanId})
                      </td>
                      <td className="py-3 px-4 text-xs max-w-xs truncate" title={h.decision_reason || h.decision_rule}>
                        <div className="font-mono text-[11px] text-slate-700">{h.decision_rule || 'Recruiter Verified'}</div>
                        <div className="text-[11px] text-slate-400 truncate">{h.decision_reason}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {h.merged_by}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-500">
                        {new Date(h.merged_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        {h.can_unmerge ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-500">
                            Unmerged
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {h.can_unmerge && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Unmerge and restore profile ${sourceHumanId} (${sourceName})? All original applications, feedback, and contacts will be surgically restored to their original profile.`)) {
                                handleUnmerge(h.id);
                              }
                            }}
                            className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-bold transition-colors inline-flex items-center gap-1"
                            title="Restores candidate profile, applications, notes, and contacts"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Unmerge</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
