import React, { useState, useEffect } from 'react';
import { Settings, Shield, History, User, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { AuditLogEntry } from '../types';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await api.getAuditLogs();
        setLogs(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Settings & Security Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">System Settings & Audit Log</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable audit log of all batch file uploads and manual review decisions.
            </p>
          </div>
        </div>

        {/* System Details */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-400 font-semibold block text-[11px]">Database Engine</span>
            <strong className="text-slate-900 font-bold mt-1 block">Local SQLite Sync (Node 22)</strong>
            <span className="text-[10px] text-emerald-600 font-semibold">Indexed & Persistent</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-400 font-semibold block text-[11px]">Modular Cloud Adapter</span>
            <strong className="text-slate-900 font-bold mt-1 block">Supabase Ready (Phase 1 Schema)</strong>
            <span className="text-[10px] text-blue-600 font-semibold">Exported to supabase_schema.sql</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-400 font-semibold block text-[11px]">Compliance Guardrail</span>
            <strong className="text-slate-900 font-bold mt-1 block">Zero Ethnicity / AI Inference</strong>
            <span className="text-[10px] text-purple-600 font-semibold">Strict Deterministic Logic</span>
          </div>
        </div>
      </div>

      {/* Audit Trail Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Audit Trail Events ({logs.length})</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-100/70 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-3">User</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Subject</th>
                <th className="py-3 px-3">State Transition</th>
                <th className="py-3 px-4">Reason & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">Loading audit records...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No audit records registered yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{log.user}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold text-blue-700">
                      {log.action}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {log.applicantName || 'Batch System'}
                    </td>
                    <td className="py-3 px-3">
                      {log.previousResult && log.newResult ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <StatusBadge status={log.previousResult} size="sm" showIcon={false} />
                          <span className="text-slate-400">→</span>
                          <StatusBadge status={log.newResult} size="sm" showIcon={false} />
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="font-medium text-slate-900">{log.reason}</div>
                      {log.details && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{log.details}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
