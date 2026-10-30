import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, AlertCircle, ToggleLeft, ToggleRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { ScreeningRule } from '../types';
import { api } from '../api/client';

export const ScreeningRulesView: React.FC = () => {
  const [rules, setRules] = useState<ScreeningRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [reevaluating, setReevaluating] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await api.getScreeningRules();
      setRules(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleToggleOptionalRule = async (rule: ScreeningRule) => {
    if (rule.isMandatory) {
      alert('Mandatory screening rules cannot be disabled. They are required by company screening policy.');
      return;
    }
    const newStatus = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.updateScreeningRule(rule.id, { status: newStatus });
      fetchRules();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReevaluateAll = async () => {
    setReevaluating(true);
    try {
      const res = await api.reevaluateAll();
      alert(`Screening Re-Evaluation Complete!\n\nTotal Applicants: ${res.summary.total}\nPassed: ${res.summary.passed}\nFailed: ${res.summary.failed}\nManual Review: ${res.summary.manualReview}`);
    } catch (err: any) {
      alert(`Re-evaluation error: ${err.message}`);
    } finally {
      setReevaluating(false);
    }
  };

  const mandatoryRules = rules.filter((r) => r.isMandatory);
  const optionalRules = rules.filter((r) => !r.isMandatory);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Screening Rules Administration</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic rule criteria applied to raw LinkedIn Screening Questions column.
              </p>
            </div>
          </div>

          <button
            onClick={handleReevaluateAll}
            disabled={reevaluating}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50 shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reevaluating ? 'animate-spin' : ''}`} />
            <span>{reevaluating ? 'Re-evaluating...' : 'Re-screen All Applicants'}</span>
          </button>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed">
          <strong>Non-Negotiable Policy:</strong> Both mandatory screening requirements must pass for an applicant to receive an overall <strong>PASS</strong> status. Any failure produces <strong>FAIL</strong>. Missing, blank, or unclear answers produce <strong>MANUAL REVIEW</strong>.
        </div>
      </div>

      {/* Mandatory Rules (Section 16) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Locked Core Criteria</span>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">MANDATORY SCREENING RULES</h3>
          </div>
          <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>Strictly Enforced</span>
          </span>
        </div>

        <div className="space-y-3">
          {mandatoryRules.map((rule, idx) => (
            <div key={rule.id} className="p-4 rounded-xl border border-blue-100 bg-blue-50/30 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <h4 className="text-xs font-bold text-slate-900">{rule.name}</h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Required: {rule.requiredAnswer}
                  </span>
                </div>
                <p className="text-xs text-slate-600 pl-7">{rule.description}</p>
                <div className="pl-7 pt-1 text-[11px] text-slate-400">
                  Matches normalized variations of question wording, capitalization, punctuation, and extra spaces.
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> ACTIVE
                </span>
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 ml-1">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optional Rules */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Secondary Criteria</span>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">OPTIONAL / CONFIGURABLE RULES</h3>
          </div>
        </div>

        <div className="space-y-3">
          {optionalRules.map((rule, idx) => (
            <div key={rule.id} className="p-4 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center">
                    {idx + 3}
                  </span>
                  <h4 className="text-xs font-bold text-slate-900">{rule.name}</h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                    Required: {rule.requiredAnswer}
                  </span>
                </div>
                <p className="text-xs text-slate-600 pl-7">{rule.description}</p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleToggleOptionalRule(rule)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    rule.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {rule.status === 'ACTIVE' ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                  <span>{rule.status}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
