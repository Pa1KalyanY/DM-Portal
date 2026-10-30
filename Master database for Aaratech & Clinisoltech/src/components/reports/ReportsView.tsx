import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  FileSpreadsheet,
  PhoneCall,
  GitMerge,
  AlertTriangle,
  Building,
  TrendingUp,
} from 'lucide-react';
import { dbService } from '../../lib/dbService';
import { ImportRecord, AuditLog } from '../../types/database';

export const ReportsView: React.FC = () => {
  const [stats, setStats] = useState({
    totalPeople: 0,
    totalApplications: 0,
    recruiterContacts: 0,
    possibleMatches: 0,
    filesImported: 0,
    companyBreakdown: { AaraTech: 0, ClinisolTech: 0 },
    statusCounts: {} as Record<string, number>,
  });
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    loadReportsData();
  }, []);

  const loadReportsData = async () => {
    const s = await dbService.getDashboardStats();
    setStats(s);
    const imps = await dbService.getImports();
    setImports(imps);
    const logs = await dbService.getAuditLogs();
    setAuditLogs(logs);
  };

  const totalRowsProcessed = imports.reduce((acc, i) => acc + i.processed_rows, 0);
  const totalErrors = imports.reduce((acc, i) => acc + i.errors, 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Recruiting Operations &amp; Database Health Reports
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Operational reporting on candidate pipeline volume, deduplication metrics, and historical import traceability.
        </p>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Master People</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {stats.totalPeople.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">Unique consolidated profiles</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Applications</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">
            {stats.totalApplications.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">Total submissions tracked</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Verbatim Contacts</div>
          <div className="text-2xl font-bold text-emerald-600 mt-2">
            {stats.recruiterContacts.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">Touchpoints without AI alteration</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">Rows Ingested</div>
          <div className="text-2xl font-bold text-purple-600 mt-2">
            {totalRowsProcessed.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">Across {imports.length} files</div>
        </div>
      </div>

      {/* Operational Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Operational Status Breakdown
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.statusCounts).map(([st, count]) => (
              <div key={st}>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>{st}</span>
                  <span>{count} ({stats.totalPeople ? Math.round((count / stats.totalPeople) * 100) : 0}%)</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{
                      width: `${stats.totalPeople ? Math.round((count / stats.totalPeople) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Company Distribution
          </h3>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 text-sm">AaraTech Requisitions</div>
                <div className="text-xs text-slate-500 mt-0.5">IT, DevOps, CyberSecurity &amp; Development</div>
              </div>
              <div className="text-xl font-bold text-blue-600">{stats.companyBreakdown.AaraTech}</div>
            </div>

            <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 text-sm">ClinisolTech Requisitions</div>
                <div className="text-xs text-slate-500 mt-0.5">Clinical Data, Biostats, SAS &amp; GxP Trials</div>
              </div>
              <div className="text-xl font-bold text-indigo-600">{stats.companyBreakdown.ClinisolTech}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Import Log */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Historical Import Ledger
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {imports.length} datasets registered
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Batch ID</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Total Rows</th>
                <th className="py-3 px-4">New Profiles</th>
                <th className="py-3 px-4">Duplicates Resolved</th>
                <th className="py-3 px-4">Flags</th>
                <th className="py-3 px-4">Errors</th>
                <th className="py-3 px-4">Imported At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((imp) => (
                <tr key={imp.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-mono font-bold text-xs text-slate-800">{imp.id}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900 text-xs">{imp.file_name}</td>
                  <td className="py-3 px-4 text-xs font-mono">{imp.total_rows.toLocaleString()}</td>
                  <td className="py-3 px-4 text-xs font-semibold text-emerald-600">+{imp.new_people}</td>
                  <td className="py-3 px-4 text-xs font-semibold text-blue-600">{imp.matched_people}</td>
                  <td className="py-3 px-4 text-xs font-semibold text-amber-600">{imp.possible_matches}</td>
                  <td className="py-3 px-4 text-xs font-semibold text-rose-600">{imp.errors}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-500">
                    {new Date(imp.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
