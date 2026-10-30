import React, { useState, useEffect } from 'react';
import { Briefcase, Users, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { NavTab } from '../components/Sidebar';

interface JobsViewProps {
  onSelectJob: (jobTitle: string) => void;
}

export const JobsView: React.FC<JobsViewProps> = ({ onSelectJob }) => {
  const [jobs, setJobs] = useState<
    Array<{
      jobTitle: string;
      jobId: string;
      total: number;
      passed: number;
      failed: number;
      manualReview: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const data = await api.getJobs();
        setJobs(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Job Requisitions Summary</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Aggregated applicant volumes and screening pass rates grouped across active job postings.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading jobs data...</div>
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
          No job requisitions found. Upload LinkedIn XLSX files to view grouped summaries.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {jobs.map((job, idx) => {
            const passPct = job.total > 0 ? Math.round((job.passed / job.total) * 100) : 0;
            return (
              <div
                key={idx}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-blue-300 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">{job.jobTitle}</h3>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">Job ID: {job.jobId}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex-shrink-0">
                      {job.total.toLocaleString()}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Screening Pass Rate</span>
                      <strong className="text-emerald-700">{passPct}%</strong>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full"
                        style={{ width: `${job.total > 0 ? (job.passed / job.total) * 100 : 0}%` }}
                      ></div>
                      <div
                        className="bg-rose-500 h-full"
                        style={{ width: `${job.total > 0 ? (job.failed / job.total) * 100 : 0}%` }}
                      ></div>
                      <div
                        className="bg-amber-500 h-full"
                        style={{ width: `${job.total > 0 ? (job.manualReview / job.total) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Stat Breakdown Grid */}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded bg-emerald-50 text-emerald-800">
                      <div className="text-[10px] font-semibold text-emerald-600">PASS</div>
                      <div className="font-bold text-sm mt-0.5">{job.passed}</div>
                    </div>
                    <div className="p-2 rounded bg-rose-50 text-rose-800">
                      <div className="text-[10px] font-semibold text-rose-600">FAIL</div>
                      <div className="font-bold text-sm mt-0.5">{job.failed}</div>
                    </div>
                    <div className="p-2 rounded bg-amber-50 text-amber-800">
                      <div className="text-[10px] font-semibold text-amber-600">REVIEW</div>
                      <div className="font-bold text-sm mt-0.5">{job.manualReview}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => onSelectJob(job.jobTitle)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    <span>View Applicants</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
