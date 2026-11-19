import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Plus,
  Building,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Search,
  Filter,
} from 'lucide-react';
import { dbService } from '../services/masterDbService';
import { Job, CompanyName } from '../types/masterDatabase';
import { formatDateDisplay } from '../shared/dateFormat';

interface JobsViewProps {
  initialCompany?: CompanyName | 'All';
}

export const JobsView: React.FC<JobsViewProps> = ({ initialCompany = 'All' }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyName | 'All'>(initialCompany);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // New Job Form State
  const [company, setCompany] = useState<CompanyName>(
    initialCompany === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech'
  );
  const [jobId, setJobId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    if (initialCompany) {
      setSelectedCompany(initialCompany);
      if (initialCompany !== 'All') {
        setCompany(initialCompany);
      }
    }
  }, [initialCompany]);

  const loadJobs = async () => {
    const list = await dbService.getJobs();
    setJobs(list);
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId.trim() || !jobTitle.trim()) return;

    await dbService.addJob({
      company,
      job_id: jobId.trim(),
      job_title: jobTitle.trim(),
      job_url: jobUrl.trim() || null,
      status: 'Active',
    });

    setModalOpen(false);
    setJobId('');
    setJobTitle('');
    setJobUrl('');
    loadJobs();
  };

  const toggleStatus = async (job: Job) => {
    const nextStatus = job.status === 'Active' ? 'Closed' : 'Active';
    await dbService.updateJobStatus(job.id, nextStatus);
    loadJobs();
  };

  // Filter jobs
  const filtered = jobs.filter((j) => {
    const matchesCompany = selectedCompany === 'All' || j.company === selectedCompany;
    const matchesSearch =
      !search ||
      j.job_title.toLowerCase().includes(search.toLowerCase()) ||
      j.job_id.toLowerCase().includes(search.toLowerCase());
    return matchesCompany && matchesSearch;
  });

  const aaraTechCount = jobs.filter((j) => j.company === 'AaraTech').length;
  const clinisolCount = jobs.filter((j) => j.company === 'ClinisolTech').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Company Requisitions &amp; Job Openings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Active Openings: <strong className="text-slate-800">AaraTech</strong> ({aaraTechCount} jobs) •{' '}
            <strong className="text-blue-600">ClinisolTech</strong> ({clinisolCount} jobs) • Total: {jobs.length} jobs
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Job Opening</span>
        </button>
      </div>

      {/* Filter and Tab Pills */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedCompany('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCompany === 'All'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Requisitions ({jobs.length})
          </button>
          <button
            onClick={() => setSelectedCompany('AaraTech')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCompany === 'AaraTech'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            AaraTech ({aaraTechCount})
          </button>
          <button
            onClick={() => setSelectedCompany('ClinisolTech')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCompany === 'ClinisolTech'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            ClinisolTech ({clinisolCount})
          </button>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job title or ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Job ID</th>
                <th className="py-3 px-4">Company</th>
                <th className="py-3 px-4">Job Title</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-mono font-bold text-xs text-blue-600">
                    {j.job_id}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        j.company === 'AaraTech'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {j.company}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900 text-xs">
                    {j.job_title}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        j.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-500">
                    {formatDateDisplay(j.created_at)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => toggleStatus(j)}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                        j.status === 'Active'
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {j.status === 'Active' ? 'Close Slot' : 'Activate Slot'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Job */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Add New Configurable Requisition
            </h3>
            <p className="text-xs text-slate-500">
              Create an operational job requisition for AaraTech or ClinisolTech.
            </p>

            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company
                </label>
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value as CompanyName)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800"
                >
                  <option value="AaraTech">AaraTech</option>
                  <option value="ClinisolTech">ClinisolTech</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job / Requisition ID
                </label>
                <input
                  type="text"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  placeholder="e.g. AT-022 or CT-011"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Title
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Lead Kubernetes Architect"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                >
                  Save Job Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
