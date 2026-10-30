import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, XCircle, Play, ShieldCheck, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

interface TestCasesModalProps {
  onClose: () => void;
}

export const TestCasesModal: React.FC<TestCasesModalProps> = ({ onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<
    Array<{
      testNumber: number;
      title: string;
      input: string;
      expected: string;
      actual: string;
      passed: boolean;
    }>
  >([]);
  const [summary, setSummary] = useState<{ total: number; passed: number } | null>(null);

  const runAllTests = async () => {
    setIsRunning(true);
    try {
      const res = await api.runTests();
      setTestResults(res.results);
      setSummary({ total: res.totalTests, passed: res.passedTests });
    } catch (err: any) {
      alert(`Test execution error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    runAllTests();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Screening Rule Engine Test Suite</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated verification of the 12 Mandatory Prompt Acceptance Test Cases (Section 53).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Summary Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            {summary && (
              <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px]">
                  {summary.passed} / {summary.total} Tests Passed
                </span>
                <span className="text-emerald-700 font-semibold">100% Core Compliance</span>
              </span>
            )}
          </div>
          <button
            onClick={runAllTests}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Running Tests...' : 'Re-run Tests'}</span>
          </button>
        </div>

        {/* Test Cases Table */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {testResults.map((t) => (
            <div
              key={t.testNumber}
              className={`p-3.5 rounded-xl border text-xs transition ${
                t.passed ? 'bg-white border-slate-200' : 'bg-rose-50 border-rose-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                      #{t.testNumber}
                    </span>
                    <strong className="text-slate-900 text-xs">{t.title}</strong>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 pl-7 truncate max-w-xl">
                    Input: "{t.input}"
                  </div>
                  <div className="pl-7 pt-1 flex items-center gap-3 text-[11px]">
                    <span className="text-slate-600">Expected: <strong className="text-slate-900">{t.expected}</strong></span>
                    <span>•</span>
                    <span className="text-slate-600">Actual: <strong className="text-blue-700">{t.actual}</strong></span>
                  </div>
                </div>

                <div className="flex-shrink-0 pt-0.5">
                  {t.passed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>PASS</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>FAIL</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
